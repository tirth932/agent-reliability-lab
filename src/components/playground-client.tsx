"use client";

import { useMemo, useState } from "react";
import type { DbSnapshot } from "@/core/types";
import type { RunMetrics, TraceEvent } from "@/core/trace";
import { DbPanel } from "@/components/db-panel";
import { TraceTimeline } from "@/components/trace-timeline";

type ProviderOption = { id: "groq" | "openai" | "anthropic" | "google" | "grok"; label: string; defaultModel: string };

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

type Preset = { id: string; input: string; note?: string };

export function PlaygroundClient({
  presets,
  providers,
  pricedModels,
  passcodeRequired,
}: {
  presets: Preset[];
  providers: ProviderOption[];
  pricedModels: string[];
  passcodeRequired: boolean;
}) {
  const groq = providers.find((provider) => provider.id === "groq") ?? providers[0];
  const [taskId, setTaskId] = useState(presets[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [providerId, setProviderId] = useState<ProviderOption["id"]>(groq?.id ?? "groq");
  const [modelId, setModelId] = useState(groq?.defaultModel ?? "");
  const [apiKey, setApiKey] = useState("");
  const [inputPrice, setInputPrice] = useState("");
  const [outputPrice, setOutputPrice] = useState("");
  const [flags, setFlags] = useState<Flags>(defaultFlags);
  const [passcode, setPasscode] = useState("");
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);
  const [db, setDb] = useState<DbSnapshot | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  const selected = useMemo(() => presets.find((preset) => preset.id === taskId), [presets, taskId]);

  const provider = providers.find((item) => item.id === providerId);
  const needsPrices = !pricedModels.includes(modelId.trim());

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
          ...(apiKey.trim() ? { "x-llm-api-key": apiKey.trim() } : {}),
        },
        body: JSON.stringify({
          taskId: message.trim() ? undefined : taskId || undefined,
          message: text,
          mode,
          provider: providerId,
          model: modelId.trim(),
          ...(needsPrices && inputPrice.trim() && outputPrice.trim()
            ? { inputPerMillion: Number(inputPrice), outputPerMillion: Number(outputPrice) }
            : {}),
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

  const prompt = message.trim() || selected?.input || "";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="space-y-4">
        <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Preset task</legend>
            <div className="space-y-2">
              {presets.map((preset) => (
                <label key={preset.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="preset"
                    className="mt-1"
                    checked={taskId === preset.id && !message.trim()}
                    onChange={() => {
                      setTaskId(preset.id);
                      setMessage("");
                    }}
                  />
                  <span>
                    <span className="font-medium">{preset.id}</span>
                    <span className="mt-0.5 block whitespace-normal text-zinc-800">{preset.input}</span>
                    {preset.note ? <span className="mt-1 block text-xs leading-5 text-zinc-500">{preset.note}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
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
          <label className="block text-sm">
            <span className="mb-1 flex items-center justify-between font-medium">
              Your own message
              <span className="font-normal text-zinc-500">{message.length}/300</span>
            </span>
            <textarea
              className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2"
              maxLength={300}
              value={message}
              placeholder="Leave this blank to run the preset, or type a different request."
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">What to turn on</legend>
            <div className="grid gap-2 sm:grid-cols-2">
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
            </div>
          </fieldset>
          <p className="text-xs leading-5 text-zinc-500">
            Faults make a near-match search come back empty, and make the first refund report a timeout after it is saved. The public site still stops a run at 12 steps or $0.05.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Provider</span>
              <select
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2"
                value={providerId}
                onChange={(event) => {
                  const next = providers.find((item) => item.id === event.target.value);
                  if (!next) return;
                  setProviderId(next.id);
                  setModelId(next.defaultModel);
                  setApiKey("");
                  setInputPrice("");
                  setOutputPrice("");
                }}
              >
                {providers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                    {item.id === "groq" ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Model id</span>
              <input
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
                list="priced-models"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
              />
              <datalist id="priced-models">
                {providerId === "groq"
                  ? pricedModels.map((id) => <option key={id} value={id} />)
                  : null}
              </datalist>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Your {provider?.label ?? "provider"} API key</span>
              <input
                type="password"
                autoComplete="off"
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
                value={apiKey}
                placeholder={providerId === "groq" ? "Blank uses this project's Groq key" : "Required unless this server has that provider's key"}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
          </div>
          {needsPrices ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Input $ / million</span>
                <input
                  inputMode="decimal"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  value={inputPrice}
                  onChange={(event) => setInputPrice(event.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Output $ / million</span>
                <input
                  inputMode="decimal"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  value={outputPrice}
                  onChange={(event) => setOutputPrice(event.target.value)}
                />
              </label>
            </div>
          ) : null}
          <p className="text-xs leading-5 text-zinc-500">
            The default is this project's Groq key and {groq?.defaultModel}. A key you type is used for that run only and is not saved. OpenAI, Anthropic, Google, and Grok need your own key and the published token price.
          </p>
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
            disabled={running || !prompt || !modelId.trim() || (needsPrices && (!inputPrice.trim() || !outputPrice.trim()))}
            onClick={() => void run()}
          >
            {running ? "Running…" : "Run task"}
          </button>
        </div>
        {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        {reply ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Reply to the customer</h2>
            <p className="mt-2 leading-6 text-zinc-950">{reply}</p>
          </div>
        ) : null}
        <div>
          <h2 className="mb-2 text-sm font-semibold">Live trace</h2>
          <TraceTimeline events={events} />
        </div>
      </section>
      <DbPanel metrics={metrics} db={db} />
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
