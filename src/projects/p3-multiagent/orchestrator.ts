import { z } from "zod";
import { runAgent, type AgentResult } from "@/core/agent";
import { costUsd } from "@/core/cost";
import { snapshotDb, type Db } from "@/core/db";
import { publicErrorMessage, type ChatMessage, type LlmClient } from "@/core/llm";
import { workerPrompt } from "@/core/prompt";
import { createToolContext, type ToolContext } from "@/core/tools";
import { createTrace, nowIso, type RunMetrics, type TraceEvent } from "@/core/trace";
import type { AgentFlags, AgentStatus, ToolCallRecord } from "@/core/types";
import type { ModelPrice } from "../../../config/pricing";
import { WORKER_TOOLS, createMutex, planRounds, type PlannedSubtask, type WorkerName } from "./workers";

const planSchema = z.object({
  subtasks: z
    .array(
      z.object({
        id: z.string().min(1),
        worker: z.enum(["lookup", "refund", "address", "summary"]),
        instruction: z.string().min(1),
        dependsOn: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(8),
});

const PLAN_PROMPT = `Split the customer request into subtasks for these workers: lookup (get_order, search_orders), refund (refund), address (update_address), summary (no tools, writes text).
Return JSON only: {"subtasks":[{"id":"s1","worker":"lookup","instruction":"...","dependsOn":[]}]}
Use dependsOn when a later subtask needs an earlier result. Leave dependsOn empty when subtasks can run together. Put a summary subtask last and list the other ids in its dependsOn. Use at most 6 subtasks.`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced?.[1] ?? trimmed) as unknown;
}

const WORST: AgentStatus[] = ["error", "safety_cap", "loop_detected", "budget_exceeded", "step_limit", "completed"];

function worse(current: AgentStatus, next: AgentStatus): AgentStatus {
  return WORST.indexOf(next) < WORST.indexOf(current) ? next : current;
}

export async function runMultiAgent(input: {
  userMessage: string;
  flags: AgentFlags;
  db: Db;
  llm: LlmClient;
  model: string;
  onEvent?: (event: TraceEvent) => void;
  requestId: string;
  runId?: string;
  pricing?: Record<string, ModelPrice | null>;
  signal?: AbortSignal;
}): Promise<AgentResult> {
  const started = Date.now();
  const source = "lead";
  const trace = createTrace(input.onEvent);
  const runId = input.runId ?? input.requestId;
  const toolContext: ToolContext = createToolContext({
    db: input.db,
    runId,
    requestId: input.requestId,
    idempotentRefunds: input.flags.idempotentRefunds,
    flakySearch: input.flags.flakySearch,
    refundTimeoutOnce: input.flags.refundTimeoutOnce,
  });
  const lock = createMutex();
  let steps = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  const toolCalls: ToolCallRecord[] = [];
  let status: AgentStatus = "completed";
  let escalated = false;
  let ticketId: number | null = null;
  const workerNotes: string[] = [];

  const record = (result: AgentResult) => {
    steps += result.steps;
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;
    cost += result.costUsd;
    toolCalls.push(...result.toolCalls);
    if (result.status !== "completed") status = worse(status, result.status);
    if (result.escalated) {
      escalated = true;
      ticketId = result.ticketId;
    }
  };

  const planMessages: ChatMessage[] = [
    { role: "system", content: PLAN_PROMPT },
    { role: "user", content: input.userMessage },
  ];

  let subtasks: PlannedSubtask[] = [];
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      steps += 1;
      trace.emit({ type: "step", step: steps, source, at: nowIso() });
      const completion = await input.llm.complete({
        model: input.model,
        messages: planMessages,
        tools: [],
        temperature: 0,
        jsonObject: true,
      });
      inputTokens += completion.usage.inputTokens;
      outputTokens += completion.usage.outputTokens;
      cost += costUsd(input.model, completion.usage.inputTokens, completion.usage.outputTokens, input.pricing);
      trace.emit({
        type: "llm",
        step: steps,
        source,
        inputTokens: completion.usage.inputTokens,
        outputTokens: completion.usage.outputTokens,
        finishReason: completion.finishReason,
        at: nowIso(),
      });
      try {
        const parsed = planSchema.parse(extractJson(completion.message.content ?? ""));
        subtasks = parsed.subtasks.map((task) => ({
          id: task.id,
          worker: task.worker as WorkerName,
          instruction: task.instruction,
          dependsOn: task.dependsOn ?? [],
        }));
        break;
      } catch (error) {
        planMessages.push(completion.message);
        planMessages.push({
          role: "user",
          content: `That JSON was invalid (${publicErrorMessage(error)}). Return only the JSON object.`,
        });
      }
    }
  } catch (error) {
    status = "error";
    trace.emit({ type: "error", source, message: publicErrorMessage(error), at: nowIso() });
  }

  if (subtasks.length === 0 && status === "completed") status = "error";

  const planned = planRounds(subtasks);
  const outputs = new Map<string, string>();
  for (const round of planned.rounds) {
    const results = await Promise.all(
      round.map(async (task) => {
        const prior = task.dependsOn
          .map((id) => `${id}: ${outputs.get(id) ?? "no output"}`)
          .join("\n");
        const instruction = prior ? `${task.instruction}\n\nEarlier results:\n${prior}` : task.instruction;
        const result = await runAgent({
          userMessage: instruction,
          flags: input.flags,
          db: input.db,
          llm: input.llm,
          model: input.model,
          onEvent: trace.emit,
          requestId: input.requestId,
          runId,
          systemPrompt: workerPrompt(task.worker),
          allowedTools: WORKER_TOOLS[task.worker],
          source: `worker:${task.worker}:${task.id}`,
          toolContext,
          pricing: input.pricing,
          emitFinal: false,
          lock,
          signal: input.signal,
        });
        return { task, result };
      }),
    );
    for (const { task, result } of results) {
      record(result);
      outputs.set(task.id, result.finalReply);
      workerNotes.push(`${task.id} (${task.worker}): ${result.finalReply}`);
    }
  }
  if (planned.unfinished.length > 0) {
    workerNotes.push(`Unfinished after 3 rounds: ${planned.unfinished.map((task) => task.id).join(", ")}`);
    if (status === "completed") status = "step_limit";
  }

  let reply = workerNotes.join("\n");
  if (status !== "error") {
    try {
      steps += 1;
      trace.emit({ type: "step", step: steps, source, at: nowIso() });
      const completion = await input.llm.complete({
        model: input.model,
        messages: [
          {
            role: "system",
            content: "Write the final customer reply from the worker notes. Do not call tools. Do not invent orders that are not in the notes.",
          },
          { role: "user", content: `Customer: ${input.userMessage}\n\nWorker notes:\n${workerNotes.join("\n")}` },
        ],
        tools: [],
        temperature: 0,
      });
      inputTokens += completion.usage.inputTokens;
      outputTokens += completion.usage.outputTokens;
      cost += costUsd(input.model, completion.usage.inputTokens, completion.usage.outputTokens, input.pricing);
      trace.emit({
        type: "llm",
        step: steps,
        source,
        inputTokens: completion.usage.inputTokens,
        outputTokens: completion.usage.outputTokens,
        finishReason: completion.finishReason,
        at: nowIso(),
      });
      reply = completion.message.content?.trim() || reply;
    } catch (error) {
      status = "error";
      trace.emit({ type: "error", source, message: publicErrorMessage(error), at: nowIso() });
    }
  }

  if (!reply.trim()) reply = "I could not complete a plan for that request.";
  const db = await snapshotDb(input.db);
  const metrics: RunMetrics = {
    steps,
    inputTokens,
    outputTokens,
    tokens: inputTokens + outputTokens,
    costUsd: cost,
    latencyMs: Date.now() - started,
    toolCalls,
    escalated,
  };
  trace.emit({ type: "final", source, status, reply, metrics, db, at: nowIso() });
  return {
    finalReply: reply,
    status,
    steps,
    inputTokens,
    outputTokens,
    tokens: inputTokens + outputTokens,
    costUsd: cost,
    latencyMs: metrics.latencyMs,
    toolCalls,
    trace: trace.events,
    escalated,
    ticketId,
    db,
  };
}
