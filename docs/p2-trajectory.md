# P2 Trajectory and idempotency

`refundTimeoutOnce` inserts the refund row and then returns "Request timed out". A retry without a unique key inserts a second row.

The harness creates one `requestId` per user message. The refund key is `refund:{orderId}:{requestId}`. The unique index exists only when idempotent refunds are on. A repeated key returns the original row with `deduplicated: true`.

Matchers compare tool names in strict, unordered, subset, and superset modes. `expected_args` is checked when a task includes it. Outcome accuracy reads the database, not the model's prose, plus an optional substring check.

`pnpm eval:p2` writes `results/p2.json`. A double-refund trace is saved only if a run produces one. Screenshot: TODO(me).

The committed run (`openai/gpt-oss-120b`, 50 tasks) recorded 17 duplicate refunds with idempotency off and 0 with it on. Strict tool-path accuracy was 60.0% off and 66.0% on. Database outcome accuracy was 64.0% off and 98.0% on. The saved trace is `results/traces/p2-double-refund.json`.
