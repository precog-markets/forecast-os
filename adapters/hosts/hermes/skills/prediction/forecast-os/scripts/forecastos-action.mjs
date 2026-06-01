#!/usr/bin/env node
// Forward Hermes skill commands to the canonical ForecastOS action bridge.
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const hermesSkillRoot = dirname(scriptDir);
const repoRoot = resolve(
  process.env.FORECASTOS_REPO_ROOT ?? join(hermesSkillRoot, "..", "..", "..", "..", "..", ".."),
);
const nodeBin = process.env.FORECASTOS_NODE_BIN ?? "node";
const actionScript = join(repoRoot, "skill", "forecast-os", "scripts", "forecastos_action.mjs");
const canonicalSkillDir = join(repoRoot, "skill", "forecast-os");

const child = spawn(nodeBin, [actionScript, ...process.argv.slice(2)], {
  cwd: canonicalSkillDir,
  env: {
    ...process.env,
    FORECASTOS_SKILL_DIR: canonicalSkillDir,
    FORECASTOS_STATE_DIR: process.env.FORECASTOS_STATE_DIR ?? join(canonicalSkillDir, ".forecastos"),
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
