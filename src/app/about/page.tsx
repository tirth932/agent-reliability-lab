import { readP3 } from "@/lib/results";

export default function AboutPage() {
  const p3 = readP3();
  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">About</h1>
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Decision rule</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-800">
          {p3?.decisionRule ??
            "The rule is computed from the single-versus-multi comparison and published with that eval. It is not on this page yet, and it will not be guessed."}
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Methodology</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-800">
          There are 50 everyday support tasks and 30 harder tasks. Each run opens a new in-memory database seeded with the same 20 orders. Outcome accuracy checks that database after the run. Tool accuracy compares the ordered tool calls with the expected path. The multi-agent comparison runs each harder task once with one agent and once with a lead plus workers, over several trials, and reports the mean. Eval scripts run on a laptop. This site only replays one live task at a time and displays the committed results.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Limitations</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-800">
          <li>The task set is small, so a few unusual replies move the percentages.</li>
          <li>Model output is not fully deterministic, even at temperature 0. The multi-agent comparison averages trials for that reason.</li>
          <li>Orders, payments, and failures are mock data. A timeout is simulated after the refund row is written.</li>
          <li>Dollar figures use Groq’s published token prices. On the free plan those figures are a meter, not a bill.</li>
          <li>The default model does not emit parallel tool calls, so a turn usually contains one tool.</li>
        </ul>
      </section>
    </div>
  );
}
