import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/core/canonical";
import { costUsd, MissingPriceError } from "@/core/cost";
import { createDb } from "@/core/db";
import { createToolContext, executeTool } from "@/core/tools";
import { runAgent } from "@/core/agent";
import { assistant, scriptedLlm, toolCall } from "@/core/llm";
import { hitBudget } from "@/projects/p1-guardrails/budget";
import { LoopDetector } from "@/projects/p1-guardrails/loopDetector";
import { SAFETY_CAP_STEPS } from "@/projects/p1-guardrails/stepLimit";
import type { ModelPrice } from "../config/pricing";

const pricing: Record<string, ModelPrice | null> = {
  "test-model": { inputPerMillion: 1, outputPerMillion: 2 },
};

function ctx(db: Awaited<ReturnType<typeof createDb>>, flags: Partial<Parameters<typeof createToolContext>[0]> = {}) {
  return createToolContext({
    db,
    runId: "run",
    requestId: "req-1",
    idempotentRefunds: false,
    flakySearch: false,
    refundTimeoutOnce: false,
    ...flags,
  });
}

describe("seed and tools", () => {
  it("seeds orders 4510-4529 including 4521", async () => {
    const db = await createDb({ idempotentRefunds: false });
    const orders = await db.allOrders();
    expect(orders).toHaveLength(20);
    expect(orders.map((order) => order.id)).toEqual(Array.from({ length: 20 }, (_, index) => 4510 + index));
    expect(orders.find((order) => order.id === 4521)?.customer).toBe("Arjun Kapoor");
    expect(orders.some((order) => order.customer === "Priya Nair")).toBe(true);
    expect(orders.some((order) => order.customer === "Siddharth Mehta")).toBe(true);
    db.close();
  });

  it("refunds only delivered or damaged orders and caps the amount", async () => {
    const db = await createDb({ idempotentRefunds: false });
    const tool = ctx(db);
    expect((await executeTool("refund", { order_id: 4512, amount: 10 }, tool)).ok).toBe(false);
    expect((await executeTool("refund", { order_id: 4521, amount: 500 }, tool)).ok).toBe(false);
    const ok = await executeTool("refund", { order_id: 4521, amount: 64 }, tool);
    expect(ok).toMatchObject({ ok: true, deduplicated: false });
    expect(await db.listRefunds()).toHaveLength(1);
    db.close();
  });

  it("updates an address only while processing", async () => {
    const db = await createDb({ idempotentRefunds: false });
    const tool = ctx(db);
    expect((await executeTool("update_address", { order_id: 4521, address: "nope" }, tool)).ok).toBe(false);
    const ok = await executeTool("update_address", { order_id: 4522, address: "1 Ring Road, Delhi" }, tool);
    expect(ok.ok).toBe(true);
    expect((await db.getOrder(4522))?.address).toBe("1 Ring Road, Delhi");
    db.close();
  });

  it("returns an empty flaky search without a hint", async () => {
    const db = await createDb({ idempotentRefunds: false });
    const tool = ctx(db, { flakySearch: true });
    const miss = await executeTool("search_orders", { customer: "Priya Nayar" }, tool);
    expect(miss).toEqual({ ok: true, data: [] });
    const hit = await executeTool("search_orders", { customer: "Priya Nair" }, tool);
    expect(hit.ok && Array.isArray(hit.data) && hit.data.length).toBe(3);
    db.close();
  });

  it("writes a refund before reporting a timeout, and a retry doubles it without idempotency", async () => {
    const db = await createDb({ idempotentRefunds: false });
    const tool = ctx(db, { refundTimeoutOnce: true });
    const first = await executeTool("refund", { order_id: 4521, amount: 64 }, tool);
    expect(first).toEqual({ ok: false, error: "Request timed out" });
    expect(await db.listRefunds()).toHaveLength(1);
    const second = await executeTool("refund", { order_id: 4521, amount: 64 }, tool);
    expect(second.ok).toBe(true);
    expect(await db.duplicateRefundOrders()).toEqual([{ order_id: 4521, count: 2 }]);
    db.close();
  });

  it("returns the original refund when the same request id is retried", async () => {
    const db = await createDb({ idempotentRefunds: true });
    const tool = ctx(db, { idempotentRefunds: true, refundTimeoutOnce: true });
    const first = await executeTool("refund", { order_id: 4521, amount: 64 }, tool);
    expect(first).toEqual({ ok: false, error: "Request timed out" });
    const second = await executeTool("refund", { order_id: 4521, amount: 64 }, tool);
    expect(second).toMatchObject({ ok: true, deduplicated: true });
    expect(await db.listRefunds()).toHaveLength(1);
    expect(await db.duplicateRefundOrders()).toEqual([]);
    db.close();
  });
});

describe("guards", () => {
  it("treats the third identical call as a loop and ignores key order", () => {
    const detector = new LoopDetector(3);
    expect(detector.observe("search_orders", { customer: "Priya", limit: 1 })).toBe(false);
    expect(detector.observe("search_orders", { limit: 1, customer: "Priya" })).toBe(false);
    expect(detector.observe("search_orders", { customer: "Priya", limit: 1 })).toBe(true);
    expect(detector.observe("search_orders", { customer: "Aisha" })).toBe(false);
  });

  it("flags cost above the budget only", () => {
    expect(hitBudget(0.3, 0.2)).toBe(true);
    expect(hitBudget(0.2, 0.2)).toBe(false);
    expect(hitBudget(5, null)).toBe(false);
  });

  it("stops a scripted loop at the safety cap", async () => {
    const db = await createDb({ idempotentRefunds: false });
    const steps = Array.from({ length: SAFETY_CAP_STEPS + 5 }, () =>
      assistant(null, [toolCall("get_order", { order_id: 4521 }, `call-${Math.random()}`)]),
    );
    const result = await runAgent({
      userMessage: "Keep looking up 4521",
      db,
      llm: scriptedLlm(steps),
      model: "test-model",
      pricing,
      flags: { loopDetection: false },
    });
    expect(result.status).toBe("safety_cap");
    expect(result.steps).toBe(SAFETY_CAP_STEPS);
    db.close();
  });

  it("stops at the step limit and opens a ticket when escalation is on", async () => {
    const db = await createDb({ idempotentRefunds: false });
    const steps = Array.from({ length: 6 }, (_, index) =>
      assistant(null, [toolCall("get_order", { order_id: 4521 + index }, `c${index}`)]),
    );
    const result = await runAgent({
      userMessage: "Look up several orders",
      db,
      llm: scriptedLlm(steps),
      model: "test-model",
      pricing,
      flags: { stepLimit: 2, humanEscalation: true, loopDetection: false },
    });
    expect(result.status).toBe("step_limit");
    expect(result.steps).toBe(2);
    expect(result.escalated).toBe(true);
    expect(result.ticketId).toBe(1);
    expect(result.finalReply.toLowerCase()).toContain("human");
    db.close();
  });

  it("stops when the scripted cost exceeds the budget", async () => {
    const db = await createDb({ idempotentRefunds: false });
    const result = await runAgent({
      userMessage: "Refund order 4521",
      db,
      llm: scriptedLlm([
        assistant(null, [toolCall("get_order", { order_id: 4521 })], { inputTokens: 2_000_000, outputTokens: 0 }),
        assistant("done"),
      ]),
      model: "test-model",
      pricing,
      flags: { costBudgetUsd: 1, loopDetection: false },
    });
    expect(result.status).toBe("budget_exceeded");
    expect(result.toolCalls).toHaveLength(0);
    db.close();
  });

  it("detects a repeated tool call inside the agent loop", async () => {
    const db = await createDb({ idempotentRefunds: false });
    const repeated = () => assistant(null, [toolCall("search_orders", { customer: "Priya Nayar" }, "same")]);
    const result = await runAgent({
      userMessage: "Find Priya Nayar",
      db,
      llm: scriptedLlm([repeated(), repeated(), repeated(), assistant("still going")]),
      model: "test-model",
      pricing,
      flags: { loopDetection: true, loopRepeatLimit: 3 },
    });
    expect(result.status).toBe("loop_detected");
    expect(result.toolCalls).toHaveLength(2);
    db.close();
  });
});

describe("cost", () => {
  it("converts tokens with the supplied table and rejects a missing price", () => {
    expect(costUsd("test-model", 1_000_000, 1_000_000, pricing)).toBe(3);
    expect(() => costUsd("test-model", 1, 1, { "test-model": null })).toThrow(MissingPriceError);
    expect(() => costUsd("missing", 1, 1, pricing)).toThrow(MissingPriceError);
  });
});

describe("canonical json", () => {
  it("sorts keys", () => {
    expect(canonicalJson({ b: 1, a: { d: 1, c: 2 } })).toBe(canonicalJson({ a: { c: 2, d: 1 }, b: 1 }));
  });
});
