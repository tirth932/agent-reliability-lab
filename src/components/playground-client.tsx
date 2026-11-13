"use client";

import { useMemo, useState } from "react";
import type { DbSnapshot } from "@/core/types";
import type { RunMetrics, TraceEvent } from "@/core/trace";
import { TraceTimeline } from "@/components/trace-timeline";
import { formatMs, formatUsd } from "@/lib/utils";

type Preset = { id: string; input: string };

type Flags = {
  stepLimit: boolean;
  costBudget: boolean;
  loopDetection: boolean;
  humanEscalation: boolean;
  idempotentRefunds: boolean;
  injectFaults: boolean;
};

const defaultFlags: Flags = {
  stepLimit: true,
  costBudget: false,
  loopDetection: true,
  humanEscalation: true,
  idempotentRefunds: true,
  injectFaults: false,
};

export function PlaygroundClient({ presets, passcodeRequired }: { presets: Preset[]; passcodeRequired: boolean }) {
  const [taskId, setTaskId] = useState(presets[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [flags, setFlags] = useState<Flags>(defaultFlags);
  const [passcode, setPasscode] = useState("");
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);
  const [db, setDb] = useState<DbSnapshot | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  const selected = useMemo(() => presets.find((preset) => preset.id === taskId), [presets, taskId]);

  async function run() {
    setRunning(true);
    setError("");
    setEvents([]);
    setMetrics(null);
    setDb(null);
    setReply("");
    const text = message.trim() || selected?.input || "";
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(passcode ? { "x-demo-passcode": passcode } : {}),
        },
        body: JSON.stringify({
          taskId: message.trim() ? undefined : taskId || undefined,
          message: text,
          mode,
          flags,
        }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        setError(typeof body.error === "string" ? body.error : "The run was rejected.");
        return;
      }
      await readSse(response.body, (event) => {
        setEvents((current) => [...current, event]);
        if (event.type === "final") {
          setMetrics(event.metrics);
          setDb(event.db);
          setReply(event.reply);
        }
        if (event.type === "error") setError(event.message);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The run failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Preset</span>
            <select
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
            >
              <option value="">Custom message</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.id}: {preset.input.slice(0, 60)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Mode</span>
            <select
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2"
              value={mode}
              onChange={(event) => setMode(event.target.value === "multi" ? "multi" : "single")}
            >
              <option value="single">Single agent</option>
              <option value="multi">Multi-agent</option>
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Message (max 300 characters)</span>
          <textarea
            className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2"
            maxLength={300}
            value={message}
            placeholder={selected?.input ?? "Ask the support agent about an order"}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">Toggles</legend>
          {(
            [
              ["stepLimit", "Step limit"],
              ["costBudget", "Cost budget"],
              ["loopDetection", "Loop detection"],
              ["humanEscalation", "Human escalation"],
              ["idempotentRefunds", "Idempotent refunds"],
              ["injectFaults", "Inject faults"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={flags[key]}
                onChange={(event) => setFlags({ ...flags, [key]: event.target.checked })}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-zinc-500">The public playground still caps every run at 12 steps and $0.05, even if a toggle is off.</p>
        {passcodeRequired ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Demo passcode</span>
            <input
              type="password"
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
            />
          </label>
        ) : null}
        <button
          type="button"
          className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={running || (!message.trim() && !selected)}
          onClick={() => void run()}
        >
          {running ? "Running" : "Run task"}
        </button>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {reply ? (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <h2 className="mb-1 font-medium">Reply</h2>
            <p>{reply}</p>
          </div>
        ) : null}
        <TraceTimeline events={events} />
      </section>
      <aside className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="font-semibold">Run</h2>
        <dl className="grid grid-cols-2 gap-2">
          <dt>Steps</dt>
          <dd>{metrics?.steps ?? "—"}</dd>
          <dt>Tokens</dt>
          <dd>{metrics?.tokens ?? "—"}</dd>
          <dt>Cost</dt>
          <dd>{metrics ? formatUsd(metrics.costUsd) : "—"}</dd>
          <dt>Latency</dt>
          <dd>{metrics ? formatMs(metrics.latencyMs) : "—"}</dd>
        </dl>
        <h2 className="font-semibold">Database</h2>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs">
            {db ? JSON.stringify({ orders: db.orders, refunds: db.refunds, tickets: db.tickets }, null, 2) : "Run a task to see orders, refunds, and tickets."}
          </pre>
      </aside>
    </div>
  );
}

async function readSse(body: ReadableStream<Uint8Array>, onEvent: (event: TraceEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      const parsed = JSON.parse(dataLine.slice(5).trim()) as TraceEvent;
      onEvent(parsed);
    }
  }
}
