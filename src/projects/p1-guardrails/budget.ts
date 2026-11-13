import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export type BudgetFile = {
  costBudgetUsd: number;
  averageCostUsd: number;
  model: string;
  taskCount: number;
  generatedAt: string;
};

export function budgetPath(): string {
  return path.join(process.cwd(), "config", "budget.json");
}

export function loadBudget(): BudgetFile {
  const file = budgetPath();
  if (!existsSync(file)) {
    throw new Error("config/budget.json is missing. Fill config/pricing.ts, then run pnpm eval:baseline.");
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<BudgetFile>;
  if (typeof parsed.costBudgetUsd !== "number" || !Number.isFinite(parsed.costBudgetUsd)) {
    throw new Error("config/budget.json is missing a numeric costBudgetUsd.");
  }
  return parsed as BudgetFile;
}

export function hitBudget(costUsd: number, budgetUsd: number | null): boolean {
  return budgetUsd != null && costUsd > budgetUsd;
}
