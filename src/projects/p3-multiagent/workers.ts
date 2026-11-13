import type { ToolName } from "@/core/tools";

export const WORKER_NAMES = ["lookup", "refund", "address", "summary"] as const;
export type WorkerName = (typeof WORKER_NAMES)[number];

export const WORKER_TOOLS: Record<WorkerName, readonly ToolName[]> = {
  lookup: ["get_order", "search_orders"],
  refund: ["refund"],
  address: ["update_address"],
  summary: [],
};

export type PlannedSubtask = {
  id: string;
  worker: WorkerName;
  instruction: string;
  dependsOn: string[];
};

export function planRounds(
  subtasks: PlannedSubtask[],
  maxRounds = 3,
): { rounds: PlannedSubtask[][]; unfinished: PlannedSubtask[] } {
  const pending = [...subtasks];
  const done = new Set<string>();
  const rounds: PlannedSubtask[][] = [];
  for (let round = 0; round < maxRounds && pending.length > 0; round += 1) {
    const ready = pending.filter((task) => task.dependsOn.every((id) => done.has(id)));
    if (ready.length === 0) break;
    rounds.push(ready);
    for (const task of ready) done.add(task.id);
    const readyIds = new Set(ready.map((task) => task.id));
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (readyIds.has(pending[index].id)) pending.splice(index, 1);
    }
  }
  return { rounds, unfinished: pending };
}

export function createMutex(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail = Promise.resolve();
  return function lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
