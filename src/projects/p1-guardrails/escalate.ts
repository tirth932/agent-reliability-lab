import type { Db } from "@/core/db";
import type { AgentStatus } from "@/core/types";

export function fallbackReply(status: AgentStatus, escalated: boolean): string {
  if (escalated) {
    return "A human teammate will follow up on this request. I have stopped here so the account is not changed further.";
  }
  switch (status) {
    case "step_limit":
      return "I have to stop here because this request used too many steps. Please send a shorter, more specific question.";
    case "budget_exceeded":
      return "I have to stop here because this request reached its cost budget. Please try a smaller request.";
    case "loop_detected":
      return "I have to stop here because I was repeating the same lookup. Please clarify the order id or the exact customer name.";
    case "safety_cap":
      return "I have to stop here because this request hit the safety step cap.";
    case "error":
      return "I hit an error and stopped before finishing this request.";
    default:
      return "I have nothing further to add.";
  }
}

export async function escalate(
  db: Db,
  input: { reason: string; conversation: string; trace: unknown },
): Promise<number> {
  const ticket = await db.insertTicket({
    reason: input.reason,
    conversation: input.conversation,
    trace: JSON.stringify(input.trace),
  });
  return ticket.id;
}
