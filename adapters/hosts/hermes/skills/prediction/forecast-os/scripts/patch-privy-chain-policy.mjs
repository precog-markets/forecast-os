#!/usr/bin/env node
// Forward Hermes Privy policy patching to the canonical ForecastOS Privy adapter.
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  buildRepoRootRequiredError,
  printRuntimeError,
  resolveForecastOSRepoRoot,
  resolveHermesSkillRoot,
} from "./forecastos-runtime.mjs";

const hermesSkillRoot = resolveHermesSkillRoot();
const nodeBin = process.env.FORECASTOS_NODE_BIN ?? "node";
const repoRoot = await resolveForecastOSRepoRoot(process.env, hermesSkillRoot);
const patchScript = join(repoRoot, "adapters", "wallets", "privy", "patch_forecastos_chain_policy.mjs");

try {
  await access(patchScript, constants.R_OK);
} catch {
  printRuntimeError(
    buildRepoRootRequiredError(
      {
        checkedPaths: [patchScript],
        guidance: "Set FORECASTOS_REPO_ROOT to the ForecastOS repo root, then rerun patch-privy-chain-policy.mjs.",
      },
      hermesSkillRoot,
    ),
  );
  process.exit(1);
}

const child = spawn(nodeBin, [patchScript, ...process.argv.slice(2)], {
  cwd: repoRoot,
  env: {
    ...process.env,
    FORECASTOS_REPO_ROOT: repoRoot,
    FORECASTOS_SKILL_DIR: process.env.FORECASTOS_SKILL_DIR ?? join(repoRoot, "skill", "forecast-os"),
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
