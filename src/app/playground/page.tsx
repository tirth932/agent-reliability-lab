import { PlaygroundClient } from "@/components/playground-client";
import { loadTaskFile } from "@/evals/load";

const PRESET_IDS = ["t001", "t004", "t021", "t037", "t041", "t048"];

export default function PlaygroundPage() {
  const tasks = loadTaskFile("tasks.jsonl");
  const presets = PRESET_IDS.flatMap((id) => {
    const task = tasks.find((item) => item.id === id);
    return task ? [{ id: task.id, input: task.input }] : [];
  });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-700">
          Each run gets a new database seeded with orders 4510–4529. The trace streams as the agent calls tools. The model is chosen on the server.
        </p>
      </div>
      <PlaygroundClient presets={presets} passcodeRequired={Boolean(process.env.DEMO_PASSCODE)} />
    </div>
  );
}
