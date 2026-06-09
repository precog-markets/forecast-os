#!/usr/bin/env node
// Forward Hermes Privy create signing to the canonical ForecastOS Privy adapter.
import { spawn } from "node:child_process";
import {
  buildRepoRootRequiredError,
  printRuntimeError,
  resolveHermesSkillRoot,
  resolvePrivyAdapterScript,
} from "./forecastos-runtime.mjs";

const hermesSkillRoot = resolveHermesSkillRoot();
const nodeBin = process.env.FORECASTOS_NODE_BIN ?? "node";
const resolution = await resolvePrivyAdapterScript(process.env, hermesSkillRoot);

if (!resolution.ok || !resolution.adapterScript || !resolution.repoRoot) {
  printRuntimeError(buildRepoRootRequiredError(resolution, hermesSkillRoot));
  process.exit(1);
}

const child = spawn(nodeBin, [resolution.adapterScript, ...process.argv.slice(2)], {
  cwd: resolution.repoRoot,
  env: {
    ...process.env,
    FORECASTOS_REPO_ROOT: resolution.repoRoot,
    FORECASTOS_SKILL_DIR: process.env.FORECASTOS_SKILL_DIR ?? `${resolution.repoRoot}/skill/forecast-os`,
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
