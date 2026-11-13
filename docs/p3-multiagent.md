# P3 Single versus multi-agent

`evals/multi_tasks.jsonl` has 15 independent and 15 dependent tasks.

The single agent gets all four tools and the P1 guards. The lead asks the model for a JSON plan, then runs lookup, refund, address, and summary workers. Independent subtasks share a round via `Promise.all`. Dependent subtasks wait for `dependsOn`, up to three rounds. Database writes are serialized. Tokens, cost, tool calls, and wall-clock time include the lead and the workers.

`pnpm eval:p3` writes `results/p3.json`, including a decision rule computed from the independent-task success delta. Until that file exists, the about page shows TODO(me).
