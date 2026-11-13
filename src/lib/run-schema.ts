import { z } from "zod";
import { loadBudget } from "@/projects/p1-guardrails/budget";
import { PLAYGROUND_MAX_STEPS } from "@/projects/p1-guardrails/stepLimit";
import type { AgentFlags } from "@/core/types";

export const PLAYGROUND_MAX_COST_USD = 0.05;

export const runRequestSchema = z.object({
  taskId: z.string().optional(),
  message: z.string().max(300).optional(),
  provider: z.enum(["groq", "openai", "anthropic", "google", "grok"]).optional(),
  model: z.string().trim().max(80).optional(),
  inputPerMillion: z.number().finite().positive().max(1000).optional(),
  outputPerMillion: z.number().finite().positive().max(1000).optional(),
  mode: z.enum(["single", "multi"]),
  flags: z.object({
    stepLimit: z.boolean(),
    costBudget: z.boolean(),
    loopDetection: z.boolean(),
    humanEscalation: z.boolean(),
    idempotentRefunds: z.boolean(),
    injectFaults: z.boolean(),
  }),
});

export type RunRequest = z.infer<typeof runRequestSchema>;

export function flagsFromRequest(input: RunRequest): AgentFlags {
  const budget = input.flags.costBudget ? loadBudget().costBudgetUsd : PLAYGROUND_MAX_COST_USD;
  return {
    stepLimit: Math.min(input.flags.stepLimit ? 10 : PLAYGROUND_MAX_STEPS, PLAYGROUND_MAX_STEPS),
    costBudgetUsd: Math.min(budget, PLAYGROUND_MAX_COST_USD),
    loopDetection: input.flags.loopDetection,
    loopRepeatLimit: 3,
    humanEscalation: input.flags.humanEscalation,
    idempotentRefunds: input.flags.idempotentRefunds,
    flakySearch: input.flags.injectFaults,
    refundTimeoutOnce: input.flags.injectFaults,
  };
}
