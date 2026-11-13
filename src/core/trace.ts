import type { AgentStatus, DbSnapshot, ToolCallRecord, ToolResult } from "./types";

export type TraceEvent =
  | { type: "step"; step: number; source: string; at: string }
  | {
      type: "llm";
      step: number;
      source: string;
      inputTokens: number;
      outputTokens: number;
      finishReason: string;
      at: string;
    }
  | { type: "tool_call"; step: number; source: string; name: string; args: unknown; at: string }
  | { type: "tool_result"; step: number; source: string; name: string; result: ToolResult; at: string }
  | {
      type: "guard";
      step: number;
      source: string;
      guard: "step_limit" | "budget" | "loop" | "safety_cap";
      detail: string;
      at: string;
    }
  | { type: "ticket"; source: string; ticketId: number; reason: string; at: string }
  | {
      type: "final";
      source: string;
      status: AgentStatus;
      reply: string;
      metrics: RunMetrics;
      db: DbSnapshot;
      at: string;
    }
  | { type: "error"; source: string; message: string; at: string };

export type RunMetrics = {
  steps: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  costUsd: number;
  latencyMs: number;
  toolCalls: ToolCallRecord[];
  escalated: boolean;
};

export function nowIso(): string {
  return new Date().toISOString();
}

export type TraceRecorder = {
  events: TraceEvent[];
  emit: (event: TraceEvent) => void;
};

export function createTrace(onEvent?: (event: TraceEvent) => void): TraceRecorder {
  const events: TraceEvent[] = [];
  return {
    events,
    emit(event) {
      events.push(event);
      onEvent?.(event);
    },
  };
}
