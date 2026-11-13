/**
 * USD per 1,000,000 tokens. Leave values null until you verify them.
 * The app throws if a model is used without a price, so missing prices
 * cannot show up as $0.
 *
 * Check current numbers before filling these in:
 * https://console.groq.com/docs/models
 *
 * Looked up on 2026-11-13 (comments only, not active prices):
 * - openai/gpt-oss-120b: input 0.15, output 0.60
 * - openai/gpt-oss-20b: input 0.075, output 0.30
 * - qwen/qwen3.8-27b: input 0.80, output 4.00
 */
export type ModelPrice = {
  inputPerMillion: number;
  outputPerMillion: number;
};

export const PRICING: Record<string, ModelPrice | null> = {
  "openai/gpt-oss-120b": null,
  "openai/gpt-oss-20b": null,
  "qwen/qwen3.8-27b": null,
};

export const DEFAULT_MODEL = "openai/gpt-oss-120b";
