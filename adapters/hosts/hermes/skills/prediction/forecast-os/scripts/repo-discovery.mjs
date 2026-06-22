// ForecastOS repo-root and wallet-adapter discovery for copied skill installs.
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const PRIVY_ADAPTER_REL = join("adapters", "wallets", "privy", "resolve_create.mjs");
export const ACTION_SCRIPT_REL = join("skill", "forecast-os", "scripts", "forecastos_action.mjs");
export const PRECOG_ACTIONS_REL = join("adapters", "actions", "precog");
export const PRECOG_QUOTE_REL = join(PRECOG_ACTIONS_REL, "quote.mjs");
export const PRECOG_PREPARE_BUY_REL = join(PRECOG_ACTIONS_REL, "prepare_buy.mjs");
export const PRECOG_PREPARE_SELL_REL = join(PRECOG_ACTIONS_REL, "prepare_sell.mjs");
export const PRECOG_PREPARE_REDEEM_REL = join(PRECOG_ACTIONS_REL, "prepare_redeem.mjs");
export const PRECOG_REDEEM_STATUS_REL = join(PRECOG_ACTIONS_REL, "redeem_status.mjs");
export const PRECOG_POSITIONS_REL = join(PRECOG_ACTIONS_REL, "positions.mjs");
export const PRECOG_LIST_MARKETS_REL = join(PRECOG_ACTIONS_REL, "list_markets.mjs");
export const BASE_MCP_TRADE_REL = join("adapters", "wallets", "base-mcp", "resolve_trade.mjs");

export function buildPrivyAdapterPath(repoRoot) {
  return join(repoRoot, PRIVY_ADAPTER_REL);
}

export function buildRepoScriptPath(repoRoot, relPath) {
  return join(repoRoot, relPath);
}

export function buildRepoRootCandidates(env = process.env, skillRoot = process.cwd()) {
  const candidates = [];
  if (env?.FORECASTOS_REPO_ROOT) {
    candidates.push(resolve(env.FORECASTOS_REPO_ROOT));
  }
  let current = resolve(skillRoot);
  for (let depth = 0; depth < 12; depth += 1) {
    candidates.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return [...new Set(candidates)];
}

export function getPrivyAdapterCandidates(env = process.env, skillRoot = process.cwd()) {
  return buildRepoRootCandidates(env, skillRoot).map((repoRoot) => buildPrivyAdapterPath(repoRoot));
}

export async function resolveForecastOSRepoRoot(env = process.env, skillRoot = process.cwd()) {
  const checkedPaths = [];
  for (const candidate of buildRepoRootCandidates(env, skillRoot)) {
    const privyAdapter = buildPrivyAdapterPath(candidate);
    const actionScript = join(candidate, ACTION_SCRIPT_REL);
    checkedPaths.push({
      repo_root: candidate,
      privy_adapter: privyAdapter,
      action_script: actionScript,
    });
    try {
      await access(privyAdapter, constants.R_OK);
      return {
        ok: true,
        repoRoot: candidate,
        adapterScript: privyAdapter,
        checkedPaths,
      };
    } catch {
      // keep probing
    }
    try {
      await access(actionScript, constants.R_OK);
      return {
        ok: true,
        repoRoot: candidate,
        adapterScript: privyAdapter,
        checkedPaths,
      };
    } catch {
      // keep probing
    }
  }
  return {
    ok: false,
    repoRoot: null,
    adapterScript: null,
    checkedPaths,
  };
}

export async function resolveRepoScript(relPath, env = process.env, skillRoot = process.cwd()) {
  const resolved = await resolveForecastOSRepoRoot(env, skillRoot);
  const scriptPath = resolved.repoRoot ? buildRepoScriptPath(resolved.repoRoot, relPath) : null;
  const checkedPaths = resolved.checkedPaths.map((entry) => buildRepoScriptPath(entry.repo_root, relPath));
  if (!resolved.ok || !scriptPath) {
    return {
      ok: false,
      repoRoot: resolved.repoRoot,
      scriptPath: null,
      checkedPaths,
      guidance: buildPrecogRepoGuidance(relPath, checkedPaths),
    };
  }
  try {
    await access(scriptPath, constants.R_OK);
    return {
      ok: true,
      repoRoot: resolved.repoRoot,
      scriptPath,
      checkedPaths,
      guidance: null,
    };
  } catch (error) {
    return {
      ok: false,
      repoRoot: resolved.repoRoot,
      scriptPath,
      checkedPaths,
      guidance: buildPrecogRepoGuidance(relPath, checkedPaths, error),
    };
  }
}

export async function resolvePrecogQuoteScript(env = process.env, skillRoot = process.cwd()) {
  return resolveRepoScript(PRECOG_QUOTE_REL, env, skillRoot);
}

export async function resolvePrivyAdapterScript(env = process.env, skillRoot = process.cwd()) {
  const resolved = await resolveForecastOSRepoRoot(env, skillRoot);
  const checkedPaths = resolved.checkedPaths.map((entry) => entry.privy_adapter);
  if (!resolved.ok || !resolved.adapterScript) {
    return {
      ok: false,
      repoRoot: resolved.repoRoot,
      adapterScript: null,
      checkedPaths,
      guidance: buildRepoRootGuidance(checkedPaths),
    };
  }
  try {
    await access(resolved.adapterScript, constants.R_OK);
    return {
      ok: true,
      repoRoot: resolved.repoRoot,
      adapterScript: resolved.adapterScript,
      checkedPaths,
      guidance: null,
    };
  } catch (error) {
    return {
      ok: false,
      repoRoot: resolved.repoRoot,
      adapterScript: resolved.adapterScript,
      checkedPaths,
      guidance: buildRepoRootGuidance(checkedPaths, error),
    };
  }
}

export function buildRepoRootGuidance(checkedPaths = [], cause) {
  const lines = [
    "ForecastOS Privy signing requires the repo-root adapter at adapters/wallets/privy/resolve_create.mjs.",
    "Do not look for adapters/wallets under a copied Hermes skill install directory.",
    "Set FORECASTOS_REPO_ROOT to the ForecastOS repo root, then rerun:",
    "node <skill-dir>/scripts/resolve-privy-create.mjs --input <create-intent.json> --wallet-id <id>",
    "Checked adapter paths:",
    ...checkedPaths.map((path) => `- ${path}`),
  ];
  if (cause?.message) lines.push(`Last error: ${cause.message}`);
  return lines.join("\n");
}

export function buildPrecogRepoGuidance(relPath, checkedPaths = [], cause) {
  const lines = [
    `ForecastOS Precog trading requires the repo-root script at ${relPath}.`,
    "Do not grep or expect adapters/actions/precog under a copied Hermes skill install directory.",
    "Set FORECASTOS_REPO_ROOT to the ForecastOS repo root (for example feat/add-trading checkout), then rerun the Hermes shim.",
    "Checked script paths:",
    ...checkedPaths.map((path) => `- ${path}`),
  ];
  if (cause?.message) lines.push(`Last error: ${cause.message}`);
  return lines.join("\n");
}

export function buildRepoRootRequiredError(resolution, skillRoot, label = "Privy wallet adapter") {
  const error = new Error(
    `ForecastOS repo root is required to resolve the ${label} for copied skill installs.`,
  );
  error.code = "FORECASTOS_REPO_ROOT_REQUIRED";
  error.skill_root = skillRoot;
  error.checked_paths = resolution.checkedPaths ?? [];
  error.guidance = resolution.guidance ?? buildRepoRootGuidance(error.checked_paths);
  return error;
}

export function buildPrecogRepoRequiredError(resolution, skillRoot, relPath) {
  const error = new Error(
    `ForecastOS repo root is required to resolve ${relPath} for copied skill installs.`,
  );
  error.code = "FORECASTOS_REPO_ROOT_REQUIRED";
  error.skill_root = skillRoot;
  error.checked_paths = resolution.checkedPaths ?? [];
  error.guidance = resolution.guidance ?? buildPrecogRepoGuidance(relPath, error.checked_paths);
  return error;
}
