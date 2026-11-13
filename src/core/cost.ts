import { PRICING, type ModelPrice } from "../../config/pricing";

export class MissingPriceError extends Error {
  constructor(model: string) {
    super(
      `No price configured for model "${model}". Fill its entry in config/pricing.ts (see https://console.groq.com/docs/models) before running this model.`,
    );
    this.name = "MissingPriceError";
  }
}

export function priceFor(
  model: string,
  table: Record<string, ModelPrice | null> = PRICING,
): ModelPrice {
  if (!Object.prototype.hasOwnProperty.call(table, model) || table[model] == null) {
    throw new MissingPriceError(model);
  }
  return table[model];
}

export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  table: Record<string, ModelPrice | null> = PRICING,
): number {
  const price = priceFor(model, table);
  return (inputTokens / 1_000_000) * price.inputPerMillion + (outputTokens / 1_000_000) * price.outputPerMillion;
}
