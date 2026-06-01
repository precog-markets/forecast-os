#!/usr/bin/env node
// Forward Hermes Privy create signing to the canonical ForecastOS Privy adapter.
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const hermesSkillRoot = dirname(scriptDir);
const repoRoot = resolve(
  process.env.FORECASTOS_REPO_ROOT ?? join(hermesSkillRoot, "..", "..", "..", "..", "..", ".."),
);
const nodeBin = process.env.FORECASTOS_NODE_BIN ?? "node";
const adapterScript = join(repoRoot, "adapters", "wallets", "privy", "resolve_create.mjs");

const child = spawn(nodeBin, [adapterScript, ...process.argv.slice(2)], {
  cwd: repoRoot,
  env: {
    ...process.env,
    FORECASTOS_REPO_ROOT: repoRoot,
    FORECASTOS_SKILL_DIR: join(repoRoot, "skill", "forecast-os"),
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
