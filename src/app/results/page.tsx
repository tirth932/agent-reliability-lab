import { ResultsBoard } from "@/components/results-board";
import { listTraces, readP1, readP2, readP3 } from "@/lib/results";

export default function ResultsPage() {
  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">Results</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-700">
          Before-and-after numbers for the three projects. Every figure is read from a saved eval. If a project has not been measured yet, its tab stays empty.
        </p>
      </div>
      <ResultsBoard p1={readP1()} p2={readP2()} p3={readP3()} traces={listTraces()} />
    </div>
  );
}
