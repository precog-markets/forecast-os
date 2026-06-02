#!/usr/bin/env node
// Read-only setup check for the ForecastOS Hermes skill export.
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { actionBridgeSupportCheck } from "./forecastos-runtime.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const hermesSkillRoot = dirname(scriptDir);
const repoRoot = resolve(
  process.env.FORECASTOS_REPO_ROOT ?? join(hermesSkillRoot, "..", "..", "..", "..", "..", ".."),
);
const nodeBin = process.env.FORECASTOS_NODE_BIN ?? "node";

const checks = [
  await checkNode(nodeBin),
  await checkFile("forecastos_action", join(repoRoot, "skill", "forecast-os", "scripts", "forecastos_action.mjs")),
  await actionBridgeSupportCheck("prepare_create_intent"),
  await actionBridgeSupportCheck("publish_approved_market"),
  await checkFile("skill_config", join(repoRoot, "skill", "forecast-os", ".forecastos", "config.json")),
  await checkDir("wallet_adapters", join(repoRoot, "adapters", "wallets")),
  await checkFile("privy_create_adapter", join(repoRoot, "adapters", "wallets", "privy", "resolve_create.mjs")),
  await checkFile("hermes_action_wrapper", join(hermesSkillRoot, "scripts", "forecastos-action.mjs")),
  await checkFile("hermes_prepare_create_wrapper", join(hermesSkillRoot, "scripts", "prepare-create-intent.mjs")),
  await checkFile("hermes_privy_wrapper", join(hermesSkillRoot, "scripts", "resolve-privy-create.mjs")),
  await checkFile("hermes_skill", join(hermesSkillRoot, "SKILL.md")),
];

const ok = checks.every((check) => check.ok);
process.stdout.write(
  JSON.stringify(
    {
      ok,
      hermes_skill_root: hermesSkillRoot,
      forecastos_repo_root: repoRoot,
      checks,
    },
    null,
    2,
  ) + "\n",
);

if (!ok) process.exit(1);

async function checkNode(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  return {
    name: "node",
    ok: result.status === 0,
    command,
    version: result.stdout?.trim() || null,
    error: result.error?.message || result.stderr?.trim() || null,
  };
}

async function checkFile(name, path) {
  try {
    await access(path, constants.R_OK);
    return { name, ok: true, path };
  } catch (error) {
    return { name, ok: false, path, error: error?.message ?? String(error) };
  }
}

async function checkDir(name, path) {
  try {
    await access(path, constants.R_OK);
    return { name, ok: true, path };
  } catch (error) {
    return { name, ok: false, path, error: error?.message ?? String(error) };
  }
}
