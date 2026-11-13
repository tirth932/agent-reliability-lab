import { randomUUID } from "node:crypto";
import { costUsd } from "./cost";
import { snapshotDb, type Db } from "./db";
import { publicErrorMessage, type ChatMessage, type LlmClient } from "./llm";
import { SYSTEM_PROMPT } from "./prompt";
import { definitionsFor, executeTool, createToolContext, type ToolContext, type ToolName } from "./tools";
import { createTrace, nowIso, type RunMetrics, type TraceEvent } from "./trace";
import { hitBudget } from "@/projects/p1-guardrails/budget";
import { escalate, fallbackReply } from "@/projects/p1-guardrails/escalate";
import { LoopDetector } from "@/projects/p1-guardrails/loopDetector";
import { hitSafetyCap, hitStepLimit } from "@/projects/p1-guardrails/stepLimit";
import {
  DEFAULT_FLAGS,
  type AgentFlags,
  type AgentStatus,
  type DbSnapshot,
  type ToolCallRecord,
} from "./types";
import type { ModelPrice } from "../../config/pricing";

export type AgentRunInput = {
  userMessage: string;
  flags?: Partial<AgentFlags>;
  db: Db;
  llm: LlmClient;
  model: string;
  onEvent?: (event: TraceEvent) => void;
  requestId?: string;
  runId?: string;
  systemPrompt?: string;
  allowedTools?: readonly ToolName[];
  source?: string;
  toolContext?: ToolContext;
  pricing?: Record<string, ModelPrice | null>;
  /** Nested workers set this false so the parent emits the only final event. */
  emitFinal?: boolean;
  lock?: <T>(fn: () => Promise<T>) => Promise<T>;
  signal?: AbortSignal;
};

export type AgentResult = {
  finalReply: string;
  status: AgentStatus;
  steps: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  costUsd: number;
  latencyMs: number;
  toolCalls: ToolCallRecord[];
  trace: TraceEvent[];
  escalated: boolean;
  ticketId: number | null;
  db: DbSnapshot;
};

function conversationText(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      if (message.role === "user") return `user: ${message.content}`;
      const calls = message.toolCalls?.map((call) => `${call.name}(${call.arguments})`).join(", ");
      return `assistant: ${message.content ?? ""}${calls ? ` [tools: ${calls}]` : ""}`;
    })
    .join("\n");
}

export async function runAgent(input: AgentRunInput): Promise<AgentResult> {
  const started = Date.now();
  const flags: AgentFlags = { ...DEFAULT_FLAGS, ...input.flags };
  const source = input.source ?? "agent";
  const trace = createTrace(input.onEvent);
  const allowed = input.allowedTools ?? (["get_order", "search_orders", "refund", "update_address"] as const);
  const tools = definitionsFor(allowed);
  const requestId = input.requestId ?? randomUUID();
  const runId = input.runId ?? randomUUID();
  const toolContext =
    input.toolContext ??
    createToolContext({
      db: input.db,
      runId,
      requestId,
      idempotentRefunds: flags.idempotentRefunds,
      flakySearch: flags.flakySearch,
      refundTimeoutOnce: flags.refundTimeoutOnce,
    });
  const loop = new LoopDetector(flags.loopRepeatLimit);
  const messages: ChatMessage[] = [
    { role: "system", content: input.systemPrompt ?? SYSTEM_PROMPT },
    { role: "user", content: input.userMessage },
  ];
  const toolCalls: ToolCallRecord[] = [];
  let steps = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let spent = 0;
  let status: AgentStatus = "completed";
  let reply = "";
  const finish = async (
    nextStatus: AgentStatus,
    nextReply: string,
    guard?: "step_limit" | "budget" | "loop" | "safety_cap",
  ) => {
    status = nextStatus;
    reply = nextReply;
    if (guard) {
      trace.emit({
        type: "guard",
        step: steps,
        source,
        guard,
        detail: nextStatus,
        at: nowIso(),
      });
    }
  };

  try {
    while (true) {
      if (input.signal?.aborted) {
        await finish("error", fallbackReply("error", false));
        break;
      }
      if (hitSafetyCap(steps)) {
        await finish("safety_cap", fallbackReply("safety_cap", false), "safety_cap");
        break;
      }
      if (hitStepLimit(steps, flags.stepLimit)) {
        await finish("step_limit", fallbackReply("step_limit", false), "step_limit");
        break;
      }

      steps += 1;
      trace.emit({ type: "step", step: steps, source, at: nowIso() });
      const completion = await input.llm.complete({
        model: input.model,
        messages,
        tools,
        temperature: 0,
      });
      inputTokens += completion.usage.inputTokens;
      outputTokens += completion.usage.outputTokens;
      spent += costUsd(input.model, completion.usage.inputTokens, completion.usage.outputTokens, input.pricing);
      trace.emit({
        type: "llm",
        step: steps,
        source,
        inputTokens: completion.usage.inputTokens,
        outputTokens: completion.usage.outputTokens,
        finishReason: completion.finishReason,
        at: nowIso(),
      });
      messages.push(completion.message);

      if (hitBudget(spent, flags.costBudgetUsd)) {
        await finish("budget_exceeded", fallbackReply("budget_exceeded", false), "budget");
        break;
      }

      const calls = completion.message.toolCalls ?? [];
      if (calls.length === 0) {
        reply = completion.message.content?.trim() || "I don't have anything else to add.";
        status = "completed";
        break;
      }

      let looped = false;
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(call.arguments) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          } else {
            args = { value: parsed };
          }
        } catch {
          args = { _raw: call.arguments };
        }
        trace.emit({ type: "tool_call", step: steps, source, name: call.name, args, at: nowIso() });
        if (flags.loopDetection && loop.observe(call.name, args)) {
          looped = true;
          await finish("loop_detected", fallbackReply("loop_detected", false), "loop");
          messages.push({
            role: "tool",
            toolCallId: call.id,
            content: JSON.stringify({ ok: false, error: "Stopped because this tool call was repeating." }),
          });
          break;
        }
        const result = input.lock
          ? await input.lock(() => executeTool(call.name, args, toolContext))
          : await executeTool(call.name, args, toolContext);
        toolCalls.push({ name: call.name, args });
        trace.emit({ type: "tool_result", step: steps, source, name: call.name, result, at: nowIso() });
        messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(result) });
      }
      if (looped) break;
    }
  } catch (error) {
    status = "error";
    reply = fallbackReply("error", false);
    trace.emit({ type: "error", source, message: publicErrorMessage(error), at: nowIso() });
  }

  let escalated = false;
  let ticketId: number | null = null;
  if (status !== "completed" && status !== "error" && flags.humanEscalation) {
    ticketId = await escalate(input.db, {
      reason: status,
      conversation: conversationText(messages),
      trace: trace.events,
    });
    escalated = true;
    reply = fallbackReply(status, true);
    trace.emit({ type: "ticket", source, ticketId, reason: status, at: nowIso() });
  }

  const db = await snapshotDb(input.db);
  const metrics: RunMetrics = {
    steps,
    inputTokens,
    outputTokens,
    tokens: inputTokens + outputTokens,
    costUsd: spent,
    latencyMs: Date.now() - started,
    toolCalls,
    escalated,
  };
  if (input.emitFinal !== false) {
    trace.emit({
      type: "final",
      source,
      status,
      reply,
      metrics,
      db,
      at: nowIso(),
    });
  }

  return {
    finalReply: reply,
    status,
    steps,
    inputTokens,
    outputTokens,
    tokens: inputTokens + outputTokens,
    costUsd: spent,
    latencyMs: metrics.latencyMs,
    toolCalls,
    trace: trace.events,
    escalated,
    ticketId,
    db,
  };
}
