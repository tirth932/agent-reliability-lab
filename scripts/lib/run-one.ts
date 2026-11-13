import { randomUUID } from "node:crypto";
import { runAgent, type AgentResult } from "../../src/core/agent";
import { createDb } from "../../src/core/db";
import { createGroqLlm } from "../../src/core/llm";
import { runMultiAgent } from "../../src/projects/p3-multiagent/orchestrator";
import type { AgentFlags } from "../../src/core/types";
import type { Task } from "../../src/evals/schema";
import { matchTrajectory } from "../../src/projects/p2-trajectory/trajectory";
import { outcomeMatches } from "../../src/projects/p2-trajectory/metrics";

export async function runTask(task: Task, flags: AgentFlags, model: string, mode: "single" | "multi"): Promise<AgentResult> {
  const db = await createDb({ idempotentRefunds: flags.idempotentRefunds });
  const llm = createGroqLlm();
  const requestId = randomUUID();
  try {
    if (mode === "multi") {
      return await runMultiAgent({ userMessage: task.input, flags, db, llm, model, requestId });
    }
    return await runAgent({ userMessage: task.input, flags, db, llm, model, requestId });
  } finally {
    db.close();
  }
}

export function scoreRun(task: Task, result: AgentResult) {
  const duplicateRefunds = result.db.refunds.reduce<Record<number, number>>((counts, refund) => {
    counts[refund.order_id] = (counts[refund.order_id] ?? 0) + 1;
    return counts;
  }, {});
  const duplicateOrders = Object.values(duplicateRefunds).filter((count) => count > 1).length;
  const outcome = outcomeMatches(result.db, result.finalReply, task.expected_state);
  return {
    duplicateRefunds: duplicateOrders,
    strict: matchTrajectory(result.toolCalls, task.expected_tools, "strict", task.expected_args),
    unordered: matchTrajectory(result.toolCalls, task.expected_tools, "unordered", task.expected_args),
    subset: matchTrajectory(result.toolCalls, task.expected_tools, "subset", task.expected_args),
    superset: matchTrajectory(result.toolCalls, task.expected_tools, "superset", task.expected_args),
    outcome: outcome.ok,
    outcomeReasons: outcome.reasons,
  };
}
