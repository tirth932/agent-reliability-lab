export const LLM_PROVIDERS = [
  { id: "groq", label: "Groq", env: "GROQ_API_KEY", defaultModel: "openai/gpt-oss-120b" },
  { id: "openai", label: "OpenAI", env: "OPENAI_API_KEY", defaultModel: "gpt-4.1-mini" },
  { id: "anthropic", label: "Anthropic", env: "ANTHROPIC_API_KEY", defaultModel: "claude-haiku-4-5" },
  { id: "google", label: "Google", env: "GOOGLE_API_KEY", defaultModel: "gemini-2.5-flash" },
  { id: "grok", label: "Grok", env: "XAI_API_KEY", defaultModel: "grok-3" },
] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number]["id"];

export function isLlmProvider(value: string): value is LlmProvider {
  return LLM_PROVIDERS.some((provider) => provider.id === value);
}

export function providerInfo(id: LlmProvider): (typeof LLM_PROVIDERS)[number] {
  const found = LLM_PROVIDERS.find((provider) => provider.id === id);
  if (!found) throw new Error("Unknown model provider.");
  return found;
}

export function serverApiKey(id: LlmProvider): string | undefined {
  if (id === "google") return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  const value = process.env[providerInfo(id).env];
  return value && value.length > 0 ? value : undefined;
}
