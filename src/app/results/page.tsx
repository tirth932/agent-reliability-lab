import { CompareChart } from "@/components/charts";
import { TraceTimeline } from "@/components/trace-timeline";
import { listTraces, readP1, readP2, readP3 } from "@/lib/results";
import { formatMs, formatPct, formatUsd } from "@/lib/utils";

export default function ResultsPage() {
  const p1 = readP1();
  const p2 = readP2();
  const p3 = readP3();
  const traces = listTraces();
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-700">
          These tables are rendered from <code>results/*.json</code>. Nothing here is typed in by hand. Run the eval scripts locally and commit the files to fill this page.
        </p>
      </div>

      <section id="p1" className="space-y-4">
        <h2 className="text-xl font-semibold">P1 Guardrails</h2>
        {p1 ? (
          <>
            <p className="text-xs text-zinc-500">
              {p1.model} · {p1.taskCount} tasks · {p1.generatedAt}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">Condition</th>
                    <th className="py-2 pr-3">Stuck rate</th>
                    <th className="py-2 pr-3">Avg steps</th>
                    <th className="py-2 pr-3">Avg cost</th>
                    <th className="py-2 pr-3">Avg latency</th>
                    <th className="py-2">Escalated</th>
                  </tr>
                </thead>
                <tbody>
                  <ResultRow label="Guards off" cells={p1.conditions.guardsOff.aggregate} />
                  <ResultRow label="Guards on" cells={p1.conditions.guardsOn.aggregate} />
                </tbody>
              </table>
            </div>
            <CompareChart
              title="P1 before and after"
              data={[
                { name: "Stuck rate", before: p1.conditions.guardsOff.aggregate.stuckRate, after: p1.conditions.guardsOn.aggregate.stuckRate },
                { name: "Avg steps", before: p1.conditions.guardsOff.aggregate.avgSteps, after: p1.conditions.guardsOn.aggregate.avgSteps },
                { name: "Avg cost", before: p1.conditions.guardsOff.aggregate.avgCostUsd, after: p1.conditions.guardsOn.aggregate.avgCostUsd },
              ]}
            />
          </>
        ) : (
          <Empty label="results/p1.json" command="pnpm eval:p1" />
        )}
      </section>

      <section id="p2" className="space-y-4">
        <h2 className="text-xl font-semibold">P2 Trajectory and idempotency</h2>
        {p2 ? (
          <>
            <p className="text-xs text-zinc-500">
              {p2.model} · {p2.taskCount} tasks · {p2.generatedAt}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">Condition</th>
                    <th className="py-2 pr-3">Duplicate refunds</th>
                    <th className="py-2 pr-3">Strict tools</th>
                    <th className="py-2 pr-3">Outcome</th>
                    <th className="py-2">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {(["idempotencyOff", "idempotencyOn"] as const).map((key) => {
                    const aggregate = p2.conditions[key].aggregate;
                    return (
                      <tr key={key} className="border-b">
                        <td className="py-2 pr-3">{key === "idempotencyOff" ? "Idempotency off" : "Idempotency on"}</td>
                        <td className="py-2 pr-3">{aggregate.duplicateOrders}</td>
                        <td className="py-2 pr-3">{formatPct(aggregate.strict)}</td>
                        <td className="py-2 pr-3">{formatPct(aggregate.outcome)}</td>
                        <td className="py-2">{formatPct(aggregate.outcome - aggregate.strict)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-zinc-700">The gap column is outcome accuracy minus strict tool-path accuracy. A positive gap means the database looked right more often than the path did.</p>
            <CompareChart
              title="P2 answer vs path"
              data={[
                { name: "Strict tools", before: p2.conditions.idempotencyOff.aggregate.strict, after: p2.conditions.idempotencyOn.aggregate.strict },
                { name: "Outcome", before: p2.conditions.idempotencyOff.aggregate.outcome, after: p2.conditions.idempotencyOn.aggregate.outcome },
                { name: "Duplicates", before: p2.conditions.idempotencyOff.aggregate.duplicateOrders, after: p2.conditions.idempotencyOn.aggregate.duplicateOrders },
              ]}
            />
          </>
        ) : (
          <Empty label="results/p2.json" command="pnpm eval:p2" />
        )}
      </section>

      <section id="p3" className="space-y-4">
        <h2 className="text-xl font-semibold">P3 Single vs multi-agent</h2>
        {p3 ? (
          <>
            <p className="text-xs text-zinc-500">
              {p3.model} · {p3.taskCount} tasks · {p3.trials} trials · {p3.generatedAt}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">Slice</th>
                    <th className="py-2 pr-3">Single success</th>
                    <th className="py-2 pr-3">Multi success</th>
                    <th className="py-2 pr-3">Single cost</th>
                    <th className="py-2 pr-3">Multi cost</th>
                    <th className="py-2">Single / multi latency</th>
                  </tr>
                </thead>
                <tbody>
                  {(["overall", "independent", "dependent"] as const).map((key) => {
                    const slice = p3.aggregate[key];
                    return (
                      <tr key={key} className="border-b">
                        <td className="py-2 pr-3 capitalize">{key}</td>
                        <td className="py-2 pr-3">{formatPct(slice.single.successRate)}</td>
                        <td className="py-2 pr-3">{formatPct(slice.multi.successRate)}</td>
                        <td className="py-2 pr-3">{formatUsd(slice.single.avgCostUsd)}</td>
                        <td className="py-2 pr-3">{formatUsd(slice.multi.avgCostUsd)}</td>
                        <td className="py-2">
                          {formatMs(slice.single.avgLatencyMs)} / {formatMs(slice.multi.avgLatencyMs)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <CompareChart
              title="P3 success rate"
              data={[
                { name: "Overall", before: p3.aggregate.overall.single.successRate, after: p3.aggregate.overall.multi.successRate },
                { name: "Independent", before: p3.aggregate.independent.single.successRate, after: p3.aggregate.independent.multi.successRate },
                { name: "Dependent", before: p3.aggregate.dependent.single.successRate, after: p3.aggregate.dependent.multi.successRate },
              ]}
            />
          </>
        ) : (
          <Empty label="results/p3.json" command="pnpm eval:p3" />
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Saved traces</h2>
        {traces.length === 0 ? (
          <Empty label="results/traces/*.json" command="pnpm eval:p1 and pnpm eval:p2" />
        ) : (
          traces.map((trace) => (
            <article key={trace.name} className="space-y-2">
              <h3 className="font-medium">
                {trace.name}
                {trace.taskId ? ` · ${trace.taskId}` : ""}
              </h3>
              {trace.input ? <p className="text-sm text-zinc-700">{trace.input}</p> : null}
              <TraceTimeline events={trace.trace} />
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function ResultRow({
  label,
  cells,
}: {
  label: string;
  cells: { stuckRate: number; avgSteps: number; avgCostUsd: number; avgLatencyMs: number; escalated: number };
}) {
  return (
    <tr className="border-b">
      <td className="py-2 pr-3">{label}</td>
      <td className="py-2 pr-3">{formatPct(cells.stuckRate)}</td>
      <td className="py-2 pr-3">{cells.avgSteps.toFixed(2)}</td>
      <td className="py-2 pr-3">{formatUsd(cells.avgCostUsd)}</td>
      <td className="py-2 pr-3">{formatMs(cells.avgLatencyMs)}</td>
      <td className="py-2">{cells.escalated}</td>
    </tr>
  );
}

function Empty({ label, command }: { label: string; command: string }) {
  return (
    <p className="rounded-md border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600">
      No data in {label}. After you fill prices and run <code>{command}</code>, commit the file and this section will fill in.
    </p>
  );
}
