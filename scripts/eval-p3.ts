import { loadTaskFile } from "../src/evals/load";
import { loadBudget } from "../src/projects/p1-guardrails/budget";
import { compare, decisionRule, type P3TaskRow, type TrialMetrics } from "../src/projects/p3-multiagent/compare";
import type { AgentFlags } from "../src/core/types";
import type { AgentResult } from "../src/core/agent";
import { ceilingEstimate, confirmSpend, loadDotEnv, parseCli, writeJson } from "./lib/common";
import { runTask, scoreRun } from "./lib/run-one";

loadDotEnv();
const args = parseCli(process.argv.slice(2));
const tasks = loadTaskFile("multi_tasks.jsonl").slice(0, args.limit);
const budget = loadBudget();
const flags: AgentFlags = {
  stepLimit: 10,
  costBudgetUsd: budget.costBudgetUsd,
  loopDetection: true,
  loopRepeatLimit: 3,
  humanEscalation: true,
  idempotentRefunds: true,
  flakySearch: false,
  refundTimeoutOnce: false,
};

function trial(result: AgentResult, success: boolean): TrialMetrics {
  return {
    success,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
    toolCalls: result.toolCalls.length,
    steps: result.steps,
  };
}

async function main(): Promise<void> {
await confirmSpend(
  `eval:p3 runs ${tasks.length} tasks x ${args.trials} trials for single and multi-agent.\n${ceilingEstimate(tasks.length, args.trials * 2, 12, args.model)}`,
  args.yes,
);

const rows: P3TaskRow[] = [];
for (let index = 0; index < tasks.length; index += 1) {
  const task = tasks[index];
  const trials: P3TaskRow["trials"] = [];
  for (let attempt = 1; attempt <= args.trials; attempt += 1) {
    const single = await runTask(task, flags, args.model, "single");
    const multi = await runTask(task, flags, args.model, "multi");
    trials.push({
      single: trial(single, scoreRun(task, single).outcome),
      multi: trial(multi, scoreRun(task, multi).outcome),
    });
    console.log(`[p3] ${index + 1}/${tasks.length} ${task.id} trial ${attempt}/${args.trials} single=${single.status} multi=${multi.status}`);
  }
  rows.push({ id: task.id, type: task.type ?? "dependent", trials });
}

const aggregate = compare(rows);
writeJson("results/p3.json", {
  project: "p3",
  generatedAt: new Date().toISOString(),
  model: args.model,
  trials: args.trials,
  taskCount: tasks.length,
  rows,
  aggregate,
  decisionRule: decisionRule(aggregate),
});
}

void main();
