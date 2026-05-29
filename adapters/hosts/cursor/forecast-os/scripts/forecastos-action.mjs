#!/usr/bin/env node
// Forward Cursor skill commands to the canonical ForecastOS action bridge.
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cursorSkillRoot = dirname(scriptDir);
const repoRoot = resolve(
  process.env.FORECASTOS_REPO_ROOT ?? join(cursorSkillRoot, "..", "..", "..", ".."),
);
const nodeBin = process.env.FORECASTOS_NODE_BIN ?? "node";
const actionScript = join(repoRoot, "skill", "forecast-os", "scripts", "forecastos_action.mjs");
const child = spawn(nodeBin, [actionScript, ...process.argv.slice(2)], {
  cwd: join(repoRoot, "skill", "forecast-os"),
  env: {
    ...process.env,
    FORECASTOS_SKILL_DIR: join(repoRoot, "skill", "forecast-os"),
    FORECASTOS_STATE_DIR:
      process.env.FORECASTOS_STATE_DIR ?? join(repoRoot, "skill", "forecast-os", ".forecastos"),
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
