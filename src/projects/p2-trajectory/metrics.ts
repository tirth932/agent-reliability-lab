import type { DbSnapshot } from "@/core/types";
import type { ExpectedState } from "@/evals/schema";

const AMOUNT_EPS = 0.02;

export function outcomeMatches(
  db: DbSnapshot,
  reply: string,
  expected: ExpectedState,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (expected.refunds) {
    const grouped = new Map<number, number[]>();
    for (const refund of db.refunds) {
      const amounts = grouped.get(refund.order_id) ?? [];
      amounts.push(refund.amount);
      grouped.set(refund.order_id, amounts);
    }
    const listed = new Set(expected.refunds.map((refund) => refund.order_id));
    for (const want of expected.refunds) {
      const amounts = grouped.get(want.order_id) ?? [];
      if (amounts.length !== want.count) {
        reasons.push(`order ${want.order_id} refund count expected ${want.count}, got ${amounts.length}`);
      }
      if (want.amount != null && want.count > 0) {
        const matched = amounts.some((amount) => Math.abs(amount - want.amount!) <= AMOUNT_EPS);
        if (!matched) reasons.push(`order ${want.order_id} refund amount expected ${want.amount}`);
      }
    }
    for (const [orderId, amounts] of grouped) {
      if (!listed.has(orderId)) reasons.push(`unexpected refund for order ${orderId} (${amounts.length})`);
    }
  }
  if (expected.orders) {
    for (const want of expected.orders) {
      const order = db.orders.find((item) => item.id === want.id);
      if (!order) {
        reasons.push(`order ${want.id} missing from snapshot`);
        continue;
      }
      if (want.address != null && order.address !== want.address) {
        reasons.push(`order ${want.id} address expected "${want.address}", got "${order.address}"`);
      }
      if (want.status != null && order.status !== want.status) {
        reasons.push(`order ${want.id} status expected ${want.status}, got ${order.status}`);
      }
    }
  }
  if (expected.reply_includes) {
    const text = reply.toLowerCase();
    for (const part of expected.reply_includes) {
      if (!text.includes(part.toLowerCase())) reasons.push(`reply did not include "${part}"`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}
