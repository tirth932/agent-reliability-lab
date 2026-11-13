import { readP3 } from "@/lib/results";

export default function AboutPage() {
  const p3 = readP3();
  return (
    <div className="max-w-3xl space-y-6 text-sm leading-6 text-zinc-800">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">About</h1>
      <section>
        <h2 className="text-lg font-semibold text-zinc-950">Decision rule</h2>
        <p className="mt-2">{p3?.decisionRule ?? "TODO(me): run pnpm eval:p3 and commit results/p3.json. This sentence will be replaced by the rule computed from that file."}</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-zinc-950">Methodology</h2>
        <p className="mt-2">
          Tasks live in evals/tasks.jsonl (50) and evals/multi_tasks.jsonl (30). Each run opens a new in-memory database seeded from the same 20 orders.
          Outcome accuracy checks the database after the run. Tool accuracy compares the ordered tool calls with the expected path.
          P3 runs each harder task with one agent and with an orchestrator, for multiple trials, and reports the mean.
          Eval scripts run on your machine. This site only replays one live task at a time and displays the committed JSON.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-zinc-950">Limitations</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>The task set is small, so a few unusual replies move the percentages.</li>
          <li>Model output is not fully deterministic, even at temperature 0. P3 averages trials for that reason.</li>
          <li>Orders, payments, and failures are mock data. A timeout is simulated after the refund row is written.</li>
          <li>Dollar figures use the prices you enter in config/pricing.ts. They are model-specific and go stale.</li>
          <li>The default Groq model does not emit parallel tool calls, so multi-tool turns usually take extra steps.</li>
        </ul>
      </section>
    </div>
  );
}
