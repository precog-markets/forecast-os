#!/usr/bin/env node
// Read-only setup check for the ForecastOS Cursor skill export.
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cursorSkillRoot = dirname(scriptDir);
const repoRoot = resolve(
  process.env.FORECASTOS_REPO_ROOT ?? join(cursorSkillRoot, "..", "..", "..", ".."),
);
const nodeBin = process.env.FORECASTOS_NODE_BIN ?? "node";

const checks = [
  await checkNode(nodeBin),
  await checkFile("forecastos_action", join(repoRoot, "skill", "forecast-os", "scripts", "forecastos_action.mjs")),
  await checkFile("skill_config", join(repoRoot, "skill", "forecast-os", ".forecastos", "config.json")),
  await checkDir("wallet_adapters", join(repoRoot, "adapters", "wallets")),
  await checkFile("cursor_skill", join(cursorSkillRoot, "SKILL.md")),
];

const ok = checks.every((check) => check.ok);
process.stdout.write(
  JSON.stringify(
    {
      ok,
      cursor_skill_root: cursorSkillRoot,
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
