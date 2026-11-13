import type { ChatMessage, LlmClient, LlmCompletion, LlmRequest, ToolCall } from "./llm";

const OPENAI_URLS = {
  openai: "https://api.openai.com/v1/chat/completions",
  grok: "https://api.x.ai/v1/chat/completions",
} as const;

export function createOpenAiCompatibleLlm(provider: keyof typeof OPENAI_URLS, apiKey: string): LlmClient {
  return {
    async complete(request) {
      const payload = await postJson(OPENAI_URLS[provider], {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      }, {
        model: request.model,
        temperature: request.temperature ?? 0,
        messages: request.messages.map(openAiMessage),
        tools: request.tools.length
          ? request.tools.map((tool) => ({
              type: "function",
              function: { name: tool.name, description: tool.description, parameters: tool.parameters },
            }))
          : undefined,
        tool_choice: request.tools.length ? "auto" : undefined,
        response_format: request.jsonObject ? { type: "json_object" } : undefined,
      });
      const choice = firstChoice(payload.choices);
      if (!choice) throw new Error(`${provider} returned no choices.`);
      const message = asRecord(choice.message);
      const usage = asRecord(payload.usage);
      if (!message || !usage) throw new Error(`${provider} response did not include a message and token usage.`);
      const toolCalls = readOpenAiTools(message.tool_calls);
      return completion(
        textOf(message.content),
        toolCalls,
        toolCalls ? "tool_calls" : String(choice.finish_reason ?? "stop"),
        Number(usage.prompt_tokens),
        Number(usage.completion_tokens),
      );
    },
  };
}

export function createAnthropicLlm(apiKey: string): LlmClient {
  return {
    async complete(request) {
      const converted = toAnthropic(request);
      const payload = await postJson("https://api.anthropic.com/v1/messages", {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      }, {
        model: request.model,
        max_tokens: 2048,
        temperature: request.temperature ?? 0,
        system: converted.system,
        messages: converted.messages,
        tools: request.tools.length
          ? request.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.parameters,
            }))
          : undefined,
      });
      const blocks = Array.isArray(payload.content) ? payload.content : [];
      const text = blocks
        .filter((block) => asRecord(block)?.type === "text")
        .map((block) => String(asRecord(block)?.text ?? ""))
        .join("\n");
      const toolCalls = blocks.flatMap((block) => {
        const record = asRecord(block);
        if (!record || record.type !== "tool_use") return [];
        const call: ToolCall = {
          id: String(record.id ?? `tool_${record.name}`),
          name: String(record.name),
          arguments: JSON.stringify(record.input ?? {}),
        };
        return [call];
      });
      const usage = asRecord(payload.usage);
      if (!usage) throw new Error("Anthropic response did not include token usage.");
      return completion(
        text || null,
        toolCalls.length > 0 ? toolCalls : undefined,
        payload.stop_reason === "tool_use" ? "tool_calls" : "stop",
        Number(usage.input_tokens),
        Number(usage.output_tokens),
      );
    },
  };
}

export function createGoogleLlm(apiKey: string): LlmClient {
  return {
    async complete(request) {
      const converted = toGemini(request);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`;
      const payload = await postJson(url, {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      }, {
        systemInstruction: converted.system ? { parts: [{ text: converted.system }] } : undefined,
        contents: converted.contents,
        tools: request.tools.length
          ? [{
              functionDeclarations: request.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: stripAdditional(tool.parameters),
              })),
            }]
          : undefined,
        toolConfig: request.tools.length ? { functionCallingConfig: { mode: "AUTO" } } : undefined,
        generationConfig: {
          temperature: request.temperature ?? 0,
          responseMimeType: request.jsonObject && request.tools.length === 0 ? "application/json" : undefined,
        },
      });
      const candidate = firstChoice(payload.candidates);
      const content = asRecord(candidate?.content);
      const parts = Array.isArray(content?.parts) ? content.parts : [];
      const text = parts
        .filter((part) => typeof asRecord(part)?.text === "string")
        .map((part) => String(asRecord(part)?.text))
        .join("\n");
      const toolCalls = parts.flatMap((part, index) => {
        const call = asRecord(asRecord(part)?.functionCall);
        if (!call) return [];
        const tool: ToolCall = {
          id: String(call.id ?? `call_${index}_${call.name}`),
          name: String(call.name),
          arguments: JSON.stringify(call.args ?? {}),
        };
        return [tool];
      });
      const usage = asRecord(payload.usageMetadata);
      if (!usage) throw new Error("Google response did not include token usage.");
      const thoughts = Number(usage.thoughtsTokenCount ?? 0);
      return completion(
        text || null,
        toolCalls.length > 0 ? toolCalls : undefined,
        toolCalls.length > 0 ? "tool_calls" : "stop",
        Number(usage.promptTokenCount),
        Number(usage.candidatesTokenCount) + (Number.isFinite(thoughts) ? thoughts : 0),
      );
    },
  };
}

function openAiMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === "system" || message.role === "user") return { role: message.role, content: message.content };
  if (message.role === "tool") return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  return {
    role: "assistant",
    content: message.content,
    tool_calls: message.toolCalls?.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: call.arguments },
    })),
  };
}

function toAnthropic(request: LlmRequest): { system: string; messages: Record<string, unknown>[] } {
  const systemParts = request.messages.filter((message) => message.role === "system").map((message) => message.content);
  if (request.jsonObject) systemParts.push("Respond with one JSON object and no other text.");
  const messages: Record<string, unknown>[] = [];
  for (const message of request.messages) {
    if (message.role === "system") continue;
    if (message.role === "user") {
      messages.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      const content: Record<string, unknown>[] = [];
      if (message.content) content.push({ type: "text", text: message.content });
      for (const call of message.toolCalls ?? []) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: parseObject(call.arguments) });
      }
      messages.push({ role: "assistant", content: content.length > 0 ? content : [{ type: "text", text: "" }] });
      continue;
    }
    const block = { type: "tool_result", tool_use_id: message.toolCallId, content: message.content };
    const last = messages.at(-1);
    if (last?.role === "user" && Array.isArray(last.content)) {
      last.content.push(block);
    } else {
      messages.push({ role: "user", content: [block] });
    }
  }
  return { system: systemParts.join("\n\n"), messages };
}

function toGemini(request: LlmRequest): { system: string; contents: Record<string, unknown>[] } {
  const system = request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const contents: Record<string, unknown>[] = [];
  for (const message of request.messages) {
    if (message.role === "system") continue;
    if (message.role === "user") {
      contents.push({ role: "user", parts: [{ text: message.content }] });
      continue;
    }
    if (message.role === "assistant") {
      const parts: Record<string, unknown>[] = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.toolCalls ?? []) {
        parts.push({ functionCall: { name: call.name, args: parseObject(call.arguments), id: call.id } });
      }
      contents.push({ role: "model", parts: parts.length > 0 ? parts : [{ text: "" }] });
      continue;
    }
    const name = toolName(request.messages, message.toolCallId);
    const part = { functionResponse: { name, response: parseObject(message.content) } };
    const last = contents.at(-1);
    if (last?.role === "user" && Array.isArray(last.parts) && asRecord(last.parts.at(-1))?.functionResponse) {
      last.parts.push(part);
    } else {
      contents.push({ role: "user", parts: [part] });
    }
  }
  return { system, contents };
}

function toolName(messages: ChatMessage[], id: string): string {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const call = message.toolCalls?.find((item) => item.id === id);
    if (call) return call.name;
  }
  return "tool";
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await response.text();
    if (response.status === 429 && attempt < 5) {
      const waitMs = 15_000 * (attempt + 1);
      console.error(`Provider rate limit. Waiting ${waitMs / 1000}s before retry ${attempt + 1}.`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    let payload: unknown = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { error: text.slice(0, 400) };
    }
    if (!response.ok) {
      const record = asRecord(payload);
      const nested = asRecord(record?.error);
      const message = String(nested?.message ?? record?.message ?? text.slice(0, 400) ?? response.statusText);
      const error = new Error(message.slice(0, 500));
      Object.assign(error, { status: response.status });
      throw error;
    }
    const record = asRecord(payload);
    if (!record) throw new Error("The model provider returned a response that was not an object.");
    return record;
  }
  throw new Error("The model provider kept rate limiting this run.");
}

function completion(
  content: string | null,
  toolCalls: ToolCall[] | undefined,
  finishReason: string,
  inputTokens: number,
  outputTokens: number,
): LlmCompletion {
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) {
    throw new Error("The model provider returned token counts that were not numbers.");
  }
  return {
    finishReason,
    usage: { inputTokens, outputTokens },
    message: { role: "assistant", content, toolCalls },
  };
}

function readOpenAiTools(value: unknown): ToolCall[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.flatMap((item) => {
    const record = asRecord(item);
    const fn = asRecord(record?.function);
    if (!record || !fn) return [];
    return [{ id: String(record.id), name: String(fn.name), arguments: String(fn.arguments ?? "{}") }];
  });
}

function firstChoice(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) ? asRecord(value[0]) : undefined;
}

function textOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;
  const text = value.map((part) => String(asRecord(part)?.text ?? "")).join("");
  return text || null;
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return { result: parsed };
  } catch {
    return { raw: value };
  }
}

function stripAdditional(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripAdditional);
  if (!value || typeof value !== "object") return value;
  const copy: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key === "additionalProperties") continue;
    copy[key] = stripAdditional(nested);
  }
  return copy;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
