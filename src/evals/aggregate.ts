import { STUCK_STATUSES, type AgentStatus } from "@/core/types";

export type P1Row = {
  id: string;
  status: AgentStatus;
  steps: number;
  costUsd: number;
  latencyMs: number;
  escalated: boolean;
};

export type P1Aggregate = {
  taskCount: number;
  stuckCount: number;
  stuckRate: number;
  avgSteps: number;
  avgCostUsd: number;
  avgLatencyMs: number;
  escalated: number;
  completed: number;
};

export function aggregateP1(rows: P1Row[]): P1Aggregate {
  const taskCount = rows.length;
  if (taskCount === 0) {
    return { taskCount: 0, stuckCount: 0, stuckRate: 0, avgSteps: 0, avgCostUsd: 0, avgLatencyMs: 0, escalated: 0, completed: 0 };
  }
  const stuckCount = rows.filter((row) => STUCK_STATUSES.includes(row.status)).length;
  const sum = (pick: (row: P1Row) => number) => rows.reduce((total, row) => total + pick(row), 0) / taskCount;
  return {
    taskCount,
    stuckCount,
    stuckRate: stuckCount / taskCount,
    avgSteps: sum((row) => row.steps),
    avgCostUsd: sum((row) => row.costUsd),
    avgLatencyMs: sum((row) => row.latencyMs),
    escalated: rows.filter((row) => row.escalated).length,
    completed: rows.filter((row) => row.status === "completed").length,
  };
}

export type AccuracyRates = {
  strict: number;
  unordered: number;
  subset: number;
  superset: number;
  outcome: number;
  duplicateOrders: number;
};

export type P2Row = P1Row & {
  duplicateRefunds: number;
  strict: boolean;
  unordered: boolean;
  subset: boolean;
  superset: boolean;
  outcome: boolean;
};

export function aggregateP2(rows: P2Row[]): AccuracyRates & { taskCount: number } {
  const taskCount = rows.length;
  const rate = (pick: (row: P2Row) => boolean) => (taskCount === 0 ? 0 : rows.filter(pick).length / taskCount);
  return {
    taskCount,
    strict: rate((row) => row.strict),
    unordered: rate((row) => row.unordered),
    subset: rate((row) => row.subset),
    superset: rate((row) => row.superset),
    outcome: rate((row) => row.outcome),
    duplicateOrders: rows.reduce((total, row) => total + row.duplicateRefunds, 0),
  };
}
