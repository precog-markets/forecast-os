import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PRECOG_LIST_MARKETS_REL, resolveRepoScript } from "./repo-discovery.mjs";
import { resolveHermesSkillRoot } from "./forecastos-runtime.mjs";

const MARKET_RESOLVE_REL = join("adapters", "actions", "precog", "lib", "market_resolve.mjs");

export function parseListArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eqIdx = arg.indexOf("=");
    if (eqIdx !== -1) {
      args[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[arg.slice(2)] = true;
      } else {
        args[arg.slice(2)] = argv[++i];
      }
    }
  }
  return args;
}

export async function loadHermesPrecogConfig(skillRoot = resolveHermesSkillRoot()) {
  const configPath = join(skillRoot, ".forecastos", "config.json");
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (!config?.precog?.open_api_key) {
      throw new Error("precog.open_api_key missing");
    }
    return { precog: config.precog, configPath };
  } catch (error) {
    const message = error?.message ?? String(error);
    throw new Error(
      [
        `Precog config not found at ${configPath} (${message}).`,
        "Run: node ${HERMES_SKILL_DIR}/scripts/check-hermes-setup.mjs",
        "Copy skill/forecast-os/.forecastos/config.json into the Hermes skill install .forecastos/ directory.",
      ].join(" "),
    );
  }
}

function parseOutcomeList(outcomesRaw) {
  const raw = String(outcomesRaw ?? "");
  if (!raw) return [];
  if (raw.includes("|")) return raw.split("|").map((value) => value.trim()).filter(Boolean);
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function parsePrecogMarketRecord(market) {
  const apiMarketId = market.id ?? market.precog_api_market_id;
  const onChainMarketId = market.master_market_id ?? market.deployed_market_id ?? apiMarketId;
  return {
    precog_api_market_id: apiMarketId !== undefined ? String(apiMarketId) : "",
    on_chain_market_id: String(onChainMarketId),
    question: String(market.name ?? market.question ?? market.title ?? `Market ${onChainMarketId}`),
    outcome_list: parseOutcomeList(market.outcomes ?? ""),
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function formatApiError(body) {
  const message = body?.error ?? body?.message ?? body?.detail;
  return message ? ` (${message})` : "";
}

export async function fetchPrecogMarketsInline({
  chainId,
  status = "OPEN",
  precogConfig,
  fetch: fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is not available in this runtime.");
  }
  const apiRoot = String(precogConfig.api_root ?? "https://service.precog.markets/").replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (chainId !== undefined && chainId !== null && chainId !== "") {
    params.set("chain_id", String(chainId));
  }
  if (status) params.set("status", String(status));
  const url = `${apiRoot}/api/v1/markets/?${params.toString()}`;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-Key": precogConfig.open_api_key,
    },
  });
  const body = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(`Precog market list failed: ${response.status}${formatApiError(body)}`);
  }
  const markets = Array.isArray(body) ? body : body?.data ?? body?.results ?? [];
  return markets.map((market) => parsePrecogMarketRecord(market));
}

async function resolveRepoFetchPrecogMarkets(env, skillRoot) {
  const resolution = await resolveRepoScript(MARKET_RESOLVE_REL, env, skillRoot);
  if (!resolution.ok || !resolution.scriptPath) return null;
  const mod = await import(pathToFileURL(resolution.scriptPath).href);
  return mod.fetchPrecogMarkets ?? null;
}

export function formatMarketList(markets) {
  const lines = [["api_id", "master_market_id", "name", "outcomes"].join("\t")];
  for (const market of markets) {
    const outcomes = market.outcome_list.join(", ");
    const truncatedOutcomes = outcomes.length > 60 ? `${outcomes.slice(0, 57)}...` : outcomes;
    lines.push([
      market.precog_api_market_id ?? "",
      market.on_chain_market_id,
      market.question.replace(/\s+/g, " ").slice(0, 80),
      truncatedOutcomes,
    ].join("\t"));
  }
  return lines.join("\n");
}

export async function listPrecogMarkets({
  args,
  env = process.env,
  skillRoot = resolveHermesSkillRoot(),
  fetch: fetchImpl = globalThis.fetch,
} = {}) {
  const chainId = args["chain-id"] ?? args.chain_id;
  const status = args.status ?? "OPEN";
  if (!chainId) {
    throw new Error("Usage: node list-precog-markets.mjs --chain-id <id> [--status OPEN]");
  }

  const { precog: precogConfig } = await loadHermesPrecogConfig(skillRoot);
  const repoFetch = await resolveRepoFetchPrecogMarkets(env, skillRoot);
  const markets = repoFetch
    ? await repoFetch({ chainId, status, fetch: fetchImpl, precogConfig })
    : await fetchPrecogMarketsInline({ chainId, status, precogConfig, fetch: fetchImpl });

  return { markets, chainId, status };
}

export async function main(deps = {}) {
  const args = deps.args ?? parseListArgs(deps.argv);
  const { markets, chainId, status } = await listPrecogMarkets({
    args,
    env: deps.env ?? process.env,
    skillRoot: deps.skillRoot,
    fetch: deps.fetch,
  });

  if (!markets.length) {
    console.log(`No ${status} markets for chain_id ${chainId}.`);
    return { markets: [] };
  }

  console.log(formatMarketList(markets));
  return { markets };
}
