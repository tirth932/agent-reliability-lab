import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { DEFAULT_MODEL } from "../../config/pricing";
import type { LlmProvider } from "./provider-catalog";
import { createAnthropicLlm, createGoogleLlm, createOpenAiCompatibleLlm } from "./llm-providers";
import type { ToolDefinition } from "./tools";

export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[]; reasoning?: string | null }
  | { role: "tool"; toolCallId: string; content: string };

export type LlmCompletion = {
  message: Extract<ChatMessage, { role: "assistant" }>;
  finishReason: string;
  usage: { inputTokens: number; outputTokens: number };
};

export type LlmRequest = {
  model: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  temperature?: number;
  jsonObject?: boolean;
};

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmCompletion>;
}

const NO_PARALLEL = new Set([
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-safeguard-20b",
]);

export function resolveModel(override?: string): string {
  return override || process.env.AGENT_MODEL || DEFAULT_MODEL;
}

export function publicErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return message
    .replace(/gsk_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/AIza[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/xai-[A-Za-z0-9_-]+/g, "[redacted]");
}

function toGroqMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role === "system" || message.role === "user") {
      return { role: message.role, content: message.content };
    }
    if (message.role === "tool") {
      return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
    }
    return {
      role: "assistant",
      content: message.content,
      reasoning: message.reasoning ?? undefined,
      tool_calls: message.toolCalls?.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  });
}

async function withRateLimitRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
      if (status !== 429 || attempt === 7) throw error;
      const waitMs = 15_000 * (attempt + 1);
      console.error(`Groq rate limit. Waiting ${waitMs / 1000}s before retry ${attempt + 1}.`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw new Error("Groq rate limit retries exhausted.");
}

function reasoningEffort(model: string): "none" | "low" {
  if (model.startsWith("openai/gpt-oss")) return "low";
  return "none";
}

export function createGroqLlm(apiKey = process.env.GROQ_API_KEY): LlmClient {
  if (!apiKey) throw new Error("GROQ_API_KEY is not set.");
  const client = new Groq({ apiKey });
  return {
    async complete(request) {
      const response = await withRateLimitRetry(() => client.chat.completions.create({
        model: request.model,
        temperature: request.temperature ?? 0,
        messages: toGroqMessages(request.messages),
        tools: request.tools.length
          ? request.tools.map((tool) => ({
              type: "function" as const,
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            }))
          : undefined,
        tool_choice: request.tools.length ? "auto" : undefined,
        parallel_tool_calls: request.tools.length ? !NO_PARALLEL.has(request.model) : undefined,
        reasoning_effort: reasoningEffort(request.model),
        reasoning_format: "parsed",
        response_format: request.jsonObject ? { type: "json_object" } : undefined,
      }));
      const choice = response.choices[0];
      if (!choice) throw new Error("Groq returned no choices.");
      if (!response.usage) throw new Error("Groq response did not include token usage.");
      const toolCalls = choice.message.tool_calls?.map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      }));
      return {
        finishReason: choice.finish_reason ?? "stop",
        usage: {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        },
        message: {
          role: "assistant",
          content: typeof choice.message.content === "string" ? choice.message.content : null,
          toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
          reasoning: choice.message.reasoning ?? null,
        },
      };
    },
  };
}

export function scriptedLlm(steps: LlmCompletion[]): LlmClient & { calls: number } {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async complete() {
      const step = steps[calls];
      calls += 1;
      if (!step) throw new Error(`Mock LLM ran out of scripted responses at call ${calls}.`);
      return step;
    },
  };
}

export function assistant(content: string | null, toolCalls?: ToolCall[], usage = { inputTokens: 100, outputTokens: 20 }): LlmCompletion {
  return {
    message: { role: "assistant", content, toolCalls },
    finishReason: toolCalls && toolCalls.length > 0 ? "tool_calls" : "stop",
    usage,
  };
}

export function toolCall(name: string, args: Record<string, unknown>, id = `call_${name}`): ToolCall {
  return { id, name, arguments: JSON.stringify(args) };
}

export function createLlm(provider: LlmProvider, apiKey: string): LlmClient {
  if (!apiKey) throw new Error("An API key is required.");
  if (provider === "groq") return createGroqLlm(apiKey);
  if (provider === "openai" || provider === "grok") return createOpenAiCompatibleLlm(provider, apiKey);
  if (provider === "anthropic") return createAnthropicLlm(apiKey);
  return createGoogleLlm(apiKey);
}
