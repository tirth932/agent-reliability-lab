import { loadTaskFile } from "../src/evals/load";
import { validateTasks } from "../src/evals/validate";

const single = loadTaskFile("tasks.jsonl");
const multi = loadTaskFile("multi_tasks.jsonl");
const errors = [
  ...validateTasks(single, { requireType: false }),
  ...validateTasks(multi, { requireType: true }),
];
const counts = {
  easy: single.filter((task) => task.category === "easy").length,
  multi: single.filter((task) => task.category === "multi").length,
  tricky: single.filter((task) => task.category === "tricky").length,
  policy: single.filter((task) => task.category === "policy").length,
};
if (single.length !== 50) errors.push(`tasks.jsonl has ${single.length} rows, expected 50`);
if (counts.easy !== 20 || counts.multi !== 15 || counts.tricky !== 10 || counts.policy !== 5) {
  errors.push(`unexpected category mix ${JSON.stringify(counts)}`);
}
const independent = multi.filter((task) => task.type === "independent").length;
const dependent = multi.filter((task) => task.type === "dependent").length;
if (multi.length !== 30 || independent !== 15 || dependent !== 15) {
  errors.push(`multi_tasks.jsonl has ${multi.length} rows (${independent} independent, ${dependent} dependent)`);
}
if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log("tasks.jsonl (50) and multi_tasks.jsonl (30) are valid.");
