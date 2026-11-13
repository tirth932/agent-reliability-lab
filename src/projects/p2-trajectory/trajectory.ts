import { canonicalJson } from "@/core/canonical";

export type MatchMode = "strict" | "unordered" | "subset" | "superset";

export type NamedCall = {
  name: string;
  args?: unknown;
};

export type ExpectedArg = {
  name: string;
  args: Record<string, unknown>;
};

function counts(names: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const name of names) map.set(name, (map.get(name) ?? 0) + 1);
  return map;
}

export function matchNames(actual: string[], expected: string[], mode: MatchMode): boolean {
  if (mode === "strict") {
    return actual.length === expected.length && actual.every((name, index) => name === expected[index]);
  }
  const actualCounts = counts(actual);
  const expectedCounts = counts(expected);
  if (mode === "unordered") {
    if (actualCounts.size !== expectedCounts.size) return false;
    for (const [name, count] of expectedCounts) {
      if (actualCounts.get(name) !== count) return false;
    }
    return true;
  }
  if (mode === "subset") {
    for (const [name, count] of actualCounts) {
      if ((expectedCounts.get(name) ?? 0) < count) return false;
    }
    return true;
  }
  for (const [name, count] of expectedCounts) {
    if ((actualCounts.get(name) ?? 0) < count) return false;
  }
  return true;
}

function sameArgs(actual: unknown, expected: Record<string, unknown>): boolean {
  return canonicalJson(actual ?? {}) === canonicalJson(expected);
}

function argsMatch(actual: NamedCall[], expectedArgs: ExpectedArg[], mode: MatchMode): boolean {
  if (mode === "subset") {
    for (const expected of expectedArgs) {
      const calls = actual.filter((call) => call.name === expected.name);
      if (calls.length === 0) continue;
      if (!calls.some((call) => sameArgs(call.args, expected.args))) return false;
    }
    return true;
  }
  let from = 0;
  for (const expected of expectedArgs) {
    const found = actual.findIndex((call, index) => index >= from && call.name === expected.name && sameArgs(call.args, expected.args));
    if (found < 0) return false;
    from = found + 1;
  }
  return true;
}

export function matchTrajectory(
  actual: NamedCall[],
  expectedTools: string[],
  mode: MatchMode,
  expectedArgs?: ExpectedArg[],
): boolean {
  if (!matchNames(actual.map((call) => call.name), expectedTools, mode)) return false;
  if (!expectedArgs || expectedArgs.length === 0) return true;
  return argsMatch(actual, expectedArgs, mode);
}
