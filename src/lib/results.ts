import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { P1Aggregate, P2Row } from "@/evals/aggregate";
import type { AccuracyRates } from "@/evals/aggregate";
import type { Comparison } from "@/projects/p3-multiagent/compare";
import type { TraceEvent } from "@/core/trace";

export type P1File = {
  project: "p1";
  generatedAt: string;
  model: string;
  taskCount: number;
  conditions: {
    guardsOff: { aggregate: P1Aggregate };
    guardsOn: { aggregate: P1Aggregate };
  };
};

export type P2File = {
  project: "p2";
  generatedAt: string;
  model: string;
  taskCount: number;
  conditions: {
    idempotencyOff: { rows: P2Row[]; aggregate: AccuracyRates & { taskCount: number } };
    idempotencyOn: { rows: P2Row[]; aggregate: AccuracyRates & { taskCount: number } };
  };
};

export type P3File = {
  project: "p3";
  generatedAt: string;
  model: string;
  trials: number;
  taskCount: number;
  aggregate: Comparison;
  decisionRule: string;
};

export type SavedTrace = {
  name: string;
  taskId?: string;
  input?: string;
  trace: TraceEvent[];
};

function readJsonFile(file: string): unknown {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function readP1(): P1File | null {
  const value = readJsonFile(path.join(process.cwd(), "results", "p1.json"));
  if (!isRecord(value) || value.project !== "p1") return null;
  return value as P1File;
}

export function readP2(): P2File | null {
  const value = readJsonFile(path.join(process.cwd(), "results", "p2.json"));
  if (!isRecord(value) || value.project !== "p2") return null;
  return value as P2File;
}

export function readP3(): P3File | null {
  const value = readJsonFile(path.join(process.cwd(), "results", "p3.json"));
  if (!isRecord(value) || value.project !== "p3" || typeof value.decisionRule !== "string") return null;
  return value as P3File;
}

export function listTraces(): SavedTrace[] {
  const dir = path.join(process.cwd(), "results", "traces");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .flatMap((name) => {
      const data = readJsonFile(path.join(dir, name));
      if (!isRecord(data) || !Array.isArray(data.trace)) return [];
      const saved: SavedTrace = {
        name,
        trace: data.trace as TraceEvent[],
      };
      if (typeof data.taskId === "string") saved.taskId = data.taskId;
      if (typeof data.input === "string") saved.input = data.input;
      return [saved];
    });
}
