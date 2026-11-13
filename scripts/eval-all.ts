import { spawnSync } from "node:child_process";

const scripts = ["eval-baseline.ts", "eval-p1.ts", "eval-p2.ts", "eval-p3.ts"];
for (const script of scripts) {
  const result = spawnSync("pnpm", ["exec", "tsx", `scripts/${script}`, ...process.argv.slice(2)], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
