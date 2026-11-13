import Link from "next/link";
import { readP1, readP2, readP3 } from "@/lib/results";
import { formatPct, formatUsd } from "@/lib/utils";

export default function HomePage() {
  const p1 = readP1();
  const p2 = readP2();
  const p3 = readP3();
  return (
    <div className="space-y-8">
      <section className="max-w-3xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Measure the agent, then change it.</h1>
        <p className="text-zinc-700">
          One support agent can look up orders, issue refunds, and change addresses on a fresh in-memory database.
          Three projects measure what happens when it loops, when a refund is retried, and when the same work is split across workers.
          Every number on this site is read from a committed eval file. If a file is missing, the card stays empty.
        </p>
      </section>
      <section aria-label="Architecture" className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="mb-3 font-semibold">Architecture</h2>
        <div className="grid gap-2 sm:grid-cols-5">
          {["Playground", "API route", "Agent loop", "Tools", "In-memory DB"].map((label) => (
            <div key={label} className="rounded-md border border-zinc-200 px-3 py-4 text-center">
              {label}
            </div>
          ))}
        </div>
        <p className="mt-3 text-zinc-600">Guards, the trace, and the local eval runner sit beside the loop. The deployed site does not run the full eval set.</p>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <Card
          href="/results"
          title="P1 Guardrails"
          body="Loop detection, a step limit, a cost budget, and a human ticket when a run gets stuck."
          stat={
            p1
              ? `Stuck rate ${formatPct(p1.conditions.guardsOff.aggregate.stuckRate)} → ${formatPct(p1.conditions.guardsOn.aggregate.stuckRate)}`
              : "No results/p1.json yet."
          }
        />
        <Card
          href="/results"
          title="P2 Trajectory"
          body="Score the tool path separately from the final database, and make refunds safe to retry."
          stat={
            p2
              ? `Duplicate refunds ${p2.conditions.idempotencyOff.aggregate.duplicateOrders} → ${p2.conditions.idempotencyOn.aggregate.duplicateOrders}`
              : "No results/p2.json yet."
          }
        />
        <Card
          href="/about"
          title="P3 Single vs multi"
          body="The same harder tasks, solved by one agent and by an orchestrator with workers."
          stat={
            p3
              ? `Success ${formatPct(p3.aggregate.overall.single.successRate)} vs ${formatPct(p3.aggregate.overall.multi.successRate)} · ${formatUsd(p3.aggregate.overall.single.avgCostUsd)} vs ${formatUsd(p3.aggregate.overall.multi.avgCostUsd)}`
              : "No results/p3.json yet."
          }
        />
      </section>
    </div>
  );
}

function Card({ href, title, body, stat }: { href: string; title: string; body: string; stat: string }) {
  return (
    <Link href={href} className="block rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-400">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-zinc-700">{body}</p>
      <p className="mt-4 text-sm font-medium">{stat}</p>
    </Link>
  );
}
