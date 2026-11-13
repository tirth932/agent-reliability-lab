import { readFileSync } from "node:fs";
import path from "node:path";
import { taskSchema, type Task } from "./schema";

export function parseJsonl(text: string, file: string): unknown[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        throw new Error(`${file} line ${index + 1} is not valid JSON`);
      }
    });
}

export function loadTaskFile(fileName: "tasks.jsonl" | "multi_tasks.jsonl"): Task[] {
  const file = path.join(process.cwd(), "evals", fileName);
  const raw = parseJsonl(readFileSync(file, "utf8"), fileName);
  return raw.map((item, index) => {
    const parsed = taskSchema.safeParse(item);
    if (!parsed.success) {
      throw new Error(`${fileName} line ${index + 1}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
    }
    return parsed.data;
  });
}
