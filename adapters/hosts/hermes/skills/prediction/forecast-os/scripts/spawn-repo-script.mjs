#!/usr/bin/env node
// Spawn a ForecastOS repo-root script from a Hermes skill shim.
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  buildPrecogRepoRequiredError,
  buildRepoRootRequiredError,
  resolveRepoScript,
} from "./repo-discovery.mjs";
import { printRuntimeError, resolveHermesSkillRoot } from "./forecastos-runtime.mjs";

export function buildRepoSpawnEnv({
  env = process.env,
  hermesSkillRoot,
  repoRoot,
} = {}) {
  const skillRoot = hermesSkillRoot ?? resolveHermesSkillRoot();
  return {
    ...env,
    FORECASTOS_REPO_ROOT: repoRoot,
    FORECASTOS_SKILL_DIR: env.FORECASTOS_SKILL_DIR ?? join(repoRoot, "skill", "forecast-os"),
    FORECASTOS_STATE_DIR: env.FORECASTOS_STATE_DIR ?? join(skillRoot, ".forecastos"),
  };
}

export async function spawnRepoScript({
  relPath,
  label,
  env = process.env,
  argv = process.argv,
  usePrivyError = false,
} = {}) {
  const hermesSkillRoot = resolveHermesSkillRoot();
  const nodeBin = env.FORECASTOS_NODE_BIN ?? "node";
  const resolution = await resolveRepoScript(relPath, env, hermesSkillRoot);

  if (!resolution.ok || !resolution.scriptPath || !resolution.repoRoot) {
    const error = usePrivyError
      ? buildRepoRootRequiredError(resolution, hermesSkillRoot, label)
      : buildPrecogRepoRequiredError(resolution, hermesSkillRoot, relPath);
    printRuntimeError(error);
    process.exit(1);
  }

  const child = spawn(nodeBin, [resolution.scriptPath, ...argv.slice(2)], {
    cwd: resolution.repoRoot,
    env: buildRepoSpawnEnv({
      env,
      hermesSkillRoot,
      repoRoot: resolution.repoRoot,
    }),
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}
