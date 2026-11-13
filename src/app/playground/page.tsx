import { PlaygroundClient } from "@/components/playground-client";
import { loadTaskFile } from "@/evals/load";
import { DEFAULT_MODEL, PRICING } from "../../../config/pricing";

const PRESET_IDS = ["t001", "t004", "t021", "t037", "t041", "t048"];

const PRESET_NOTES: Record<string, string> = {
  t037: "The customer is Priya Nair. This task types Priya Nayar on purpose, one letter off, so a faulty search comes back empty.",
};

export default function PlaygroundPage() {
  const tasks = loadTaskFile("tasks.jsonl");
  const presets = PRESET_IDS.flatMap((id) => {
    const task = tasks.find((item) => item.id === id);
    return task ? [{ id: task.id, input: task.input, note: PRESET_NOTES[task.id] }] : [];
  });
  const models = Object.entries(PRICING).flatMap(([id, price]) => (price ? [{ id }] : []));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Playground</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-700">
          Pick a preset or write a short request. Each run starts from the same 20 orders. The trace shows the model turns and tool calls as they happen, and the panel on the side shows the refunds, tickets, and orders left behind.
        </p>
      </div>
      <PlaygroundClient
        presets={presets}
        models={models}
        defaultModel={DEFAULT_MODEL}
        passcodeRequired={Boolean(process.env.DEMO_PASSCODE)}
      />
    </div>
  );
}
