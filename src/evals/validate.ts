import { loadSeed } from "@/core/db";
import { TOOL_SET, type Task } from "./schema";

export function validateTasks(tasks: Task[], options: { requireType: boolean }): string[] {
  const errors: string[] = [];
  const seed = loadSeed();
  const byId = new Map(seed.map((order) => [order.id, order]));
  const seen = new Set<string>();
  for (const task of tasks) {
    if (seen.has(task.id)) errors.push(`${task.id} is duplicated`);
    seen.add(task.id);
    if (options.requireType && !task.type) errors.push(`${task.id} is missing type`);
    if (!options.requireType && task.type) errors.push(`${task.id} should not set type`);
    for (const tool of task.expected_tools) {
      if (!TOOL_SET.has(tool)) errors.push(`${task.id} has unknown tool ${tool}`);
    }
    for (const refund of task.expected_state.refunds ?? []) {
      const order = byId.get(refund.order_id);
      if (!order) {
        errors.push(`${task.id} expects a refund for missing order ${refund.order_id}`);
        continue;
      }
      if (refund.count > 0 && order.status !== "delivered" && order.status !== "damaged") {
        errors.push(`${task.id} expects a refund on ${order.status} order ${order.id}`);
      }
      if (refund.amount != null && refund.amount > order.amount + 1e-9) {
        errors.push(`${task.id} expects a refund above the order amount`);
      }
    }
    for (const expected of task.expected_state.orders ?? []) {
      const order = byId.get(expected.id);
      if (!order) {
        errors.push(`${task.id} expects missing order ${expected.id}`);
        continue;
      }
      if (expected.address && expected.address !== order.address && order.status !== "processing") {
        errors.push(`${task.id} expects an address change on ${order.status} order ${order.id}`);
      }
    }
  }
  return errors;
}
