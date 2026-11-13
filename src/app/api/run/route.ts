import { timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { runAgent } from "@/core/agent";
import { priceFor } from "@/core/cost";
import { createDb } from "@/core/db";
import { exportTrace } from "@/core/langfuse";
import { createGroqLlm, publicErrorMessage, resolveModel } from "@/core/llm";
import { loadTaskFile } from "@/evals/load";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { flagsFromRequest, runRequestSchema } from "@/lib/run-schema";
import { runMultiAgent } from "@/projects/p3-multiagent/orchestrator";
import type { TraceEvent } from "@/core/trace";

export const runtime = "nodejs";
export const maxDuration = 60;

function passcodeOk(request: Request): boolean {
  const expected = process.env.DEMO_PASSCODE;
  if (!expected) return true;
  const got = request.headers.get("x-demo-passcode") ?? "";
  const left = Buffer.from(got);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!passcodeOk(request)) {
    return Response.json({ error: "This demo requires a passcode." }, { status: 401 });
  }
  const limit = await rateLimit(clientIp(request));
  if (!limit.ok) {
    return Response.json({ error: "Rate limit reached: 10 runs per hour from this IP." }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const parsed = runRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  }

  const model = resolveModel();
  try {
    priceFor(model);
  } catch (error) {
    return Response.json({ error: publicErrorMessage(error) }, { status: 400 });
  }

  const text = parsed.data.message?.trim() || taskInput(parsed.data.taskId);
  if (!text) return Response.json({ error: "Provide a message or a known task id." }, { status: 400 });
  if (text.length > 300) return Response.json({ error: "Message must be 300 characters or fewer." }, { status: 400 });

  let flags;
  try {
    flags = flagsFromRequest(parsed.data);
  } catch (error) {
    return Response.json({ error: publicErrorMessage(error) }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: TraceEvent) => {
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      };
      const db = await createDb({ idempotentRefunds: flags.idempotentRefunds });
      const runId = randomUUID();
      try {
        const llm = createGroqLlm();
        const shared = {
          userMessage: text,
          flags,
          db,
          llm,
          model,
          onEvent: send,
          requestId: runId,
          runId,
          signal: request.signal,
        };
        const result = parsed.data.mode === "multi" ? await runMultiAgent(shared) : await runAgent(shared);
        await exportTrace(result.trace, { runId, name: parsed.data.mode });
      } catch (error) {
        send({ type: "error", source: "api", message: publicErrorMessage(error), at: new Date().toISOString() });
      } finally {
        db.close();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function taskInput(taskId: string | undefined): string {
  if (!taskId) return "";
  const pools = [loadTaskFile("tasks.jsonl"), loadTaskFile("multi_tasks.jsonl")];
  for (const pool of pools) {
    const task = pool.find((item) => item.id === taskId);
    if (task) return task.input;
  }
  return "";
}
