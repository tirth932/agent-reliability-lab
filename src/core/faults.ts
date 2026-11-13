/** True when flaky search should hide every order for this query. */
export function flakySearchMiss(query: string, customerNames: readonly string[]): boolean {
  const normalized = query.trim().toLowerCase();
  return !customerNames.some((name) => name.toLowerCase() === normalized);
}

export type RefundFaultState = {
  timedOut: boolean;
};

export function createRefundFaultState(): RefundFaultState {
  return { timedOut: false };
}

/**
 * The first successful refund write in a run should be reported as a timeout
 * after the row is already stored. Later calls in the same run are not timed out.
 */
export function consumeRefundTimeout(state: RefundFaultState): boolean {
  if (state.timedOut) return false;
  state.timedOut = true;
  return true;
}
