import { timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import { runAgent } from "@/core/agent";
import { priceFor } from "@/core/cost";
import { createDb } from "@/core/db";
import { exportTrace } from "@/core/langfuse";
import { createLlm, publicErrorMessage, resolveModel } from "@/core/llm";
import { isLlmProvider, providerInfo, serverApiKey, type LlmProvider } from "@/core/provider-catalog";
import { PRICING, type ModelPrice } from "../../../../config/pricing";
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

  const suppliedKey = (request.headers.get("x-llm-api-key") ?? request.headers.get("x-groq-api-key") ?? "").trim();
  if (suppliedKey.length > 500) {
    return Response.json({ error: "API key is too long." }, { status: 400 });
  }
  const provider: LlmProvider = parsed.data.provider && isLlmProvider(parsed.data.provider) ? parsed.data.provider : "groq";
  const apiKey = suppliedKey || serverApiKey(provider);
  if (!apiKey) {
    return Response.json(
      { error: `Add your ${providerInfo(provider).label} API key. Leaving it blank uses the server key, and this server’s default is Groq.` },
      { status: 400 },
    );
  }
  let model: string;
  let pricing: Record<string, ModelPrice | null> | undefined;
  try {
    const resolved = resolveRunModel(
      provider,
      parsed.data.model,
      parsed.data.inputPerMillion,
      parsed.data.outputPerMillion,
      Boolean(suppliedKey),
    );
    model = resolved.model;
    pricing = resolved.pricing;
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
        const llm = createLlm(provider, apiKey);
        const shared = {
          userMessage: text,
          flags,
          db,
          llm,
          model,
          pricing,
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

function resolveRunModel(
  provider: LlmProvider,
  requested: string | undefined,
  inputPerMillion: number | undefined,
  outputPerMillion: number | undefined,
  ownKey: boolean,
): { model: string; pricing?: Record<string, ModelPrice | null> } {
  const fallback = provider === "groq" ? resolveModel() : providerInfo(provider).defaultModel;
  const model = requested && requested.length > 0 ? requested : fallback;
  if (!/^[A-Za-z0-9_./:-]+$/.test(model)) {
    throw new Error("Model id can contain letters, numbers, and . / _ : - only.");
  }
  if (Object.prototype.hasOwnProperty.call(PRICING, model) && PRICING[model] != null) {
    priceFor(model);
    return { model };
  }
  if (!ownKey) {
    throw new Error(`No price is configured for "${model}". Use a priced Groq model, or add your own API key and the token prices.`);
  }
  if (inputPerMillion == null || outputPerMillion == null) {
    throw new Error("Enter the input and output price per million tokens for this model.");
  }
  return {
    model,
    pricing: { ...PRICING, [model]: { inputPerMillion, outputPerMillion } },
  };
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
