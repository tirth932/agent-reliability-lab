import { z } from "zod";
import type { Db } from "./db";
import { IdempotencyConflict } from "./db";
import { consumeRefundTimeout, createRefundFaultState, flakySearchMiss, type RefundFaultState } from "./faults";
import { refundIdempotencyKey } from "@/projects/p2-trajectory/idempotency";
import type { ToolResult } from "./types";

export const TOOL_NAMES = ["get_order", "search_orders", "refund", "update_address"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const getOrderSchema = z.object({ order_id: z.number().int() });
const searchSchema = z.object({ customer: z.string().min(1) });
const refundSchema = z.object({
  order_id: z.number().int(),
  amount: z.number().positive(),
});
const addressSchema = z.object({
  order_id: z.number().int(),
  address: z.string().min(1),
});

export type ToolContext = {
  db: Db;
  runId: string;
  requestId: string;
  idempotentRefunds: boolean;
  flakySearch: boolean;
  refundTimeoutOnce: boolean;
  refundFault: RefundFaultState;
};

export function createToolContext(input: {
  db: Db;
  runId: string;
  requestId: string;
  idempotentRefunds: boolean;
  flakySearch: boolean;
  refundTimeoutOnce: boolean;
  refundFault?: RefundFaultState;
}): ToolContext {
  return {
    ...input,
    refundFault: input.refundFault ?? createRefundFaultState(),
  };
}

export type ToolDefinition = {
  name: ToolName;
  description: string;
  parameters: Record<string, unknown>;
};

export const TOOL_DEFINITIONS: Record<ToolName, ToolDefinition> = {
  get_order: {
    name: "get_order",
    description: "Fetch one order by its numeric id.",
    parameters: {
      type: "object",
      properties: { order_id: { type: "integer", description: "Order id, for example 4521." } },
      required: ["order_id"],
      additionalProperties: false,
    },
  },
  search_orders: {
    name: "search_orders",
    description: "Find orders whose customer name contains this text, case-insensitive.",
    parameters: {
      type: "object",
      properties: { customer: { type: "string", description: "Customer name or part of it." } },
      required: ["customer"],
      additionalProperties: false,
    },
  },
  refund: {
    name: "refund",
    description: "Refund an order. Allowed only when status is delivered or damaged, and amount is at most the order amount.",
    parameters: {
      type: "object",
      properties: {
        order_id: { type: "integer" },
        amount: { type: "number", exclusiveMinimum: 0 },
      },
      required: ["order_id", "amount"],
      additionalProperties: false,
    },
  },
  update_address: {
    name: "update_address",
    description: "Change the shipping address. Allowed only when status is processing.",
    parameters: {
      type: "object",
      properties: {
        order_id: { type: "integer" },
        address: { type: "string" },
      },
      required: ["order_id", "address"],
      additionalProperties: false,
    },
  },
};

export function definitionsFor(names: readonly ToolName[]): ToolDefinition[] {
  return names.map((name) => TOOL_DEFINITIONS[name]);
}

function parsed<T>(schema: z.ZodType<T>, args: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(args);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((issue) => issue.message).join("; ") };
  }
  return { ok: true, data: result.data };
}

function refundPayload(row: { id: number; order_id: number; amount: number }, deduplicated: boolean): ToolResult {
  return {
    ok: true,
    deduplicated,
    data: { refund_id: row.id, order_id: row.order_id, amount: row.amount },
  };
}

export async function executeTool(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  if (name === "get_order") {
    const input = parsed(getOrderSchema, args);
    if (!input.ok) return input;
    const order = await ctx.db.getOrder(input.data.order_id);
    if (!order) return { ok: false, error: `Order ${input.data.order_id} was not found.` };
    return { ok: true, data: order };
  }

  if (name === "search_orders") {
    const input = parsed(searchSchema, args);
    if (!input.ok) return input;
    if (ctx.flakySearch && flakySearchMiss(input.data.customer, await ctx.db.customerNames())) {
      return { ok: true, data: [] };
    }
    const orders = await ctx.db.searchOrders(input.data.customer);
    return { ok: true, data: orders };
  }

  if (name === "refund") {
    const input = parsed(refundSchema, args);
    if (!input.ok) return input;
    const order = await ctx.db.getOrder(input.data.order_id);
    if (!order) return { ok: false, error: `Order ${input.data.order_id} was not found.` };
    if (order.status !== "delivered" && order.status !== "damaged") {
      return {
        ok: false,
        error: `Refunds are only allowed for delivered or damaged orders. Order ${order.id} is ${order.status}.`,
      };
    }
    if (input.data.amount > order.amount + 1e-9) {
      return {
        ok: false,
        error: `Refund amount ${input.data.amount} exceeds the order amount ${order.amount}.`,
      };
    }
    const key = ctx.idempotentRefunds ? refundIdempotencyKey(order.id, ctx.requestId) : null;
    if (key) {
      const existing = await ctx.db.findRefundByKey(key);
      if (existing) return refundPayload(existing, true);
    }
    try {
      const created = await ctx.db.insertRefund({
        orderId: order.id,
        amount: input.data.amount,
        idempotencyKey: key,
      });
      if (ctx.refundTimeoutOnce && consumeRefundTimeout(ctx.refundFault)) {
        return { ok: false, error: "Request timed out" };
      }
      return refundPayload(created, false);
    } catch (error) {
      if (error instanceof IdempotencyConflict && key) {
        const existing = await ctx.db.findRefundByKey(key);
        if (existing) return refundPayload(existing, true);
      }
      throw error;
    }
  }

  if (name === "update_address") {
    const input = parsed(addressSchema, args);
    if (!input.ok) return input;
    const order = await ctx.db.getOrder(input.data.order_id);
    if (!order) return { ok: false, error: `Order ${input.data.order_id} was not found.` };
    if (order.status !== "processing") {
      return {
        ok: false,
        error: `Address changes are only allowed while an order is processing. Order ${order.id} is ${order.status}.`,
      };
    }
    await ctx.db.updateAddress(order.id, input.data.address);
    const updated = await ctx.db.getOrder(order.id);
    return { ok: true, data: updated };
  }

  return { ok: false, error: `Unknown tool ${name}.` };
}
