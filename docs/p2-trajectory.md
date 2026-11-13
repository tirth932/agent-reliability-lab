# P2 Trajectory and idempotency

`refundTimeoutOnce` inserts the refund row and then returns "Request timed out". A retry without a unique key inserts a second row.

The harness creates one `requestId` per user message. The refund key is `refund:{orderId}:{requestId}`. The unique index exists only when idempotent refunds are on. A repeated key returns the original row with `deduplicated: true`.

Matchers compare tool names in strict, unordered, subset, and superset modes. `expected_args` is checked when a task includes it. Outcome accuracy reads the database, not the model's prose, plus an optional substring check.

`pnpm eval:p2` writes `results/p2.json`. A double-refund trace is saved only if a run produces one. Screenshot: TODO(me).
