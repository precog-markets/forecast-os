#!/usr/bin/env node
// Read-only setup check for the ForecastOS Hermes skill export.
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BASE_MCP_TRADE_REL,
  PRECOG_LIST_MARKETS_REL,
  PRECOG_QUOTE_REL,
  resolveRepoScript,
} from "./repo-discovery.mjs";
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
  await checkHermesStateConfig(hermesSkillRoot, repoRoot),
  await checkHermesStateDir(hermesSkillRoot),
  await checkDir("wallet_adapters", join(repoRoot, "adapters", "wallets")),
  await checkPrivyAdapterResolution(process.env, hermesSkillRoot),
  await checkFile("hermes_action_wrapper", join(hermesSkillRoot, "scripts", "forecastos-action.mjs")),
  await checkFile("hermes_prepare_create_wrapper", join(hermesSkillRoot, "scripts", "prepare-create-intent.mjs")),
  await checkFile("hermes_privy_wrapper", join(hermesSkillRoot, "scripts", "resolve-privy-create.mjs")),
  await checkFile("hermes_privy_patch_wrapper", join(hermesSkillRoot, "scripts", "patch-privy-chain-policy.mjs")),
  await checkFile("hermes_quote_precog_shim", join(hermesSkillRoot, "scripts", "quote-precog.mjs")),
  await checkFile("hermes_list_precog_markets_shim", join(hermesSkillRoot, "scripts", "list-precog-markets.mjs")),
  await checkFile("hermes_prepare_precog_buy_shim", join(hermesSkillRoot, "scripts", "prepare-precog-buy.mjs")),
  await checkFile("hermes_resolve_base_mcp_trade_shim", join(hermesSkillRoot, "scripts", "resolve-base-mcp-trade.mjs")),
  await checkPrecogListMarketsReady(hermesSkillRoot, repoRoot),
  await checkPrecogQuoteScript(process.env, hermesSkillRoot),
  await checkBaseMcpTradeResolver(process.env, hermesSkillRoot),
  await checkFile("hermes_skill", join(hermesSkillRoot, "SKILL.md")),
  await checkPrivyTypedDataPolicyCoverage(process.env, repoRoot),
];

const ok = checks.every((check) => check.ok || check.optional);
const precogQuoteCheck = checks.find((check) => check.name === "precog_quote_script");
const precogListCheck = checks.find((check) => check.name === "precog_list_markets_ready");
const precogActionsInstalled = Boolean(precogQuoteCheck?.ok);
const precogListMarketsReady = Boolean(precogListCheck?.ok);
process.stdout.write(
  JSON.stringify(
    {
      ok,
      hermes_skill_root: hermesSkillRoot,
      forecastos_repo_root: repoRoot,
      precog_actions_installed: precogActionsInstalled,
      precog_list_markets_ready: precogListMarketsReady,
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

async function checkHermesStateConfig(skillRoot, repoRootPath) {
  const localPath = join(skillRoot, ".forecastos", "config.json");
  try {
    await access(localPath, constants.R_OK);
    const config = JSON.parse(await readFile(localPath, "utf8"));
    if (!config?.precog?.open_api_key) {
      return {
        name: "hermes_state_config",
        ok: false,
        optional: true,
        path: localPath,
        error: "precog.open_api_key missing from Hermes skill config.",
        guidance: `Copy a shipped ForecastOS config with precog.open_api_key into ${localPath}.`,
      };
    }
    return { name: "hermes_state_config", ok: true, path: localPath };
  } catch (error) {
    const shippedPath = join(repoRootPath, "skill", "forecast-os", ".forecastos", "config.json");
    return {
      name: "hermes_state_config",
      ok: false,
      optional: true,
      path: localPath,
      error: error?.message ?? String(error),
      guidance: [
        "Copy the shipped ForecastOS config into the Hermes skill install:",
        `mkdir -p ${join(skillRoot, ".forecastos")}`,
        `cp ${shippedPath} ${localPath}`,
        "Or set FORECASTOS_REPO_ROOT so the runtime can read the repo shipped config as fallback.",
      ].join("\n"),
    };
  }
}

async function checkHermesStateDir(skillRoot) {
  const stateDir = join(skillRoot, ".forecastos");
  try {
    await access(stateDir, constants.W_OK);
    return { name: "hermes_state_dir", ok: true, path: stateDir };
  } catch (error) {
    return {
      name: "hermes_state_dir",
      ok: false,
      optional: true,
      path: stateDir,
      error: error?.message ?? String(error),
      guidance: `mkdir -p ${join(stateDir, "drafts")} ${join(stateDir, "workflows", "all")}`,
    };
  }
}

async function checkPrecogListMarketsReady(skillRoot, repoRootPath) {
  const shimPath = join(skillRoot, "scripts", "list-precog-markets.mjs");
  const runtimePath = join(skillRoot, "scripts", "precog-list-runtime.mjs");
  try {
    await access(shimPath, constants.R_OK);
    await access(runtimePath, constants.R_OK);
  } catch (error) {
    return {
      name: "precog_list_markets_ready",
      ok: false,
      path: shimPath,
      error: error?.message ?? String(error),
    };
  }

  const localConfigPath = join(skillRoot, ".forecastos", "config.json");
  try {
    const config = JSON.parse(await readFile(localConfigPath, "utf8"));
    if (!config?.precog?.open_api_key) {
      throw new Error("precog.open_api_key missing");
    }
  } catch (error) {
    const shippedPath = join(repoRootPath, "skill", "forecast-os", ".forecastos", "config.json");
    return {
      name: "precog_list_markets_ready",
      ok: false,
      optional: true,
      path: localConfigPath,
      error: error?.message ?? String(error),
      guidance: [
        "Market listing reads open_api_key from the Hermes skill install:",
        `mkdir -p ${join(skillRoot, ".forecastos")}`,
        `cp ${shippedPath} ${localConfigPath}`,
        "Then rerun: node ${HERMES_SKILL_DIR}/scripts/list-precog-markets.mjs --chain-id 8453 --status OPEN",
      ].join("\n"),
    };
  }

  const repoResolution = await resolveRepoScript(PRECOG_LIST_MARKETS_REL, process.env, skillRoot);
  return {
    name: "precog_list_markets_ready",
    ok: true,
    shim_path: shimPath,
    config_path: localConfigPath,
    repo_list_script: repoResolution.ok ? repoResolution.scriptPath : null,
    repo_root_required_for_trading_only: !repoResolution.ok,
  };
}

async function checkPrecogQuoteScript(env, skillRoot) {
  const resolution = await resolveRepoScript(PRECOG_QUOTE_REL, env, skillRoot);
  if (resolution.ok) {
    return {
      name: "precog_quote_script",
      ok: true,
      path: resolution.scriptPath,
      repo_root: resolution.repoRoot,
    };
  }
  return {
    name: "precog_quote_script",
    ok: false,
    optional: true,
    checked_paths: resolution.checkedPaths,
    guidance:
      resolution.guidance ??
      "Set FORECASTOS_REPO_ROOT to a ForecastOS checkout that includes adapters/actions/precog.",
  };
}

async function checkBaseMcpTradeResolver(env, skillRoot) {
  const resolution = await resolveRepoScript(BASE_MCP_TRADE_REL, env, skillRoot);
  if (resolution.ok) {
    return {
      name: "base_mcp_trade_resolver",
      ok: true,
      path: resolution.scriptPath,
      repo_root: resolution.repoRoot,
    };
  }
  return {
    name: "base_mcp_trade_resolver",
    ok: false,
    optional: true,
    checked_paths: resolution.checkedPaths,
    guidance:
      resolution.guidance ??
      "Set FORECASTOS_REPO_ROOT to a ForecastOS checkout that includes adapters/wallets/base-mcp/resolve_trade.mjs.",
  };
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
    const { buildPatchCommand, buildTypedDataAllowRule } = await import(
      pathToFileURL(join(repoRootPath, "adapters", "wallets", "privy", "policy_rules.mjs")).href
    );
    const { chainIds, hasUnrestrictedRule } = extractAllowedTypedDataChainIds(policies);
    const supports8453 = hasUnrestrictedRule || chainIds.includes("8453");
    const supports42161 = hasUnrestrictedRule || chainIds.includes("42161");
    const missingChainIds = [];
    if (!supports8453) missingChainIds.push(8453);
    if (!supports42161) missingChainIds.push(42161);
    const warnings = [];
    if (!supports8453) warnings.push("Missing eth_signTypedData_v4 ALLOW for Base chainId 8453.");
    if (!supports42161) warnings.push("Missing eth_signTypedData_v4 ALLOW for Arbitrum chainId 42161.");
    const patchScript = join(hermesSkillRoot, "scripts", "patch-privy-chain-policy.mjs");
    const patchCommands = missingChainIds.map((chainId) =>
      buildPatchCommand({
        walletId,
        chainId,
        scriptPath: patchScript,
      }),
    );
    return {
      name: "privy_typed_data_policy",
      ok: true,
      optional: true,
      wallet_id: walletId,
      policy_ids: wallet.policy_ids ?? [],
      allowed_chain_ids: chainIds,
      missing_chain_ids: missingChainIds,
      has_unrestricted_rule: hasUnrestrictedRule,
      supports_base: supports8453,
      supports_arbitrum: supports42161,
      warnings,
      rule_template: missingChainIds.length ? buildTypedDataAllowRule(missingChainIds[0]) : null,
      patch_command: patchCommands[0] ?? null,
      patch_commands: patchCommands,
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
