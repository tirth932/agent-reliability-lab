import { loadTaskFile } from "../src/evals/load";
import type { AgentFlags } from "../src/core/types";
import { ceilingEstimate, confirmSpend, loadDotEnv, parseCli, writeJson } from "./lib/common";
import { runTask } from "./lib/run-one";

loadDotEnv();

const args = parseCli(process.argv.slice(2));
const tasks = loadTaskFile("tasks.jsonl").slice(0, args.limit);
const flags: AgentFlags = {
  stepLimit: 10,
  costBudgetUsd: null,
  loopDetection: true,
  loopRepeatLimit: 3,
  humanEscalation: true,
  idempotentRefunds: true,
  flakySearch: false,
  refundTimeoutOnce: false,
};

async function main(): Promise<void> {
await confirmSpend(
  [
    `eval:baseline will run ${tasks.length} tasks with guards on and faults off.`,
    "The cost budget is off for this run because this run creates config/budget.json.",
    ceilingEstimate(tasks.length, 1, flags.stepLimit ?? 10, args.model),
  ].join("\n"),
  args.yes,
);

const costs: number[] = [];
for (let index = 0; index < tasks.length; index += 1) {
  const task = tasks[index];
  const result = await runTask(task, flags, args.model, "single");
  costs.push(result.costUsd);
  console.log(`[baseline] ${index + 1}/${tasks.length} ${task.id} ${result.status} steps=${result.steps} cost=${result.costUsd.toFixed(6)}`);
}

const averageCostUsd = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
const budget = {
  costBudgetUsd: averageCostUsd * 3,
  averageCostUsd,
  model: args.model,
  taskCount: costs.length,
  generatedAt: new Date().toISOString(),
};
writeJson("config/budget.json", budget);
console.log(`Average cost $${averageCostUsd.toFixed(6)}. Budget set to 3x = $${budget.costBudgetUsd.toFixed(6)}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
