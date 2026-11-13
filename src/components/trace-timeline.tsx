import type { TraceEvent } from "@/core/trace";
import { cn } from "@/lib/utils";

const labels: Record<TraceEvent["type"], string> = {
  step: "Step",
  llm: "Model turn",
  tool_call: "Tool call",
  tool_result: "Tool result",
  guard: "Guard",
  ticket: "Escalation ticket",
  final: "Final reply",
  error: "Error",
};

export function TraceTimeline({ events }: { events: TraceEvent[] }) {
  const visible = events.filter((event) => event.type !== "step");
  if (visible.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-6 text-sm text-zinc-500">
        The live trace appears here: each model turn, tool call, tool result, guard, and the final reply.
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {visible.map((event, index) => (
        <li key={`${event.type}-${index}`} className={cn("rounded-lg border bg-white px-3 py-2 text-sm", tone(event))}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide">{labels[event.type]}</span>
            {"step" in event ? <span className="text-xs text-zinc-500">Step {event.step}</span> : null}
            {"source" in event && event.source ? <span className="text-xs text-zinc-500">{event.source}</span> : null}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-zinc-900">{summarize(event)}</p>
        </li>
      ))}
    </ol>
  );
}

function tone(event: TraceEvent): string {
  if (event.type === "error" || (event.type === "tool_result" && !event.result.ok)) return "border-red-200";
  if (event.type === "guard" || event.type === "ticket") return "border-amber-200";
  if (event.type === "tool_result") return "border-emerald-200";
  if (event.type === "final") return "border-zinc-300";
  return "border-zinc-200";
}

function summarize(event: TraceEvent): string {
  if (event.type === "tool_call") return `${event.name}(${formatArgs(event.args)})`;
  if (event.type === "tool_result") {
    if (!event.result.ok) return `${event.name} failed: ${event.result.error}`;
    const extra = event.result.deduplicated ? " (same refund returned, not charged again)" : "";
    return `${event.name} succeeded${extra}\n${compact(event.result.data)}`;
  }
  if (event.type === "guard") return `${guardLabel(event.guard)}. ${event.detail}`;
  if (event.type === "ticket") return `Ticket #${event.ticketId}: ${event.reason}`;
  if (event.type === "final") return event.reply;
  if (event.type === "error") return event.message;
  if (event.type === "llm") {
    const reason = event.finishReason === "tool_calls" ? "asked for a tool" : "wrote the reply";
    return `${event.inputTokens} input tokens, ${event.outputTokens} output tokens. The model ${reason}.`;
  }
  return `Step ${event.step}`;
}

function guardLabel(guard: "step_limit" | "budget" | "loop" | "safety_cap"): string {
  if (guard === "step_limit") return "Step limit reached";
  if (guard === "budget") return "Cost budget reached";
  if (guard === "loop") return "Repeated tool call stopped";
  return "Safety cap reached";
}

function formatArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  return Object.entries(args as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(", ");
}

function compact(data: unknown): string {
  if (data == null) return "";
  if (Array.isArray(data)) return data.length === 0 ? "No matching rows." : data.map((row) => compact(row)).join("\n");
  if (typeof data !== "object") return String(data);
  return Object.entries(data as Record<string, unknown>)
    .filter(([key]) => key !== "idempotency_key")
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" · ");
}
