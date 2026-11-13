import type { TraceEvent } from "@/core/trace";

export function TraceTimeline({ events }: { events: TraceEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-zinc-500">No trace events yet.</p>;
  }
  return (
    <ol className="space-y-2">
      {events.map((event, index) => (
        <li key={`${event.type}-${index}`} className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-xs text-white">{event.type}</span>
            {"source" in event && event.source ? <span className="text-xs text-zinc-500">{event.source}</span> : null}
          </div>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-zinc-800">{summarize(event)}</pre>
        </li>
      ))}
    </ol>
  );
}

function summarize(event: TraceEvent): string {
  if (event.type === "tool_call") return `${event.name} ${JSON.stringify(event.args)}`;
  if (event.type === "tool_result") return `${event.name} ${JSON.stringify(event.result)}`;
  if (event.type === "guard") return `${event.guard}: ${event.detail}`;
  if (event.type === "ticket") return `#${event.ticketId} ${event.reason}`;
  if (event.type === "final") return `${event.status}\n${event.reply}`;
  if (event.type === "error") return event.message;
  if (event.type === "llm") return `in ${event.inputTokens} / out ${event.outputTokens} (${event.finishReason})`;
  if (event.type === "step") return `step ${event.step}`;
  return "";
}
