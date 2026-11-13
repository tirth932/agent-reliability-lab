export const DEFAULT_STEP_LIMIT = 10;
export const SAFETY_CAP_STEPS = 30;
export const PLAYGROUND_MAX_STEPS = 12;

export function hitStepLimit(completedSteps: number, limit: number | null): boolean {
  return limit != null && completedSteps >= limit;
}

export function hitSafetyCap(completedSteps: number): boolean {
  return completedSteps >= SAFETY_CAP_STEPS;
}
