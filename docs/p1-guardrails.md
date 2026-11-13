# P1 Guardrails

The agent counts one step per model call. Even with the toggles off, it stops at 30 steps and reports `safety_cap`, which counts as stuck.

With the guards on:

- Step limit defaults to 10 model calls.
- Cost budget is three times the average task cost from `pnpm eval:baseline`.
- The loop detector stops on the third identical tool name and canonical arguments.
- A guard stop writes a ticket and tells the customer a human will follow up.

`pnpm eval:p1` runs the 50 tasks twice with flaky search enabled. It writes `results/p1.json`. If a guards-off run actually loops, it also writes up to three files in `results/traces/`.

The committed run (`openai/gpt-oss-120b`) finished all 50 tasks in both conditions. Stuck rate was 0% either way, average steps were 2.8, and average cost was $0.000305 with guards off and $0.000307 with guards on. No loop trace was written. Screenshot: TODO(me).
