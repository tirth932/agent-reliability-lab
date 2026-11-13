"use client";

import { useEffect, useState } from "react";
import { CompareChart } from "@/components/charts";
import { TraceTimeline } from "@/components/trace-timeline";
import type { P1File, P2File, P3File, SavedTrace } from "@/lib/results";
import { cn, formatMs, formatPct, formatUsd } from "@/lib/utils";

const tabs = [
  { id: "p1", label: "P1 Guardrails" },
  { id: "p2", label: "P2 Trajectory" },
  { id: "p3", label: "P3 Single vs multi" },
  { id: "traces", label: "Saved traces" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function ResultsBoard({
  p1,
  p2,
  p3,
  traces,
}: {
  p1: P1File | null;
  p2: P2File | null;
  p3: P3File | null;
  traces: SavedTrace[];
}) {
  const [tab, setTab] = useState<TabId>("p1");

  useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (tabs.some((item) => item.id === id)) setTab(id as TabId);
  }, []);

  function select(id: TabId) {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Result projects">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm",
              tab === item.id ? "bg-zinc-950 text-white" : "bg-white text-zinc-700 ring-1 ring-zinc-200",
            )}
            onClick={() => select(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "p1" ? <P1Panel data={p1} /> : null}
      {tab === "p2" ? <P2Panel data={p2} /> : null}
      {tab === "p3" ? <P3Panel data={p3} /> : null}
      {tab === "traces" ? <TracesPanel traces={traces} /> : null}
    </div>
  );
}

function P1Panel({ data }: { data: P1File | null }) {
  if (!data) return <Empty what="the guardrails before-and-after comparison" />;
  return (
    <section className="space-y-4">
      <Meta model={data.model} detail={`${data.taskCount} tasks`} at={data.generatedAt} />
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-500">
              <th className="px-4 py-2 font-medium">Condition</th>
              <th className="px-4 py-2 font-medium">Stuck rate</th>
              <th className="px-4 py-2 font-medium">Avg steps</th>
              <th className="px-4 py-2 font-medium">Avg cost</th>
              <th className="px-4 py-2 font-medium">Avg latency</th>
              <th className="px-4 py-2 font-medium">Escalated</th>
            </tr>
          </thead>
          <tbody>
            <ResultRow label="Guards off" cells={data.conditions.guardsOff.aggregate} />
            <ResultRow label="Guards on" cells={data.conditions.guardsOn.aggregate} />
          </tbody>
        </table>
      </div>
      <CompareChart
        title="Guards off versus guards on"
        beforeLabel="Guards off"
        afterLabel="Guards on"
        data={[
          { name: "Stuck rate", before: data.conditions.guardsOff.aggregate.stuckRate, after: data.conditions.guardsOn.aggregate.stuckRate },
          { name: "Avg steps", before: data.conditions.guardsOff.aggregate.avgSteps, after: data.conditions.guardsOn.aggregate.avgSteps },
          { name: "Avg cost", before: data.conditions.guardsOff.aggregate.avgCostUsd, after: data.conditions.guardsOn.aggregate.avgCostUsd },
        ]}
      />
    </section>
  );
}

function P2Panel({ data }: { data: P2File | null }) {
  if (!data) return <Empty what="the trajectory and idempotency comparison" />;
  return (
    <section className="space-y-4">
      <Meta model={data.model} detail={`${data.taskCount} tasks`} at={data.generatedAt} />
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-500">
              <th className="px-4 py-2 font-medium">Condition</th>
              <th className="px-4 py-2 font-medium">Duplicate refunds</th>
              <th className="px-4 py-2 font-medium">Tool path</th>
              <th className="px-4 py-2 font-medium">Outcome</th>
              <th className="px-4 py-2 font-medium">Outcome minus path</th>
            </tr>
          </thead>
          <tbody>
            {(["idempotencyOff", "idempotencyOn"] as const).map((key) => {
              const aggregate = data.conditions[key].aggregate;
              return (
                <tr key={key} className="border-b last:border-0">
                  <td className="px-4 py-2">{key === "idempotencyOff" ? "Idempotency off" : "Idempotency on"}</td>
                  <td className="px-4 py-2">{aggregate.duplicateOrders}</td>
                  <td className="px-4 py-2">{formatPct(aggregate.strict)}</td>
                  <td className="px-4 py-2">{formatPct(aggregate.outcome)}</td>
                  <td className="px-4 py-2">{formatPct(aggregate.outcome - aggregate.strict)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-zinc-700">
        Outcome minus path is the gap the project is built to show: the database can look right even when the tool path was wrong.
      </p>
      <CompareChart
        title="Answer versus tool path"
        beforeLabel="Idempotency off"
        afterLabel="Idempotency on"
        data={[
          { name: "Tool path", before: data.conditions.idempotencyOff.aggregate.strict, after: data.conditions.idempotencyOn.aggregate.strict },
          { name: "Outcome", before: data.conditions.idempotencyOff.aggregate.outcome, after: data.conditions.idempotencyOn.aggregate.outcome },
          { name: "Duplicates", before: data.conditions.idempotencyOff.aggregate.duplicateOrders, after: data.conditions.idempotencyOn.aggregate.duplicateOrders },
        ]}
      />
    </section>
  );
}

function P3Panel({ data }: { data: P3File | null }) {
  if (!data) return <Empty what="the single-agent versus multi-agent comparison" />;
  return (
    <section className="space-y-4">
      <Meta model={data.model} detail={`${data.taskCount} tasks · ${data.trials} trials`} at={data.generatedAt} />
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-500">
              <th className="px-4 py-2 font-medium">Slice</th>
              <th className="px-4 py-2 font-medium">Single success</th>
              <th className="px-4 py-2 font-medium">Multi success</th>
              <th className="px-4 py-2 font-medium">Single cost</th>
              <th className="px-4 py-2 font-medium">Multi cost</th>
              <th className="px-4 py-2 font-medium">Latency</th>
            </tr>
          </thead>
          <tbody>
            {(["overall", "independent", "dependent"] as const).map((key) => {
              const slice = data.aggregate[key];
              return (
                <tr key={key} className="border-b last:border-0">
                  <td className="px-4 py-2 capitalize">{key}</td>
                  <td className="px-4 py-2">{formatPct(slice.single.successRate)}</td>
                  <td className="px-4 py-2">{formatPct(slice.multi.successRate)}</td>
                  <td className="px-4 py-2">{formatUsd(slice.single.avgCostUsd)}</td>
                  <td className="px-4 py-2">{formatUsd(slice.multi.avgCostUsd)}</td>
                  <td className="px-4 py-2">
                    {formatMs(slice.single.avgLatencyMs)} / {formatMs(slice.multi.avgLatencyMs)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CompareChart
        title="Success rate"
        beforeLabel="Single agent"
        afterLabel="Multi-agent"
        data={[
          { name: "Overall", before: data.aggregate.overall.single.successRate, after: data.aggregate.overall.multi.successRate },
          { name: "Independent", before: data.aggregate.independent.single.successRate, after: data.aggregate.independent.multi.successRate },
          { name: "Dependent", before: data.aggregate.dependent.single.successRate, after: data.aggregate.dependent.multi.successRate },
        ]}
      />
    </section>
  );
}

function TracesPanel({ traces }: { traces: SavedTrace[] }) {
  if (traces.length === 0) {
    return <Empty what="example traces of a loop and a double refund" />;
  }
  return (
    <div className="space-y-6">
      {traces.map((trace) => (
        <article key={trace.name} className="space-y-2">
          <h2 className="font-medium">
            {traceLabel(trace.name)}
            {trace.taskId ? ` · ${trace.taskId}` : ""}
          </h2>
          {trace.input ? <p className="text-sm text-zinc-700">{trace.input}</p> : null}
          <TraceTimeline events={trace.trace} />
        </article>
      ))}
    </div>
  );
}

function traceLabel(name: string): string {
  if (name.includes("loop")) return "Looping run";
  if (name.includes("double-refund")) return "Double refund";
  return name;
}

function ResultRow({
  label,
  cells,
}: {
  label: string;
  cells: { stuckRate: number; avgSteps: number; avgCostUsd: number; avgLatencyMs: number; escalated: number };
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2">{label}</td>
      <td className="px-4 py-2">{formatPct(cells.stuckRate)}</td>
      <td className="px-4 py-2">{cells.avgSteps.toFixed(2)}</td>
      <td className="px-4 py-2">{formatUsd(cells.avgCostUsd)}</td>
      <td className="px-4 py-2">{formatMs(cells.avgLatencyMs)}</td>
      <td className="px-4 py-2">{cells.escalated}</td>
    </tr>
  );
}

function Meta({ model, detail, at }: { model: string; detail: string; at: string }) {
  return (
    <p className="text-xs text-zinc-500">
      {model} · {detail} · {at}
    </p>
  );
}

function Empty({ what }: { what: string }) {
  const sentence = what.charAt(0).toUpperCase() + what.slice(1);
  return (
    <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm leading-6 text-zinc-600">
      {sentence} is not published yet. This page only shows numbers from a committed eval file, so nothing here is estimated.
    </p>
  );
}
