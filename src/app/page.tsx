import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, GitCompare, Route, Shield } from "lucide-react";
import { readP1, readP2, readP3 } from "@/lib/results";
import { formatPct, formatUsd } from "@/lib/utils";

const flow = ["Playground", "Agent loop", "Tools", "Fresh database"];

export default function HomePage() {
  const p1 = readP1();
  const p2 = readP2();
  const p3 = readP3();
  return (
    <div className="space-y-10">
      <section className="max-w-3xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Measure the agent, then change it.</h1>
        <p className="text-base leading-7 text-zinc-700">
          One support agent looks up orders, issues refunds, and changes addresses on a fresh mock database. Three projects measure what happens when it loops, when a refund is retried, and when the same work is split across workers. Open the playground to watch one task, then read the measured before-and-after on Results.
        </p>
        <Link href="/playground" className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
          Run a task
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
      <section aria-label="Architecture" className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold">How a visit works</h2>
        <ol className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          {flow.map((label, index) => (
            <li key={label} className="flex items-center gap-2">
              <span className="rounded-md border border-zinc-200 px-3 py-2 text-sm">{label}</span>
              {index < flow.length - 1 ? <ArrowRight className="hidden size-4 text-zinc-400 sm:block" aria-hidden /> : null}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          Guards and the live trace sit on the loop. The full eval set runs on a laptop and is saved as JSON. This site replays one task at a time and displays those saved numbers.
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <Card
          href="/results#p1"
          icon={<Shield className="size-4" aria-hidden />}
          title="Guardrails"
          body="A step limit, a cost budget, loop detection, and a human ticket when a run gets stuck."
          stat={
            p1
              ? `Stuck rate ${formatPct(p1.conditions.guardsOff.aggregate.stuckRate)} → ${formatPct(p1.conditions.guardsOn.aggregate.stuckRate)}`
              : "Measured comparison not published yet."
          }
        />
        <Card
          href="/results#p2"
          icon={<Route className="size-4" aria-hidden />}
          title="Trajectory and refunds"
          body="Score the tool path separately from the final database, and make a timed-out refund safe to retry."
          stat={
            p2
              ? `Duplicate refunds ${p2.conditions.idempotencyOff.aggregate.duplicateOrders} → ${p2.conditions.idempotencyOn.aggregate.duplicateOrders}`
              : "Measured comparison not published yet."
          }
        />
        <Card
          href="/results#p3"
          icon={<GitCompare className="size-4" aria-hidden />}
          title="Single vs multi-agent"
          body="The same harder tasks, solved by one agent and by a lead that delegates to workers."
          stat={
            p3
              ? `Success ${formatPct(p3.aggregate.overall.single.successRate)} vs ${formatPct(p3.aggregate.overall.multi.successRate)} · ${formatUsd(p3.aggregate.overall.single.avgCostUsd)} vs ${formatUsd(p3.aggregate.overall.multi.avgCostUsd)}`
              : "Measured comparison not published yet."
          }
        />
      </section>
    </div>
  );
}

function Card({
  href,
  icon,
  title,
  body,
  stat,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  body: string;
  stat: string;
}) {
  return (
    <Link href={href} className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-400">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-semibold">{title}</h2>
      </div>
      <p className="mt-2 flex-1 text-sm leading-6 text-zinc-700">{body}</p>
      <p className="mt-4 text-sm font-medium text-zinc-950">{stat}</p>
    </Link>
  );
}
