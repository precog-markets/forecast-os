#!/usr/bin/env node
// Read-only setup check for the ForecastOS Hermes skill export.
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  actionBridgeSupportCheck,
  resolveForecastOSRepoRoot,
  resolveHermesSkillRoot,
  resolvePrivyAdapterScript,
} from "./forecastos-runtime.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const hermesSkillRoot = resolveHermesSkillRoot(import.meta.url);
const repoRoot = await resolveForecastOSRepoRoot(process.env, hermesSkillRoot);
const nodeBin = process.env.FORECASTOS_NODE_BIN ?? "node";

const checks = [
  await checkNode(nodeBin),
  await checkFile("forecastos_action", join(repoRoot, "skill", "forecast-os", "scripts", "forecastos_action.mjs")),
  await actionBridgeSupportCheck("prepare_create_intent"),
  await actionBridgeSupportCheck("publish_approved_market"),
  await checkFile("skill_config", join(repoRoot, "skill", "forecast-os", ".forecastos", "config.json")),
  await checkDir("wallet_adapters", join(repoRoot, "adapters", "wallets")),
  await checkPrivyAdapterResolution(process.env, hermesSkillRoot),
  await checkFile("hermes_action_wrapper", join(hermesSkillRoot, "scripts", "forecastos-action.mjs")),
  await checkFile("hermes_prepare_create_wrapper", join(hermesSkillRoot, "scripts", "prepare-create-intent.mjs")),
  await checkFile("hermes_privy_wrapper", join(hermesSkillRoot, "scripts", "resolve-privy-create.mjs")),
  await checkFile("hermes_skill", join(hermesSkillRoot, "SKILL.md")),
  await checkPrivyTypedDataPolicyCoverage(process.env, repoRoot),
];

const ok = checks.every((check) => check.ok || check.optional);
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

async function checkPrivyAdapterResolution(env, skillRoot) {
  const resolution = await resolvePrivyAdapterScript(env, skillRoot);
  if (resolution.ok) {
    return {
      name: "privy_create_adapter",
      ok: true,
      path: resolution.adapterScript,
      repo_root: resolution.repoRoot,
    };
  }
  return {
    name: "privy_create_adapter",
    ok: false,
    optional: true,
    checked_paths: resolution.checkedPaths,
    guidance:
      resolution.guidance ??
      "Set FORECASTOS_REPO_ROOT to the ForecastOS repo root, then rerun check-hermes-setup.mjs.",
  };
}

async function checkPrivyTypedDataPolicyCoverage(env = {}, repoRootPath = repoRoot) {
  const appId = env.PRIVY_APP_ID;
  const appSecret = env.PRIVY_APP_SECRET;
  const walletId = env.PRIVY_WALLET_ID;
  if (!appId || !appSecret || !walletId) {
    return {
      name: "privy_typed_data_policy",
      ok: true,
      optional: true,
      skipped: true,
      reason: "Set PRIVY_APP_ID, PRIVY_APP_SECRET, and PRIVY_WALLET_ID to probe typed-data policy coverage.",
    };
  }
  if (typeof fetch !== "function") {
    return {
      name: "privy_typed_data_policy",
      ok: true,
      optional: true,
      skipped: true,
      reason: "Fetch API unavailable; skipped Privy policy probe.",
    };
  }

  try {
    const auth = buildPrivyAuth(appId, appSecret);
    const wallet = await readPrivyWallet(fetch, auth, walletId);
    const policies = [];
    for (const policyId of wallet.policy_ids ?? []) {
      policies.push(await readPrivyPolicy(fetch, auth, policyId));
    }
    const { extractAllowedTypedDataChainIds } = await import(
      pathToFileURL(join(repoRootPath, "adapters", "wallets", "privy", "resolve_create.mjs")).href
    );
    const { chainIds, hasUnrestrictedRule } = extractAllowedTypedDataChainIds(policies);
    const supports8453 = hasUnrestrictedRule || chainIds.includes("8453");
    const supports42161 = hasUnrestrictedRule || chainIds.includes("42161");
    const warnings = [];
    if (!supports8453) warnings.push("Missing eth_signTypedData_v4 ALLOW for Base chainId 8453.");
    if (!supports42161) warnings.push("Missing eth_signTypedData_v4 ALLOW for Arbitrum chainId 42161.");
    return {
      name: "privy_typed_data_policy",
      ok: true,
      optional: true,
      wallet_id: walletId,
      policy_ids: wallet.policy_ids ?? [],
      allowed_chain_ids: chainIds,
      has_unrestricted_rule: hasUnrestrictedRule,
      supports_base: supports8453,
      supports_arbitrum: supports42161,
      warnings,
    };
  } catch (error) {
    return {
      name: "privy_typed_data_policy",
      ok: true,
      optional: true,
      warning: error?.message ?? String(error),
    };
  }
}

function buildPrivyAuth(appId, appSecret) {
  const basic = Buffer.from(`${appId}:${appSecret}`, "utf8").toString("base64");
  return {
    headers: {
      Authorization: `Basic ${basic}`,
      "privy-app-id": appId,
      "Content-Type": "application/json",
    },
  };
}

async function readPrivyWallet(fetch, auth, walletId) {
  const endpoint = `https://api.privy.io/v1/wallets/${walletId}`;
  const response = await fetch(endpoint, { method: "GET", headers: auth.headers });
  const body = await readJsonResponse(response);
  if (!response.ok) throw new Error(`Privy wallet read failed (${response.status}).`);
  return body;
}

async function readPrivyPolicy(fetch, auth, policyId) {
  const endpoint = `https://api.privy.io/v1/policies/${policyId}`;
  const response = await fetch(endpoint, { method: "GET", headers: auth.headers });
  const body = await readJsonResponse(response);
  if (!response.ok) throw new Error(`Privy policy read failed for ${policyId} (${response.status}).`);
  return body;
}

async function readJsonResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}
