import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { costUsd, priceFor } from "../../src/core/cost";
import { resolveModel } from "../../src/core/llm";

export function loadDotEnv(): void {
  const file = path.join(process.cwd(), ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function parseCli(argv: string[]): { yes: boolean; limit?: number; model: string; trials: number } {
  let limit: number | undefined;
  let model: string | undefined;
  let trials = 3;
  const yes = argv.includes("--yes");
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--limit") limit = Number(argv[++index]);
    else if (arg === "--model") model = argv[++index];
    else if (arg === "--trials") trials = Number(argv[++index]);
  }
  if (limit != null && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  if (!Number.isInteger(trials) || trials < 1) throw new Error("--trials must be a positive integer");
  return { yes, limit, model: resolveModel(model), trials };
}

export function ceilingEstimate(tasks: number, trials: number, maxSteps: number, model: string): string {
  const price = priceFor(model);
  const inputTokens = tasks * trials * maxSteps * 2000;
  const outputTokens = tasks * trials * maxSteps * 400;
  const usd = costUsd(model, inputTokens, outputTokens);
  return [
    "Ceiling estimate, not a measurement.",
    `${tasks} tasks x ${trials} trial(s) x ${maxSteps} steps,`,
    "assuming 2000 input and 400 output tokens per step,",
    `is $${usd.toFixed(4)} for ${model}`,
    `($${price.inputPerMillion}/M input, $${price.outputPerMillion}/M output from config/pricing.ts).`,
    "Real spend is usually lower. No API calls have been made yet.",
  ].join(" ");
}

export async function confirmSpend(message: string, yes: boolean): Promise<void> {
  console.log(message);
  if (yes) return;
  if (!stdin.isTTY) {
    console.error("Refusing to spend API credits without a TTY. Re-run with --yes.");
    process.exit(1);
  }
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question("Type yes to continue: ");
  rl.close();
  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Cancelled. No API calls were made.");
    process.exit(1);
  }
}

export function writeJson(file: string, value: unknown): void {
  const full = path.join(process.cwd(), file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
  console.log(`Wrote ${file}`);
}
