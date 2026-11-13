import type { DbSnapshot } from "@/core/types";
import type { RunMetrics } from "@/core/trace";
import { formatMs, formatUsd } from "@/lib/utils";

const statusClass: Record<string, string> = {
  processing: "bg-sky-50 text-sky-800",
  shipped: "bg-amber-50 text-amber-800",
  delivered: "bg-emerald-50 text-emerald-800",
  damaged: "bg-red-50 text-red-800",
  cancelled: "bg-zinc-100 text-zinc-600",
};

export function DbPanel({ metrics, db }: { metrics: RunMetrics | null; db: DbSnapshot | null }) {
  const refunded = new Set(db?.refunds.map((refund) => refund.order_id) ?? []);
  return (
    <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto">
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">This run</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Metric label="Steps" value={metrics ? String(metrics.steps) : "—"} />
          <Metric label="Tokens" value={metrics ? String(metrics.tokens) : "—"} />
          <Metric label="List-price cost" value={metrics ? formatUsd(metrics.costUsd) : "—"} />
          <Metric label="Latency" value={metrics ? formatMs(metrics.latencyMs) : "—"} />
        </dl>
      </section>
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Refunds</h2>
        {db && db.refunds.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm">
            {db.refunds.map((refund) => (
              <li key={refund.id} className="rounded-md bg-emerald-50 px-3 py-2">
                Order {refund.order_id} · ₹{refund.amount}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">{db ? "No refund was written." : "Refunds appear after a run."}</p>
        )}
        <h2 className="mt-4 text-sm font-semibold">Tickets</h2>
        {db && db.tickets.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm">
            {db.tickets.map((ticket) => (
              <li key={ticket.id} className="rounded-md bg-amber-50 px-3 py-2">
                <p className="font-medium">Ticket #{ticket.id}</p>
                <p className="mt-1">{ticket.reason}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">{db ? "No human ticket was opened." : "Tickets appear if a guard escalates."}</p>
        )}
      </section>
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Orders</h2>
        {db ? (
          <div className="mt-3 max-h-80 overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-white text-zinc-500">
                <tr>
                  <th className="py-1 pr-2 font-medium">ID</th>
                  <th className="py-1 pr-2 font-medium">Customer</th>
                  <th className="py-1 pr-2 font-medium">Status</th>
                  <th className="py-1 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {db.orders.map((order) => (
                  <tr key={order.id} className={refunded.has(order.id) ? "bg-emerald-50" : undefined}>
                    <td className="py-1.5 pr-2 font-medium">{order.id}</td>
                    <td className="py-1.5 pr-2">{order.customer}</td>
                    <td className="py-1.5 pr-2">
                      <span className={`rounded px-1.5 py-0.5 ${statusClass[order.status] ?? "bg-zinc-100"}`}>{order.status}</span>
                    </td>
                    <td className="py-1.5">₹{order.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">Each run starts from the same 20 orders.</p>
        )}
      </section>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-zinc-50 px-3 py-2">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 font-medium text-zinc-950">{value}</dd>
    </div>
  );
}
