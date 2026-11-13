export type TrialMetrics = {
  success: boolean;
  costUsd: number;
  latencyMs: number;
  toolCalls: number;
  steps: number;
};

export type P3TaskRow = {
  id: string;
  type: "independent" | "dependent";
  trials: { single: TrialMetrics; multi: TrialMetrics }[];
};

export type StatBlock = {
  n: number;
  successRate: number;
  avgCostUsd: number;
  avgLatencyMs: number;
  avgToolCalls: number;
  avgSteps: number;
};

export type Comparison = {
  overall: { single: StatBlock; multi: StatBlock };
  independent: { single: StatBlock; multi: StatBlock };
  dependent: { single: StatBlock; multi: StatBlock };
};

export function summarize(trials: TrialMetrics[]): StatBlock {
  const n = trials.length;
  if (n === 0) {
    return { n: 0, successRate: 0, avgCostUsd: 0, avgLatencyMs: 0, avgToolCalls: 0, avgSteps: 0 };
  }
  const avg = (pick: (trial: TrialMetrics) => number) => trials.reduce((sum, trial) => sum + pick(trial), 0) / n;
  return {
    n,
    successRate: avg((trial) => (trial.success ? 1 : 0)),
    avgCostUsd: avg((trial) => trial.costUsd),
    avgLatencyMs: avg((trial) => trial.latencyMs),
    avgToolCalls: avg((trial) => trial.toolCalls),
    avgSteps: avg((trial) => trial.steps),
  };
}

export function compare(rows: P3TaskRow[]): Comparison {
  const side = (type: "all" | "independent" | "dependent", which: "single" | "multi") => {
    const selected = type === "all" ? rows : rows.filter((row) => row.type === type);
    return summarize(selected.flatMap((row) => row.trials.map((trial) => trial[which])));
  };
  return {
    overall: { single: side("all", "single"), multi: side("all", "multi") },
    independent: { single: side("independent", "single"), multi: side("independent", "multi") },
    dependent: { single: side("dependent", "single"), multi: side("dependent", "multi") },
  };
}

export function decisionRule(aggregate: Comparison): string {
  const independent = aggregate.independent;
  if (independent.single.n === 0) {
    return "TODO(me): run pnpm eval:p3 and commit results/p3.json before writing the decision rule.";
  }
  const delta = independent.multi.successRate - independent.single.successRate;
  const pct = (delta * 100).toFixed(1);
  const singlePct = (independent.single.successRate * 100).toFixed(1);
  const multiPct = (independent.multi.successRate * 100).toFixed(1);
  const ratio =
    independent.single.avgCostUsd === 0 ? null : independent.multi.avgCostUsd / independent.single.avgCostUsd;
  const costText =
    ratio == null
      ? "single-agent cost was 0 so the cost ratio is undefined"
      : `about ${ratio.toFixed(2)}x the single-agent cost`;
  if (delta <= 0) {
    return `Use single-agent by default. On independent tasks in this run, multi-agent success was ${multiPct}% and single-agent success was ${singlePct}%, so multi-agent did not improve success (${costText}).`;
  }
  return `Use single-agent by default; switch to multi-agent only for tasks with independent subtasks where success improves by more than ${pct}% for the extra cost (this run: independent multi-agent success ${multiPct}% vs single-agent ${singlePct}%, at ${costText}).`;
}
