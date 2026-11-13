import { z } from "zod";

export const expectedStateSchema = z.object({
  refunds: z
    .array(
      z.object({
        order_id: z.number().int(),
        count: z.number().int().nonnegative(),
        amount: z.number().optional(),
      }),
    )
    .optional(),
  orders: z
    .array(
      z.object({
        id: z.number().int(),
        address: z.string().optional(),
        status: z.string().optional(),
      }),
    )
    .optional(),
  reply_includes: z.array(z.string()).optional(),
});

export type ExpectedState = z.infer<typeof expectedStateSchema>;

export const taskSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["easy", "multi", "tricky", "policy"]),
  input: z.string().min(1).max(300),
  expected_tools: z.array(z.string()),
  expected_args: z
    .array(
      z.object({
        name: z.string(),
        args: z.record(z.string(), z.unknown()),
      }),
    )
    .optional(),
  expected_state: expectedStateSchema,
  type: z.enum(["independent", "dependent"]).optional(),
});

export type Task = z.infer<typeof taskSchema>;

export const TOOL_SET = new Set(["get_order", "search_orders", "refund", "update_address"]);
