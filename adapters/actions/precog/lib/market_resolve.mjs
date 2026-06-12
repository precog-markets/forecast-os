import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOutcomeList } from "./outcome.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const defaultConfigPath = join(moduleDir, "../../../../skill/forecast-os/.forecastos/config.json");

const CHAIN_TO_NETWORK = {
  8453: "mainnet",
  84532: "sepolia",
  42161: "mainnet",
};

export async function loadPrecogConfig(configPath = resolveConfigPath()) {
  const paths = [configPath, defaultConfigPath];
  if (process.env.FORECASTOS_STATE_DIR) {
    paths.unshift(
      join(process.env.FORECASTOS_STATE_DIR, "config.local.json"),
      join(process.env.FORECASTOS_STATE_DIR, "config.json"),
    );
  }
  for (const path of paths) {
    if (!path) continue;
    try {
      const config = JSON.parse(await readFile(path, "utf8"));
      if (config?.precog?.open_api_key) return config.precog;
    } catch {
      // try next path
    }
  }
  throw new Error(
    "Precog open_api_key not found. Copy skill/forecast-os/.forecastos/config.json or set FORECASTOS_STATE_DIR.",
  );
}

function resolveConfigPath() {
  return process.env.FORECASTOS_CONFIG_PATH ?? null;
}

export function networkForChainId(chainId) {
  const network = CHAIN_TO_NETWORK[Number(chainId)];
  if (!network) {
    throw new Error(`Unsupported Precog chain_id ${chainId} for trading scripts. Supported: 8453, 84532.`);
  }
  return network;
}

export function parsePrecogMarketRecord(market) {
  if (!market || typeof market !== "object") {
    throw new Error("Precog market response was empty.");
  }
  const apiMarketId = market.id ?? market.precog_api_market_id;
  const onChainMarketId = market.master_market_id ?? market.deployed_market_id ?? apiMarketId;
  if (onChainMarketId === undefined || onChainMarketId === null || onChainMarketId === "") {
    throw new Error("Precog market response missing master_market_id.");
  }
  const chainId = Number(market.chain_id);
  if (!Number.isFinite(chainId)) {
    throw new Error("Precog market response missing chain_id.");
  }
  const outcomesRaw = market.outcomes ?? "";
  return {
    precog_api_market_id: apiMarketId !== undefined ? String(apiMarketId) : undefined,
    on_chain_market_id: String(onChainMarketId),
    chain_id: chainId,
    network: networkForChainId(chainId),
    question: String(market.name ?? market.question ?? market.title ?? `Market ${onChainMarketId}`),
    master_address: market.master_address ?? market.address,
    outcome_list: parseOutcomeList(String(outcomesRaw)),
    raw: market,
  };
}

export async function fetchPrecogMarket({
  apiMarketId,
  masterMarketId,
  chainId,
  status,
  fetch: fetchImpl = globalThis.fetch,
  precogConfig,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is not available in this runtime.");
  }
  const config = precogConfig ?? await loadPrecogConfig();
  const apiRoot = String(config.api_root ?? "https://service.precog.markets/").replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (apiMarketId !== undefined && apiMarketId !== null && apiMarketId !== "") {
    params.set("id", String(apiMarketId));
  }
  if (masterMarketId !== undefined && masterMarketId !== null && masterMarketId !== "") {
    params.set("master_market_id", String(masterMarketId));
  }
  if (chainId !== undefined && chainId !== null && chainId !== "") {
    params.set("chain_id", String(chainId));
  }
  if (status) params.set("status", String(status));

  const url = `${apiRoot}/api/v1/markets/?${params.toString()}`;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-Key": config.open_api_key,
    },
  });
  const body = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(`Precog market lookup failed: ${response.status}${formatApiError(body)}`);
  }
  const markets = Array.isArray(body) ? body : body?.data ?? body?.results ?? [];
  if (!markets.length) {
    throw new Error("Precog market lookup returned no markets for the given filters.");
  }
  const picked = pickMarket(markets, { apiMarketId, masterMarketId, chainId });
  return parsePrecogMarketRecord(picked);
}

export async function fetchPrecogMarkets({
  chainId,
  status = "OPEN",
  fetch: fetchImpl = globalThis.fetch,
  precogConfig,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is not available in this runtime.");
  }
  const config = precogConfig ?? await loadPrecogConfig();
  const apiRoot = String(config.api_root ?? "https://service.precog.markets/").replace(/\/+$/, "");
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
      "X-API-Key": config.open_api_key,
    },
  });
  const body = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(`Precog market list failed: ${response.status}${formatApiError(body)}`);
  }
  const markets = Array.isArray(body) ? body : body?.data ?? body?.results ?? [];
  return markets.map((market) => parsePrecogMarketRecord(market));
}

export async function resolveMarketContext(args, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const loadConfig = deps.loadPrecogConfig ?? loadPrecogConfig;
  const userNetwork = args.network;
  const explicitMaster = args["master-market-id"];

  let resolved;
  if (explicitMaster) {
    const chainId = args["chain-id"] ?? args.chain_id;
    if (!chainId) {
      throw new Error("--master-market-id requires --chain-id when skipping Precog API lookup.");
    }
    resolved = {
      precog_api_market_id: args.market ? String(args.market) : undefined,
      on_chain_market_id: String(explicitMaster),
      chain_id: Number(chainId),
      network: userNetwork ?? networkForChainId(chainId),
      question: `Market ${explicitMaster}`,
      master_address: undefined,
      outcome_list: [],
      raw: null,
    };
    if (args.market) {
      try {
        const apiMarket = await fetchPrecogMarket({
          apiMarketId: args.market,
          chainId,
          fetch: fetchImpl,
          precogConfig: deps.precogConfig ?? await loadConfig(),
        });
        resolved.precog_api_market_id = apiMarket.precog_api_market_id;
        resolved.question = apiMarket.question;
        resolved.outcome_list = apiMarket.outcome_list;
        resolved.master_address = apiMarket.master_address;
        resolved.raw = apiMarket.raw;
      } catch {
        // keep explicit master-market-id path without API enrichment
      }
    }
  } else if (args.market) {
    resolved = await fetchPrecogMarket({
      apiMarketId: args.market,
      chainId: args["chain-id"],
      fetch: fetchImpl,
      precogConfig: deps.precogConfig ?? await loadConfig(),
    });
  } else {
    throw new Error("Provide --market <precog-api-id> or --master-market-id <on-chain-id>.");
  }

  const network = userNetwork ?? resolved.network;
  if (userNetwork && userNetwork !== resolved.network) {
    throw new Error(
      `Network mismatch: --network ${userNetwork} does not match Precog chain_id ${resolved.chain_id} (${resolved.network}).`,
    );
  }

  if (
    resolved.precog_api_market_id &&
    resolved.on_chain_market_id &&
    resolved.precog_api_market_id !== resolved.on_chain_market_id &&
    !explicitMaster
  ) {
    console.error(
      `Resolved Precog API id ${resolved.precog_api_market_id} to on-chain master_market_id ${resolved.on_chain_market_id} on ${network}.`,
    );
  }

  return {
    ...resolved,
    network,
  };
}

function pickMarket(markets, { apiMarketId, masterMarketId, chainId }) {
  const chainFilter = chainId !== undefined && chainId !== null && chainId !== ""
    ? String(chainId)
    : null;
  const filtered = markets.filter((market) => {
    if (!chainFilter) return true;
    return String(market.chain_id) === chainFilter;
  });
  const pool = filtered.length ? filtered : markets;
  if (apiMarketId !== undefined && apiMarketId !== null && apiMarketId !== "") {
    const match = pool.find((market) => String(market.id) === String(apiMarketId));
    if (match) return match;
  }
  if (masterMarketId !== undefined && masterMarketId !== null && masterMarketId !== "") {
    const match = pool.find((market) => String(market.master_market_id) === String(masterMarketId));
    if (match) return match;
  }
  return pool[0];
}

async function readJsonResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function formatApiError(body) {
  const message = body?.error ?? body?.message ?? body?.detail;
  return message ? ` (${message})` : "";
}

export function buildChainReadFailureError(marketContext, cause) {
  const apiId = marketContext.precog_api_market_id;
  const onChainId = marketContext.on_chain_market_id;
  const suffix = apiId && apiId !== onChainId
    ? ` API id ${apiId} maps to on-chain master_market_id ${onChainId}; use --network ${marketContext.network}.`
    : ` Use --network ${marketContext.network}.`;
  const message = cause?.message ?? String(cause ?? "unknown error");
  return new Error(`Failed to load on-chain market ${onChainId}.${suffix} ${message}`.trim());
}
