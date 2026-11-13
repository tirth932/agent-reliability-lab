import { describe, expect, it } from "vitest";
import { createDb } from "@/core/db";
import { assistant, toolCall, type LlmClient } from "@/core/llm";
import { loadTaskFile } from "@/evals/load";
import { validateTasks } from "@/evals/validate";
import { outcomeMatches } from "@/projects/p2-trajectory/metrics";
import { matchNames, matchTrajectory } from "@/projects/p2-trajectory/trajectory";
import { compare, decisionRule, type P3TaskRow } from "@/projects/p3-multiagent/compare";
import { planRounds } from "@/projects/p3-multiagent/workers";
import { runMultiAgent } from "@/projects/p3-multiagent/orchestrator";
import type { ModelPrice } from "../config/pricing";

const pricing: Record<string, ModelPrice | null> = {
  "test-model": { inputPerMillion: 1, outputPerMillion: 1 },
};

describe("trajectory matchers", () => {
  const actual = [
    { name: "get_order", args: { order_id: 4521 } },
    { name: "refund", args: { order_id: 4521, amount: 64 } },
  ];

  it("matches strict, unordered, subset, and superset names", () => {
    expect(matchNames(["get_order", "refund"], ["get_order", "refund"], "strict")).toBe(true);
    expect(matchNames(["refund", "get_order"], ["get_order", "refund"], "strict")).toBe(false);
    expect(matchNames(["refund", "get_order"], ["get_order", "refund"], "unordered")).toBe(true);
    expect(matchNames(["get_order"], ["get_order", "refund"], "subset")).toBe(true);
    expect(matchNames(["get_order", "refund", "get_order"], ["get_order", "refund"], "superset")).toBe(true);
    expect(matchNames(["search_orders"], ["get_order"], "subset")).toBe(false);
  });

  it("checks expected args when they are present", () => {
    const args = [{ name: "refund", args: { amount: 64, order_id: 4521 } }];
    expect(matchTrajectory(actual, ["get_order", "refund"], "strict", args)).toBe(true);
    expect(matchTrajectory([{ name: "get_order" }, { name: "refund", args: { order_id: 4521, amount: 10 } }], ["get_order", "refund"], "strict", args)).toBe(false);
  });
});

describe("outcome checks", () => {
  it("accepts the expected refund and rejects a second one", async () => {
    const db = await createDb({ idempotentRefunds: false });
    await db.insertRefund({ orderId: 4521, amount: 64, idempotencyKey: null });
    const snapshot = { orders: await db.allOrders(), refunds: await db.listRefunds(), tickets: [] };
    expect(outcomeMatches(snapshot, "Refunded 4521", { refunds: [{ order_id: 4521, count: 1, amount: 64 }] }).ok).toBe(true);
    await db.insertRefund({ orderId: 4521, amount: 64, idempotencyKey: null });
    const doubled = { orders: snapshot.orders, refunds: await db.listRefunds(), tickets: [] };
    expect(outcomeMatches(doubled, "Refunded", { refunds: [{ order_id: 4521, count: 1 }] }).ok).toBe(false);
    db.close();
  });
});

describe("task files", () => {
  it("validates both task sets", () => {
    const single = loadTaskFile("tasks.jsonl");
    const multi = loadTaskFile("multi_tasks.jsonl");
    expect(single).toHaveLength(50);
    expect(multi).toHaveLength(30);
    expect(validateTasks(single, { requireType: false })).toEqual([]);
    expect(validateTasks(multi, { requireType: true })).toEqual([]);
    expect(single.filter((task) => task.category === "easy")).toHaveLength(20);
    expect(multi.filter((task) => task.type === "independent")).toHaveLength(15);
    expect(multi.filter((task) => task.type === "dependent")).toHaveLength(15);
  });
});

describe("multi-agent planning", () => {
  it("runs independent work in one round and dependent work across rounds", () => {
    const independent = planRounds([
      { id: "a", worker: "refund", instruction: "a", dependsOn: [] },
      { id: "b", worker: "address", instruction: "b", dependsOn: [] },
    ]);
    expect(independent.rounds).toHaveLength(1);
    expect(independent.unfinished).toHaveLength(0);

    const dependent = planRounds([
      { id: "a", worker: "lookup", instruction: "a", dependsOn: [] },
      { id: "b", worker: "refund", instruction: "b", dependsOn: ["a"] },
      { id: "c", worker: "summary", instruction: "c", dependsOn: ["b"] },
    ]);
    expect(dependent.rounds.map((round) => round.map((task) => task.id))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("compares trials without inventing a rate", () => {
    const rows: P3TaskRow[] = [
      {
        id: "m001",
        type: "independent",
        trials: [
          { single: { success: true, costUsd: 1, latencyMs: 10, toolCalls: 2, steps: 2 }, multi: { success: true, costUsd: 2, latencyMs: 12, toolCalls: 3, steps: 4 } },
          { single: { success: false, costUsd: 1, latencyMs: 10, toolCalls: 2, steps: 2 }, multi: { success: true, costUsd: 2, latencyMs: 8, toolCalls: 3, steps: 4 } },
        ],
      },
    ];
    const aggregate = compare(rows);
    expect(aggregate.independent.single.successRate).toBe(0.5);
    expect(aggregate.independent.multi.successRate).toBe(1);
    expect(decisionRule(aggregate)).toContain("50.0%");
    expect(decisionRule(aggregate)).toContain("single-agent");
  });

  it("runs one scripted worker and writes a final reply", async () => {
    const db = await createDb({ idempotentRefunds: true });
    let call = 0;
    const llm: LlmClient = {
      async complete(request) {
        call += 1;
        if (request.jsonObject) {
          return assistant(JSON.stringify({ subtasks: [{ id: "s1", worker: "lookup", instruction: "Get order 4521", dependsOn: [] }] }));
        }
        if (request.tools.length > 0 && call === 2) {
          return assistant(null, [toolCall("get_order", { order_id: 4521 })]);
        }
        return assistant("Order 4521 is delivered.");
      },
    };
    const result = await runMultiAgent({
      userMessage: "What is the status of order 4521?",
      flags: {
        stepLimit: 5,
        costBudgetUsd: 10,
        loopDetection: true,
        loopRepeatLimit: 3,
        humanEscalation: false,
        idempotentRefunds: true,
        flakySearch: false,
        refundTimeoutOnce: false,
      },
      db,
      llm,
      model: "test-model",
      requestId: "req-multi",
      pricing,
    });
    expect(result.status).toBe("completed");
    expect(result.finalReply).toContain("4521");
    expect(result.toolCalls.map((call) => call.name)).toEqual(["get_order"]);
    expect(result.db.orders.find((order) => order.id === 4521)?.status).toBe("delivered");
    db.close();
  });
});
