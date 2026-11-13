export const ORDER_STATUSES = [
  "processing",
  "shipped",
  "delivered",
  "damaged",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Order = {
  id: number;
  customer: string;
  amount: number;
  status: OrderStatus;
  address: string;
};

export type RefundRow = {
  id: number;
  order_id: number;
  amount: number;
  idempotency_key: string | null;
  created_at: string;
};

export type TicketRow = {
  id: number;
  reason: string;
  conversation: string;
  trace: string;
  created_at: string;
};

export type DbSnapshot = {
  orders: Order[];
  refunds: RefundRow[];
  tickets: TicketRow[];
};

export type AgentStatus =
  | "completed"
  | "step_limit"
  | "budget_exceeded"
  | "loop_detected"
  | "error"
  | "safety_cap";

export const STUCK_STATUSES: readonly AgentStatus[] = [
  "step_limit",
  "budget_exceeded",
  "loop_detected",
  "safety_cap",
];

export type AgentFlags = {
  /** Null disables the soft step limit. The safety cap still applies. */
  stepLimit: number | null;
  /** Null disables the cost budget. */
  costBudgetUsd: number | null;
  loopDetection: boolean;
  /** The occurrence that counts as a loop. 3 means the 3rd identical call. */
  loopRepeatLimit: number;
  humanEscalation: boolean;
  idempotentRefunds: boolean;
  flakySearch: boolean;
  refundTimeoutOnce: boolean;
};

export type ToolCallRecord = {
  name: string;
  args: Record<string, unknown>;
};

export type ToolSuccess = {
  ok: true;
  data: unknown;
  deduplicated?: boolean;
};

export type ToolFailure = {
  ok: false;
  error: string;
};

export type ToolResult = ToolSuccess | ToolFailure;

export const DEFAULT_FLAGS: AgentFlags = {
  stepLimit: null,
  costBudgetUsd: null,
  loopDetection: false,
  loopRepeatLimit: 3,
  humanEscalation: false,
  idempotentRefunds: false,
  flakySearch: false,
  refundTimeoutOnce: false,
};
