/**
 * USD per 1,000,000 tokens. Leave values null until you verify them.
 * The app throws if a model is used without a price, so missing prices
 * cannot show up as $0.
 *
 * Check current numbers before filling these in:
 * https://console.groq.com/docs/models
 *
 * Groq's free plan serves these models with rate limits instead of a bill
 * (gpt-oss-120b: 30 requests/minute, 200,000 tokens/day). The numbers below
 * are Groq's published on-demand prices, checked 2026-11-13:
 * https://console.groq.com/docs/model/openai/gpt-oss-120b
 * - openai/gpt-oss-120b: input 0.15, output 0.60
 * - openai/gpt-oss-20b: input 0.075, output 0.30
 * - qwen/qwen3.8-27b: input 0.80, output 4.00
 */
export type ModelPrice = {
  inputPerMillion: number;
  outputPerMillion: number;
};

export const PRICING: Record<string, ModelPrice | null> = {
  "openai/gpt-oss-120b": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "openai/gpt-oss-20b": { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  "qwen/qwen3.8-27b": { inputPerMillion: 0.8, outputPerMillion: 4 },
};

export const DEFAULT_MODEL = "openai/gpt-oss-120b";
