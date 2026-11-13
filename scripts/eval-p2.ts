import { aggregateP2, type P2Row } from "../src/evals/aggregate";
import { loadTaskFile } from "../src/evals/load";
import { loadBudget } from "../src/projects/p1-guardrails/budget";
import type { AgentFlags } from "../src/core/types";
import { ceilingEstimate, confirmSpend, loadDotEnv, parseCli, writeJson } from "./lib/common";
import { runTask, scoreRun } from "./lib/run-one";

loadDotEnv();
const args = parseCli(process.argv.slice(2));
const tasks = loadTaskFile("tasks.jsonl").slice(0, args.limit);
const budget = loadBudget();

function flags(idempotentRefunds: boolean): AgentFlags {
  return {
    stepLimit: 10,
    costBudgetUsd: budget.costBudgetUsd,
    loopDetection: true,
    loopRepeatLimit: 3,
    humanEscalation: false,
    idempotentRefunds,
    flakySearch: false,
    refundTimeoutOnce: true,
  };
}

await confirmSpend(
  `eval:p2 runs ${tasks.length} tasks twice (idempotency off, then on) with refund timeouts.\n${ceilingEstimate(tasks.length, 2, 10, args.model)}`,
  args.yes,
);

async function runCondition(label: string, idempotent: boolean, saveBug: boolean): Promise<P2Row[]> {
  const rows: P2Row[] = [];
  let saved = false;
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    const result = await runTask(task, flags(idempotent), args.model, "single");
    const score = scoreRun(task, result);
    rows.push({
      id: task.id,
      status: result.status,
      steps: result.steps,
      costUsd: result.costUsd,
      latencyMs: result.latencyMs,
      escalated: result.escalated,
      ...score,
    });
    console.log(`[p2 ${label}] ${index + 1}/${tasks.length} ${task.id} dup=${score.duplicateRefunds} outcome=${score.outcome} strict=${score.strict}`);
    if (saveBug && !saved && score.duplicateRefunds > 0) {
      saved = true;
      writeJson("results/traces/p2-double-refund.json", {
        taskId: task.id,
        input: task.input,
        duplicateRefunds: score.duplicateRefunds,
        trace: result.trace,
        refunds: result.db.refunds,
      });
    }
  }
  if (saveBug && !saved) console.log("No duplicate refund occurred, so p2-double-refund.json was not written.");
  return rows;
}

const idempotencyOff = await runCondition("off", false, true);
const idempotencyOn = await runCondition("on", true, false);
writeJson("results/p2.json", {
  project: "p2",
  generatedAt: new Date().toISOString(),
  model: args.model,
  taskCount: tasks.length,
  conditions: {
    idempotencyOff: { rows: idempotencyOff, aggregate: aggregateP2(idempotencyOff) },
    idempotencyOn: { rows: idempotencyOn, aggregate: aggregateP2(idempotencyOn) },
  },
});
