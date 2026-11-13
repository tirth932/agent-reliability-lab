import { aggregateP1, type P1Row } from "../src/evals/aggregate";
import { loadTaskFile } from "../src/evals/load";
import { loadBudget } from "../src/projects/p1-guardrails/budget";
import type { AgentFlags } from "../src/core/types";
import type { AgentResult } from "../src/core/agent";
import { ceilingEstimate, confirmSpend, loadDotEnv, parseCli, writeJson } from "./lib/common";
import { runTask } from "./lib/run-one";

loadDotEnv();
const args = parseCli(process.argv.slice(2));
const tasks = loadTaskFile("tasks.jsonl").slice(0, args.limit);
const budget = loadBudget();

const off: AgentFlags = {
  stepLimit: null,
  costBudgetUsd: null,
  loopDetection: false,
  loopRepeatLimit: 3,
  humanEscalation: false,
  idempotentRefunds: false,
  flakySearch: true,
  refundTimeoutOnce: false,
};
const on: AgentFlags = {
  stepLimit: 10,
  costBudgetUsd: budget.costBudgetUsd,
  loopDetection: true,
  loopRepeatLimit: 3,
  humanEscalation: true,
  idempotentRefunds: true,
  flakySearch: true,
  refundTimeoutOnce: false,
};

await confirmSpend(
  `eval:p1 runs ${tasks.length} tasks twice (guards off, then guards on) with flaky search.\n${ceilingEstimate(tasks.length, 2, 30, args.model)}`,
  args.yes,
);

async function runCondition(label: string, flags: AgentFlags, saveLoops: boolean): Promise<P1Row[]> {
  const rows: P1Row[] = [];
  let saved = 0;
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    const result = await runTask(task, flags, args.model, "single");
    rows.push(rowFrom(task.id, result));
    console.log(`[p1 ${label}] ${index + 1}/${tasks.length} ${task.id} ${result.status} steps=${result.steps} cost=${result.costUsd.toFixed(6)}`);
    if (saveLoops && result.status === "loop_detected" && saved < 3) {
      saved += 1;
      writeJson(`results/traces/p1-loop-${saved}.json`, {
        taskId: task.id,
        input: task.input,
        status: result.status,
        trace: result.trace,
        db: result.db,
      });
    }
  }
  if (saveLoops && saved === 0) {
    console.log("No looping run occurred, so no p1-loop trace file was written.");
  }
  return rows;
}

function rowFrom(id: string, result: AgentResult): P1Row {
  return {
    id,
    status: result.status,
    steps: result.steps,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
    escalated: result.escalated,
  };
}

const guardsOff = await runCondition("off", off, true);
const guardsOn = await runCondition("on", on, false);
writeJson("results/p1.json", {
  project: "p1",
  generatedAt: new Date().toISOString(),
  model: args.model,
  taskCount: tasks.length,
  conditions: {
    guardsOff: { rows: guardsOff, aggregate: aggregateP1(guardsOff) },
    guardsOn: { rows: guardsOn, aggregate: aggregateP1(guardsOn) },
  },
});
