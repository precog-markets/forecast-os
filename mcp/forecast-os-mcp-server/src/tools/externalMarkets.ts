import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  EXTERNAL_MARKET_REQUEST_TIMEOUT_MS,
  KALSHI_API_ROOT,
  POLYMARKET_CLOB_API_ROOT,
  POLYMARKET_GAMMA_API_ROOT,
  RESOURCE_ROOT,
} from "../constants.js";
import {
  kalshiCacheDir,
  kalshiCacheTtlMs,
  searchKalshiMarketCache,
  type KalshiCacheMode,
} from "../services/kalshiCache.js";
import type { ResponseFormat } from "../types.js";

export type ExternalMarketProvider = "precog" | "polymarket" | "kalshi";
export type ExternalMarketSearchProvider = ExternalMarketProvider | "all";
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface PolymarketIdentifier {
  slug?: string;
  event_id?: string | number;
  market_id?: string | number;
  condition_id?: string;
  token_id?: string;
}

export interface ExternalMarketIdentifier {
  precog?: {
    id?: string | number;
    master_market_id?: string | number;
    deployed_market_id?: string | number;
  };
  polymarket?: PolymarketIdentifier;
  kalshi?: {
    ticker?: string;
    event_ticker?: string;
    series_ticker?: string;
  };
}

export interface ExternalMarketEnvelope {
  provider?: ExternalMarketProvider;
  response_format?: ResponseFormat;
}

export interface SearchMarketsInput extends Omit<ExternalMarketEnvelope, "provider"> {
  provider?: ExternalMarketSearchProvider;
  query?: string;
  slug?: string;
  tag_id?: string | number;
  ticker?: string;
  event_ticker?: string;
  series_ticker?: string;
  status?: "active" | "closed" | "all";
  cache_mode?: KalshiCacheMode;
  limit?: number;
  offset?: number;
}

export interface GetMarketInput extends ExternalMarketEnvelope {
  identifier: ExternalMarketIdentifier;
}

export interface GetMarketPricesInput extends GetMarketInput {
  side?: "BUY" | "SELL";
}

export interface GetMarketOrderbookInput extends GetMarketInput {
  depth?: number;
}

interface NormalizedMarket {
  provider?: ExternalMarketProvider;
  provider_market_id?: string;
  condition_id?: string;
  slug?: string;
  event_ticker?: string;
  series_ticker?: string;
  title?: string;
  question?: string;
  subtitle?: string;
  status?: string;
  outcomes?: Array<{
    name?: string;
    token_id?: string;
    price?: number | string;
    bid?: number | string;
    ask?: number | string;
    last_price?: number | string;
    price_scale?: string;
  }>;
  volume?: number | string;
  volume_24h?: number | string;
  liquidity?: number | string;
  open_interest?: number | string;
  close_time?: string;
  resolution_time?: string;
  source_url?: string;
  markets?: NormalizedMarket[];
}

function providerOf(input: ExternalMarketEnvelope): ExternalMarketProvider {
  return input.provider ?? "polymarket";
}

function readOnlyEnvelope(provider: ExternalMarketProvider | "all", source: string, normalized: unknown, raw: unknown) {
  return {
    provider,
    read_only: true,
    source,
    retrieved_at: new Date().toISOString(),
    normalized,
    raw,
  };
}

export async function searchExternalMarkets(
  input: SearchMarketsInput,
  fetcher: FetchLike = fetch,
): Promise<any> {
  const provider = input.provider ?? "all";
  if (provider === "all") return searchAllExternalMarkets(input, fetcher);
  if (provider === "precog") return searchPrecogMarkets(input, fetcher);
  if (provider === "kalshi") return searchKalshiMarkets(input, fetcher);
  if (provider !== "polymarket") return unsupportedProvider(provider);

  const limit = clamp(input.limit ?? 20, 1, 100);
  const offset = Math.max(0, input.offset ?? 0);
  const params: Record<string, string | number | boolean | undefined> = {
    limit: input.query ? Math.max(limit, 50) : limit,
    offset,
    slug: input.slug,
    tag_id: input.tag_id,
    order: "volume_24hr",
    ascending: false,
  };
  addStatusParams(params, input.status ?? "active");

  const url = buildUrl(POLYMARKET_GAMMA_API_ROOT, "/events", params);
  const raw = await fetchJson(url, fetcher);
  const events = ensureArray(raw);
  const query = input.query?.toLowerCase();
  const filtered = query
    ? events.filter((event) => JSON.stringify(pickSearchFields(event)).toLowerCase().includes(query))
    : events;
  const limited = filtered.slice(0, limit);

  return readOnlyEnvelope(
    "polymarket",
    url.toString(),
    {
      markets: limited.map((event) => normalizePolymarketEvent(event)),
      limit,
      offset,
      has_more: events.length > offset + limit,
    },
    raw,
  );
}

export async function getExternalMarket(
  input: GetMarketInput,
  fetcher: FetchLike = fetch,
) {
  const provider = providerOf(input);
  if (provider === "precog") {
    const id = precogIdentifier(input.identifier);
    const result = await fetchPrecogMarket(id, fetcher);
    return readOnlyEnvelope("precog", result.source, result.normalized, result.raw);
  }
  if (provider === "kalshi") {
    const id = kalshiIdentifier(input.identifier);
    const result = await fetchKalshiMarket(id, fetcher);
    return readOnlyEnvelope("kalshi", result.source, result.normalized, result.raw);
  }
  if (provider !== "polymarket") return unsupportedProvider(provider);

  const id = polymarketIdentifier(input.identifier);
  const result = await fetchPolymarketMarket(id, fetcher);
  return readOnlyEnvelope("polymarket", result.source, result.normalized, result.raw);
}

export async function getExternalMarketPrices(
  input: GetMarketPricesInput,
  fetcher: FetchLike = fetch,
) {
  const provider = providerOf(input);
  if (provider === "precog") {
    const id = precogIdentifier(input.identifier);
    const result = await fetchPrecogMarket(id, fetcher);
    const markets = normalizedPrecogMarkets(result.normalized);
    if (markets.length === 0) {
      throw new Error("Precog prices require identifier.precog.id, master_market_id, or deployed_market_id.");
    }
    return readOnlyEnvelope(
      "precog",
      result.source,
      {
        prices: markets.map((market) => ({
          id: market.provider_market_id,
          outcomes: market.outcomes,
        })),
      },
      result.raw,
    );
  }
  if (provider === "kalshi") {
    const id = kalshiIdentifier(input.identifier);
    const result = await fetchKalshiMarket(id, fetcher);
    const markets = normalizedKalshiMarkets(result.normalized);
    if (markets.length === 0) {
      throw new Error("Kalshi prices require identifier.kalshi.ticker, event_ticker, or series_ticker with markets.");
    }
    return readOnlyEnvelope(
      "kalshi",
      result.source,
      {
        prices: markets.map((market) => ({
          ticker: market.provider_market_id,
          event_ticker: market.event_ticker,
          series_ticker: market.series_ticker,
          outcomes: market.outcomes,
        })),
      },
      result.raw,
    );
  }
  if (provider !== "polymarket") return unsupportedProvider(provider);

  const id = polymarketIdentifier(input.identifier);
  const tokenIds = id.token_id ? [id.token_id] : await tokenIdsForPolymarketMarket(id, fetcher);
  if (tokenIds.length === 0) {
    throw new Error("Polymarket prices require a token_id or a market identifier with outcome token IDs.");
  }

  const results = [];
  for (const tokenId of tokenIds) {
    results.push(await fetchPolymarketPricesForToken(tokenId, input.side, fetcher));
  }

  return readOnlyEnvelope(
    "polymarket",
    results.map((result) => result.source).join(", "),
    {
      prices: results.map((result) => result.normalized),
    },
    results.map((result) => result.raw),
  );
}

export async function getExternalMarketOrderbook(
  input: GetMarketOrderbookInput,
  fetcher: FetchLike = fetch,
) {
  const provider = providerOf(input);
  if (provider === "precog") {
    throw new Error("Precog orderbook reads are not supported by this read-only adapter.");
  }
  if (provider === "kalshi") return getKalshiOrderbook(input, fetcher);
  if (provider !== "polymarket") return unsupportedProvider(provider);

  const id = polymarketIdentifier(input.identifier);
  if (!id.token_id) {
    throw new Error("Polymarket orderbook reads require identifier.polymarket.token_id.");
  }

  const depth = clamp(input.depth ?? 25, 1, 100);
  const url = buildUrl(POLYMARKET_CLOB_API_ROOT, "/book", { token_id: id.token_id });
  const raw = await fetchJson(url, fetcher);
  const book = asRecord(raw);
  const bids = ensureArray(book.bids).slice(0, depth);
  const asks = ensureArray(book.asks).slice(0, depth);

  return readOnlyEnvelope(
    "polymarket",
    url.toString(),
    {
      token_id: id.token_id,
      bids,
      asks,
      tick_size: book.tick_size,
      min_order_size: book.min_order_size,
      neg_risk: book.neg_risk,
      depth,
    },
    raw,
  );
}

export function formatExternalMarketResult(value: any): string {
  if (value.provider !== "precog" && value.provider !== "polymarket" && value.provider !== "kalshi" && value.provider !== "all") {
    return `Provider ${value.provider} is not implemented yet.\n\n${value.next_step ?? ""}`.trim();
  }
  const normalized = value.normalized ?? {};
  if (Array.isArray(normalized.markets)) {
    const lines = normalized.markets.map((market: NormalizedMarket) =>
      `- ${market.title ?? market.question ?? market.slug ?? market.provider_market_id ?? "Untitled"}${market.source_url ? ` (${market.source_url})` : ""}`,
    );
    return [`${providerLabel(value.provider)} markets (${normalized.markets.length})`, ...lines, "", `Source: ${value.source}`].join("\n");
  }
  if (Array.isArray(normalized.prices)) {
    const lines = normalized.prices.map((price: any) =>
      price.outcomes
        ? `- ${price.ticker}: ${price.outcomes.map((outcome: any) => `${outcome.name} bid ${outcome.bid ?? "n/a"} ask ${outcome.ask ?? "n/a"} last ${outcome.last_price ?? "n/a"}`).join("; ")}`
        : `- ${price.token_id}: midpoint ${price.midpoint ?? "n/a"}, spread ${price.spread ?? "n/a"}, last ${price.last_trade_price ?? "n/a"}`,
    );
    return [`${providerLabel(value.provider)} prices (${normalized.prices.length})`, ...lines, "", `Source: ${value.source}`].join("\n");
  }
  if (normalized.bids || normalized.asks || normalized.yes_bids || normalized.no_bids) {
    return [
      `${providerLabel(value.provider)} orderbook for ${normalized.token_id ?? normalized.ticker}`,
      normalized.yes_bids || normalized.no_bids
        ? `YES bids: ${normalized.yes_bids?.length ?? 0}; NO bids: ${normalized.no_bids?.length ?? 0}`
        : `Bids: ${normalized.bids?.length ?? 0}`,
      normalized.asks ? `Asks: ${normalized.asks?.length ?? 0}` : undefined,
      `Source: ${value.source}`,
    ].filter(Boolean).join("\n");
  }
  const title = normalized.title ?? normalized.question ?? normalized.slug ?? normalized.provider_market_id ?? `${providerLabel(value.provider)} market`;
  return [
    `${title}`,
    normalized.source_url ? `URL: ${normalized.source_url}` : undefined,
    `Source: ${value.source}`,
  ].filter(Boolean).join("\n");
}

async function searchAllExternalMarkets(input: SearchMarketsInput, fetcher: FetchLike): Promise<any> {
  const providers: ExternalMarketProvider[] = ["precog", "kalshi", "polymarket"];
  const providerResults = [];
  const markets: NormalizedMarket[] = [];
  const errors = [];
  for (const provider of providers) {
    try {
      const result: any = await searchExternalMarkets({ ...input, provider }, fetcher);
      const normalized = asRecord(result.normalized);
      const providerMarkets = ensureArray(normalized.markets) as NormalizedMarket[];
      markets.push(...providerMarkets);
      providerResults.push({
        provider,
        checked: true,
        market_count: providerMarkets.length,
        source: result.source,
        search_mode: normalized.search_mode,
      });
    } catch (error) {
      errors.push({
        provider,
        checked: true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return readOnlyEnvelope(
    "all",
    providerResults.map((result) => result.source).filter(Boolean).join(", "),
    {
      markets,
      providers: providerResults,
      errors,
      provider_order: providers,
      search_mode: "precog_first_provider_sweep",
    },
    { providers: providerResults, errors },
  );
}

export function precogMarketCapabilities() {
  return {
    provider: "precog",
    read_only: true,
    implemented: true,
    endpoints: {
      markets: "GET /api/v1/markets/",
    },
    supported_reads: [
      "Precog markets by status, id, master_market_id, or deployed_market_id",
      "Open market discovery through /api/v1/markets/?status=OPEN",
      "Outcome probability fields from market outcomes_prices",
    ],
    unsupported_actions: [
      "market creation through MCP",
      "funding through MCP",
      "wallet operations",
      "signing",
      "token approvals",
      "orderbook reads",
    ],
    search_priority: "first",
  };
}

export function polymarketCapabilities() {
  return {
    provider: "polymarket",
    read_only: true,
    implemented: true,
    endpoints: {
      gamma_api: POLYMARKET_GAMMA_API_ROOT,
      clob_api: POLYMARKET_CLOB_API_ROOT,
    },
    supported_reads: [
      "Gamma events and markets",
      "CLOB token orderbook",
      "CLOB token price, midpoint, spread, and last trade price",
    ],
    unsupported_actions: [
      "authentication",
      "order placement",
      "order cancellation",
      "wallet operations",
      "bridge operations",
      "gasless relayer operations",
      "user WebSocket channel",
    ],
    future_providers: ["kalshi"],
  };
}

export function kalshiCapabilities() {
  return {
    provider: "kalshi",
    read_only: true,
    implemented: true,
    endpoints: {
      trade_api: KALSHI_API_ROOT,
    },
    supported_reads: [
      "Public markets by ticker, event_ticker, series_ticker, and status",
      "Persistent cached keyword search over open markets with Aeon-style series enrichment",
      "Public event details with nested markets",
      "Public market prices from market fields",
      "Public single-market orderbook depth",
    ],
    unsupported_actions: [
      "authentication",
      "order placement",
      "order cancellation",
      "portfolio reads",
      "wallet operations",
      "WebSocket subscriptions",
    ],
    search_mode: "persistent cache for keyword search; native live filters for ticker, event_ticker, and series_ticker",
    cache: {
      default_mode: "auto",
      ttl_ms: kalshiCacheTtlMs(),
      directory: kalshiCacheDir(),
      override_env: "FORECASTOS_KALSHI_CACHE_DIR",
      modes: ["auto", "refresh", "bypass"],
    },
  };
}

async function searchPrecogMarkets(input: SearchMarketsInput, fetcher: FetchLike) {
  const limit = clamp(input.limit ?? 20, 1, 100);
  const offset = Math.max(0, input.offset ?? 0);
  const query = input.query;
  const config = await readPrecogMarketConfig();
  const headers = precogHeaders(config);
  const scanLimit = query ? 1000 : Math.min(offset + limit, 1000);
  const marketsUrl = buildUrl(config.api_root, "/api/v1/markets/", {
    status: precogStatus(input.status ?? "active"),
    limit: scanLimit,
  });
  const raw = await fetchJson(marketsUrl, fetcher, { method: "GET", headers });
  const candidates = precogCollection(raw)
    .map((market) => ({ ...asRecord(market), precog_market_kind: "market" }))
    .filter((market) => isConfiguredPrecogMarket(market, config));
  const filtered = query
    ? candidates
      .map((market) => ({ market, score: scoreSearchQuery(pickPrecogSearchFields(market), query) }))
      .filter((entry) => entry.score.matched)
      .sort((left, right) => right.score.value - left.score.value)
      .map((entry) => entry.market)
    : candidates;
  const limited = filtered.slice(offset, offset + limit);

  return readOnlyEnvelope(
    "precog",
    marketsUrl.toString(),
    {
      markets: limited.map((market) => normalizePrecogMarket(market)),
      limit,
      offset,
      has_more: filtered.length > offset + limit,
      search_mode: "precog_markets_status_filter",
      checked: ["markets"],
      scan_limit: scanLimit,
    },
    {
      market_count: candidates.length,
      matched_count: filtered.length,
      scan_limit: scanLimit,
      markets: limited,
    },
  );
}

async function fetchPrecogMarket(id: NonNullable<ExternalMarketIdentifier["precog"]>, fetcher: FetchLike) {
  const config = await readPrecogMarketConfig();
  const headers = precogHeaders(config);
  const url = buildUrl(config.api_root, "/api/v1/markets/", {
    id: id.id,
    master_market_id: id.master_market_id,
    deployed_market_id: id.deployed_market_id,
  });
  const raw = await fetchJson(url, fetcher, { method: "GET", headers });
  const collection = precogCollection(raw).map((market) => asRecord(market));
  const market = pickPrecogMarket(collection, id, config) ?? raw;
  return { source: url.toString(), normalized: normalizePrecogMarket({ ...asRecord(market), precog_market_kind: "market" }), raw };
}

async function searchKalshiMarkets(input: SearchMarketsInput, fetcher: FetchLike) {
  const limit = clamp(input.limit ?? 20, 1, 100);
  const offset = Math.max(0, input.offset ?? 0);
  const query = input.query?.toLowerCase();
  const cacheMode = input.cache_mode ?? "auto";
  const canUseCache = Boolean(query)
    && cacheMode !== "bypass"
    && (input.status ?? "active") === "active"
    && !input.ticker
    && !input.event_ticker
    && !input.series_ticker;

  if (query && canUseCache) {
    const cached = await searchKalshiMarketCache({
      query,
      limit,
      offset,
      mode: cacheMode,
      fetcher,
    });
    return readOnlyEnvelope(
      "kalshi",
      cached.source,
      {
        markets: cached.markets.map((market) => normalizeKalshiMarket(market)),
        limit,
        offset,
        has_more: cached.total_matches > offset + limit,
        search_mode: "persistent_cache",
        cache: cached.cache,
      },
      cached.raw,
    );
  }

  const scanLimit = query ? Math.max(limit + offset, 1000) : limit + offset;
  const params: Record<string, string | number | undefined> = {
    limit: Math.min(scanLimit, 1000),
    status: kalshiStatus(input.status ?? "active"),
    series_ticker: input.series_ticker,
    event_ticker: input.event_ticker,
    tickers: input.ticker,
  };

  const url = buildUrl(KALSHI_API_ROOT, "/markets", params);
  const raw = await fetchJson(url, fetcher);
  const markets = ensureArray(asRecord(raw).markets);
  const filtered = query
    ? markets.filter((market) => JSON.stringify(pickKalshiSearchFields(market)).toLowerCase().includes(query))
    : markets;
  const limited = filtered.slice(offset, offset + limit);

  return readOnlyEnvelope(
    "kalshi",
    url.toString(),
    {
      markets: limited.map((market) => normalizeKalshiMarket(market)),
      limit,
      offset,
      has_more: filtered.length > offset + limit || Boolean(asRecord(raw).cursor),
      search_mode: query ? "live_scan_local_filter" : "native_filters",
      cache: query ? { enabled: false, mode: cacheMode, reason: "bypass_or_native_filter" } : undefined,
    },
    raw,
  );
}

async function fetchKalshiMarket(id: NonNullable<ExternalMarketIdentifier["kalshi"]>, fetcher: FetchLike) {
  if (id.event_ticker && !id.ticker) {
    const eventUrl = buildUrl(KALSHI_API_ROOT, `/events/${encodeURIComponent(id.event_ticker)}`, {
      with_nested_markets: true,
    });
    const eventRaw = await fetchJson(eventUrl, fetcher);
    return {
      source: eventUrl.toString(),
      normalized: normalizeKalshiEvent(eventRaw),
      raw: eventRaw,
    };
  }

  const params: Record<string, string | number | undefined> = {
    limit: 100,
    status: "open",
    tickers: id.ticker,
    event_ticker: id.event_ticker,
    series_ticker: id.series_ticker,
  };
  const marketUrl = buildUrl(KALSHI_API_ROOT, "/markets", params);
  const marketRaw = await fetchJson(marketUrl, fetcher);
  const markets = ensureArray(asRecord(marketRaw).markets);
  const normalized = id.ticker
    ? normalizeKalshiMarket(markets.find((market) => asRecord(market).ticker === id.ticker) ?? markets[0] ?? marketRaw)
    : {
        provider: "kalshi" as const,
        provider_market_id: id.series_ticker ?? id.event_ticker,
        title: id.series_ticker ?? id.event_ticker,
        status: "active",
        markets: markets.map((market) => normalizeKalshiMarket(market)),
      };
  return {
    source: marketUrl.toString(),
    normalized,
    raw: marketRaw,
  };
}

async function getKalshiOrderbook(input: GetMarketOrderbookInput, fetcher: FetchLike) {
  const id = kalshiIdentifier(input.identifier);
  if (!id.ticker) {
    throw new Error("Kalshi orderbook reads require identifier.kalshi.ticker.");
  }
  const depth = clamp(input.depth ?? 25, 1, 100);
  const url = buildUrl(KALSHI_API_ROOT, `/markets/${encodeURIComponent(id.ticker)}/orderbook`, { depth });
  const raw = await fetchJson(url, fetcher);
  const orderbook = asRecord(asRecord(raw).orderbook ?? raw);
  const yesBids = kalshiOrderbookLevels(orderbook.yes ?? asRecord(orderbook.orderbook_fp).yes_dollars, depth);
  const noBids = kalshiOrderbookLevels(orderbook.no ?? asRecord(orderbook.orderbook_fp).no_dollars, depth);

  return readOnlyEnvelope(
    "kalshi",
    url.toString(),
    {
      ticker: id.ticker,
      yes_bids: yesBids,
      no_bids: noBids,
      depth,
      note: "Kalshi orderbooks expose active bid levels for YES and NO sides.",
    },
    raw,
  );
}

async function fetchPolymarketMarket(id: PolymarketIdentifier, fetcher: FetchLike) {
  if (id.slug) {
    const eventUrl = buildUrl(POLYMARKET_GAMMA_API_ROOT, "/events", { slug: id.slug });
    const eventRaw = await fetchJson(eventUrl, fetcher);
    const event = ensureArray(eventRaw)[0];
    if (event) {
      return { source: eventUrl.toString(), normalized: normalizePolymarketEvent(event), raw: eventRaw };
    }

    const marketUrl = buildUrl(POLYMARKET_GAMMA_API_ROOT, "/markets", { slug: id.slug });
    const marketRaw = await fetchJson(marketUrl, fetcher);
    return {
      source: marketUrl.toString(),
      normalized: normalizePolymarketMarket(ensureArray(marketRaw)[0] ?? marketRaw),
      raw: marketRaw,
    };
  }

  const params: Record<string, string | number | undefined> = {
    id: id.market_id ?? id.event_id,
    condition_ids: id.condition_id,
  };
  const marketUrl = buildUrl(POLYMARKET_GAMMA_API_ROOT, "/markets", params);
  const marketRaw = await fetchJson(marketUrl, fetcher);
  return {
    source: marketUrl.toString(),
    normalized: normalizePolymarketMarket(ensureArray(marketRaw)[0] ?? marketRaw),
    raw: marketRaw,
  };
}

async function tokenIdsForPolymarketMarket(id: PolymarketIdentifier, fetcher: FetchLike): Promise<string[]> {
  const result = await fetchPolymarketMarket(id, fetcher);
  return tokenIdsFromRaw(result.raw);
}

async function fetchPolymarketPricesForToken(
  tokenId: string,
  side: "BUY" | "SELL" | undefined,
  fetcher: FetchLike,
) {
  if (side) {
    const url = buildUrl(POLYMARKET_CLOB_API_ROOT, "/price", { token_id: tokenId, side });
    const raw = await fetchJson(url, fetcher);
    return {
      source: url.toString(),
      normalized: {
        token_id: tokenId,
        side,
        price: asRecord(raw).price,
      },
      raw,
    };
  }

  const midpointUrl = buildUrl(POLYMARKET_CLOB_API_ROOT, "/midpoint", { token_id: tokenId });
  const spreadUrl = buildUrl(POLYMARKET_CLOB_API_ROOT, "/spread", { token_id: tokenId });
  const lastUrl = buildUrl(POLYMARKET_CLOB_API_ROOT, "/last-trade-price", { token_id: tokenId });
  const [midpoint, spread, last] = await Promise.all([
    fetchJson(midpointUrl, fetcher),
    fetchJson(spreadUrl, fetcher),
    fetchJson(lastUrl, fetcher),
  ]);

  return {
    source: `${midpointUrl.toString()}, ${spreadUrl.toString()}, ${lastUrl.toString()}`,
    normalized: {
      token_id: tokenId,
      midpoint: asRecord(midpoint).mid,
      spread: asRecord(spread).spread,
      last_trade_price: asRecord(last).price,
      last_trade_side: asRecord(last).side,
    },
    raw: { midpoint, spread, last_trade_price: last },
  };
}

async function fetchJson(url: URL, fetcher: FetchLike, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_MARKET_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`External market read failed: ${response.status} ${response.statusText} for ${url.toString()}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function buildUrl(base: string, path: string, params: Record<string, string | number | boolean | undefined>) {
  const baseUrl = new URL(base.endsWith("/") ? base : `${base}/`);
  const basePath = baseUrl.pathname.replace(/\/$/, "");
  const targetPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(baseUrl.origin);
  url.pathname = basePath && basePath !== "/" ? `${basePath}${targetPath}` : targetPath;
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

function addStatusParams(params: Record<string, string | number | boolean | undefined>, status: "active" | "closed" | "all") {
  if (status === "active") {
    params.active = true;
    params.closed = false;
  }
  if (status === "closed") {
    params.closed = true;
  }
}

function unsupportedProvider(provider: ExternalMarketProvider) {
  return {
    provider,
    read_only: true,
    implemented: false,
    normalized: null,
    raw: null,
    source: "none",
    retrieved_at: new Date().toISOString(),
    next_step: provider === "kalshi"
      ? "Kalshi is reserved in the provider envelope but is not implemented yet."
      : "Use provider='polymarket'.",
  };
}

function precogIdentifier(identifier: ExternalMarketIdentifier): NonNullable<ExternalMarketIdentifier["precog"]> {
  const precog = identifier.precog ?? {};
  if (!Object.values(precog).some((value) => value !== undefined && value !== "")) {
    throw new Error("Provide identifier.precog with id, master_market_id, or deployed_market_id.");
  }
  return precog;
}

function kalshiIdentifier(identifier: ExternalMarketIdentifier): NonNullable<ExternalMarketIdentifier["kalshi"]> {
  const kalshi = identifier.kalshi ?? {};
  if (!Object.values(kalshi).some((value) => value !== undefined && value !== "")) {
    throw new Error("Provide identifier.kalshi with ticker, event_ticker, or series_ticker.");
  }
  return kalshi;
}

function polymarketIdentifier(identifier: ExternalMarketIdentifier): PolymarketIdentifier {
  const polymarket = identifier.polymarket ?? {};
  if (!Object.values(polymarket).some((value) => value !== undefined && value !== "")) {
    throw new Error("Provide identifier.polymarket with slug, event_id, market_id, condition_id, or token_id.");
  }
  return polymarket;
}

async function readPrecogMarketConfig() {
  const config = await readFirstJson([
    process.env.FORECASTOS_PRECOG_CONFIG_PATH,
    process.env.FORECASTOS_STATE_DIR ? join(process.env.FORECASTOS_STATE_DIR, "config.local.json") : undefined,
    process.env.FORECASTOS_STATE_DIR ? join(process.env.FORECASTOS_STATE_DIR, "config.json") : undefined,
    join(RESOURCE_ROOT, "precog", "config-defaults.json"),
  ]);
  const precog = asRecord(config.precog);
  const apiRoot = stringValue(precog.api_root);
  const openApiKey = stringValue(precog.open_api_key);
  const deployedMasterAddress = stringValue(precog.deployed_master_address);
  const chainId = Number(precog.chain_id);
  if (!apiRoot || !openApiKey || !deployedMasterAddress || !Number.isInteger(chainId)) {
    throw new Error("Precog market reads require api_root, open_api_key, chain_id, and deployed_master_address in ForecastOS config.");
  }
  return {
    api_root: apiRoot,
    open_api_key: openApiKey,
    chain_id: chainId,
    deployed_master_address: deployedMasterAddress,
  };
}

async function readFirstJson(paths: Array<string | undefined>) {
  for (const path of paths.filter(Boolean) as string[]) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (asRecord(error).code === "ENOENT") continue;
      throw error;
    }
  }
  throw new Error("Missing Precog config for market reads.");
}

function precogHeaders(config: Awaited<ReturnType<typeof readPrecogMarketConfig>>) {
  return {
    "x-api-key": config.open_api_key,
    "Content-Type": "application/json",
  };
}

function precogCollection(raw: unknown): unknown[] {
  const record = asRecord(raw);
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(record.results)) return record.results;
  if (Array.isArray(record.markets)) return record.markets;
  if (Array.isArray(record.upcoming_markets)) return record.upcoming_markets;
  if (Array.isArray(record.data)) return record.data;
  return Object.keys(record).length > 0 && !record.error ? [record] : [];
}

function pickPrecogMarket(
  markets: Record<string, any>[],
  id: NonNullable<ExternalMarketIdentifier["precog"]>,
  config: Awaited<ReturnType<typeof readPrecogMarketConfig>>,
) {
  const idMatches = markets.filter((market) =>
    matchesId(market.id, id.id)
    || matchesId(market.master_market_id, id.master_market_id)
    || matchesId(market.deployed_market_id, id.deployed_market_id)
    || matchesId(market.contract_address, id.deployed_market_id),
  );
  const candidates = idMatches.length > 0 ? idMatches : markets;
  const configured = candidates.filter((market) => isConfiguredPrecogMarket(market, config));
  const scoped = configured.length > 0 ? configured : candidates;
  return scoped.find((market) => normalizePrecogStatus(market.status) === "active") ?? scoped[0];
}

function isConfiguredPrecogMarket(
  market: Record<string, any>,
  config: Awaited<ReturnType<typeof readPrecogMarketConfig>>,
) {
  const masterAddress = stringValue(market.master_address);
  if (!masterAddress) return true;
  return masterAddress.toLowerCase() === config.deployed_master_address.toLowerCase();
}

function matchesId(value: unknown, expected: unknown) {
  return expected !== undefined && expected !== "" && stringValue(value) === stringValue(expected);
}

function normalizePrecogMarket(value: unknown): NormalizedMarket {
  const market = asRecord(value);
  const id = stringValue(market.master_market_id ?? market.deployed_market_id ?? market.id);
  const question = stringValue(market.name ?? market.question ?? market.title ?? market.description) ?? id;
  const outcomes = parsePrecogOutcomes(market.outcomes, market.outcomes_prices ?? market.outcome_prices);
  return {
    provider: "precog",
    provider_market_id: id,
    title: question,
    question,
    subtitle: stringValue(market.category ?? market.precog_market_kind),
    status: normalizePrecogStatus(market.status),
    outcomes,
    volume: market.funding_amount ?? market.funding,
    liquidity: market.liquidity,
    close_time: stringValue(market.end_timestamp ?? market.close_time),
    resolution_time: stringValue(market.resolution_time),
    source_url: id ? `https://core.precog.markets/markets/${id}` : undefined,
  };
}

function normalizedPrecogMarkets(normalized: unknown): NormalizedMarket[] {
  const market = asRecord(normalized) as NormalizedMarket;
  if (Array.isArray(market.markets)) return market.markets;
  return market.provider_market_id ? [market] : [];
}

function pickPrecogSearchFields(value: unknown) {
  const market = asRecord(value);
  return {
    id: market.id,
    master_market_id: market.master_market_id,
    deployed_market_id: market.deployed_market_id,
    name: market.name,
    question: market.question,
    title: market.title,
    description: market.description,
    category: market.category,
    outcomes: market.outcomes,
    status: market.status,
  };
}

const SEARCH_STOPWORDS = new Set([
  "about",
  "after",
  "before",
  "does",
  "from",
  "have",
  "market",
  "markets",
  "more",
  "most",
  "less",
  "likely",
  "there",
  "this",
  "that",
  "what",
  "when",
  "where",
  "which",
  "will",
  "with",
  "would",
]);

function scoreSearchQuery(fields: unknown, query: string): { matched: boolean; value: number } {
  const haystack = normalizeSearchText(JSON.stringify(fields));
  const needle = normalizeSearchText(query);
  if (!needle) return { matched: true, value: 0 };

  const tokens = searchTokens(needle);
  if (tokens.length === 0) return { matched: true, value: 0 };
  const matches = tokens.filter((token) => haystack.includes(token)).length;
  const threshold = tokens.length <= 3 ? tokens.length : Math.max(2, Math.ceil(tokens.length * 0.5));
  const phraseBoost = haystack.includes(needle) ? tokens.length + 2 : 0;
  const value = matches + phraseBoost;
  return { matched: matches >= threshold || phraseBoost > 0, value };
}

function searchTokens(value: string): string[] {
  return [...new Set(value.split(" ").filter((token) =>
    token.length >= 3 && !SEARCH_STOPWORDS.has(token),
  ))];
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function precogStatus(status: "active" | "closed" | "all"): string | undefined {
  if (status === "active") return "OPEN";
  if (status === "closed") return "CLOSED";
  return undefined;
}

function parsePrecogOutcomes(outcomesValue: unknown, pricesValue: unknown) {
  const outcomes = parseMaybeJsonArray(outcomesValue);
  const prices = parseMaybeJsonArray(pricesValue);
  return outcomes.map((outcome, index) => ({
    name: stringValue(outcome),
    price: priceValue(prices[index]),
    price_scale: "0-1",
  }));
}

function priceValue(value: unknown): number | string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "number" ? value : stringValue(value);
}

function normalizePrecogStatus(value: unknown): string {
  const status = String(value ?? "").toLowerCase();
  if (["open", "deployed", "validated", "created", "active"].includes(status)) return "active";
  if (["closed", "settled", "expired", "cancelled", "canceled"].includes(status)) return "closed";
  return stringValue(value) ?? "unknown";
}

function normalizeKalshiEvent(value: unknown): NormalizedMarket {
  const payload = asRecord(value);
  const event = asRecord(payload.event ?? value);
  const markets = ensureArray(payload.markets ?? event.markets).map((market) => normalizeKalshiMarket(market));
  const eventTicker = stringValue(event.event_ticker ?? event.ticker);
  return {
    provider: "kalshi",
    provider_market_id: eventTicker,
    event_ticker: eventTicker,
    series_ticker: stringValue(event.series_ticker),
    title: stringValue(event.title),
    question: stringValue(event.title),
    subtitle: stringValue(event.sub_title ?? event.subtitle),
    status: normalizeKalshiStatus(event.status),
    outcomes: markets.flatMap((market) => market.outcomes ?? []),
    volume: event.volume,
    volume_24h: event.volume_24h,
    liquidity: event.liquidity,
    close_time: stringValue(event.close_time),
    source_url: eventTicker ? `https://kalshi.com/markets/${eventTicker}` : undefined,
    markets,
  };
}

function normalizeKalshiMarket(value: unknown): NormalizedMarket {
  const market = asRecord(value);
  const ticker = stringValue(market.ticker);
  const eventTicker = stringValue(market.event_ticker);
  const title = stringValue(market.title) ?? stringValue(market.subtitle) ?? ticker;
  return {
    provider: "kalshi",
    provider_market_id: ticker,
    event_ticker: eventTicker,
    series_ticker: stringValue(market.series_ticker),
    title,
    question: title,
    subtitle: stringValue(market.subtitle ?? market.sub_title),
    status: normalizeKalshiStatus(market.status),
    outcomes: [
      {
        name: stringValue(market.yes_sub_title) ?? "Yes",
        price: centsToProbability(market.last_price ?? market.last_price_dollars),
        bid: centsToProbability(market.yes_bid ?? market.yes_bid_dollars),
        ask: centsToProbability(market.yes_ask ?? market.yes_ask_dollars),
        last_price: centsToProbability(market.last_price ?? market.last_price_dollars),
        price_scale: "0-1",
      },
      {
        name: stringValue(market.no_sub_title) ?? "No",
        bid: centsToProbability(market.no_bid ?? market.no_bid_dollars),
        ask: centsToProbability(market.no_ask ?? market.no_ask_dollars),
        last_price: inverseProbability(market.last_price ?? market.last_price_dollars),
        price_scale: "0-1",
      },
    ],
    volume: market.volume,
    volume_24h: market.volume_24h,
    liquidity: market.liquidity,
    open_interest: market.open_interest,
    close_time: stringValue(market.close_time),
    resolution_time: stringValue(market.expiration_time ?? market.settlement_timer_seconds),
    source_url: eventTicker ? `https://kalshi.com/markets/${eventTicker}` : undefined,
  };
}

function normalizedKalshiMarkets(normalized: unknown): NormalizedMarket[] {
  const market = asRecord(normalized) as NormalizedMarket;
  if (Array.isArray(market.markets)) return market.markets;
  return market.provider_market_id ? [market] : [];
}

function pickKalshiSearchFields(value: unknown) {
  const market = asRecord(value);
  return {
    ticker: market.ticker,
    event_ticker: market.event_ticker,
    series_ticker: market.series_ticker,
    title: market.title,
    subtitle: market.subtitle ?? market.sub_title,
    yes_sub_title: market.yes_sub_title,
    no_sub_title: market.no_sub_title,
    rules_primary: market.rules_primary,
    rules_secondary: market.rules_secondary,
  };
}

function kalshiStatus(status: "active" | "closed" | "all"): string | undefined {
  if (status === "active") return "open";
  if (status === "closed") return "closed";
  return undefined;
}

function normalizeKalshiStatus(value: unknown): string {
  const status = String(value ?? "").toLowerCase();
  if (status === "open" || status === "active") return "active";
  if (status === "closed" || status === "settled" || status === "expired") return "closed";
  return stringValue(value) ?? "unknown";
}

function centsToProbability(value: unknown): number | string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return stringValue(value);
  return numeric > 1 ? numeric / 100 : numeric;
}

function inverseProbability(value: unknown): number | string | undefined {
  const probability = centsToProbability(value);
  if (typeof probability !== "number") return probability;
  return Number((1 - probability).toFixed(4));
}

function kalshiOrderbookLevels(value: unknown, depth: number) {
  return ensureArray(value).slice(0, depth).map((level) => {
    if (Array.isArray(level)) {
      return {
        price: centsToProbability(level[0]),
        size: level[1],
      };
    }
    const entry = asRecord(level);
    return {
      price: centsToProbability(entry.price ?? entry[0]),
      size: entry.size ?? entry.quantity ?? entry[1],
    };
  });
}

function normalizePolymarketEvent(value: unknown): NormalizedMarket {
  const event = asRecord(value);
  const markets = ensureArray(event.markets).map((market) => normalizePolymarketMarket(market));
  return {
    provider_market_id: stringValue(event.id),
    slug: stringValue(event.slug),
    title: stringValue(event.title) ?? stringValue(event.question),
    question: stringValue(event.question) ?? stringValue(event.title),
    status: statusFrom(event),
    outcomes: markets.flatMap((market) => market.outcomes ?? []),
    volume: event.volume ?? event.volumeNum ?? event.volume_24hr,
    liquidity: event.liquidity ?? event.liquidityNum,
    close_time: stringValue(event.endDate) ?? stringValue(event.end_date),
    resolution_time: stringValue(event.resolutionDate) ?? stringValue(event.closedTime),
    source_url: event.slug ? `https://polymarket.com/event/${event.slug}` : undefined,
    markets,
  };
}

function normalizePolymarketMarket(value: unknown): NormalizedMarket {
  const market = asRecord(value);
  return {
    provider_market_id: stringValue(market.id),
    condition_id: stringValue(market.conditionId) ?? stringValue(market.conditionID) ?? stringValue(market.condition_id),
    slug: stringValue(market.slug),
    title: stringValue(market.title) ?? stringValue(market.question),
    question: stringValue(market.question) ?? stringValue(market.title),
    status: statusFrom(market),
    outcomes: normalizeOutcomes(market),
    volume: market.volume ?? market.volumeNum ?? market.volume_24hr,
    liquidity: market.liquidity ?? market.liquidityNum,
    close_time: stringValue(market.endDate) ?? stringValue(market.end_date),
    resolution_time: stringValue(market.resolutionDate) ?? stringValue(market.closedTime),
    source_url: market.slug ? `https://polymarket.com/market/${market.slug}` : undefined,
  };
}

function normalizeOutcomes(market: Record<string, any>) {
  const tokens = ensureArray(market.tokens);
  if (tokens.length > 0) {
    return tokens.map((token) => {
      const entry = asRecord(token);
      return {
        name: stringValue(entry.outcome) ?? stringValue(entry.name),
        token_id: stringValue(entry.token_id) ?? stringValue(entry.tokenID) ?? stringValue(entry.asset_id),
        price: entry.price,
      };
    });
  }

  const outcomes = parseMaybeJsonArray(market.outcomes);
  const tokenIds = parseMaybeJsonArray(market.clobTokenIds ?? market.clob_token_ids);
  const prices = parseMaybeJsonArray(market.outcomePrices ?? market.outcome_prices);
  return outcomes.map((outcome, index) => ({
    name: stringValue(outcome),
    token_id: stringValue(tokenIds[index]),
    price: prices[index],
  }));
}

function tokenIdsFromRaw(raw: unknown): string[] {
  const values = ensureArray(raw).length > 0 ? ensureArray(raw) : [raw];
  const ids = values.flatMap((value) => {
    const event = asRecord(value);
    const markets = ensureArray(event.markets);
    const candidates = markets.length > 0 ? markets : [event];
    return candidates.flatMap((market) =>
      normalizeOutcomes(asRecord(market)).map((outcome) => outcome.token_id).filter(Boolean),
    );
  });
  return [...new Set(ids)] as string[];
}

function pickSearchFields(value: unknown) {
  const event = asRecord(value);
  return {
    title: event.title,
    question: event.question,
    slug: event.slug,
    markets: ensureArray(event.markets).map((market) => {
      const entry = asRecord(market);
      return { title: entry.title, question: entry.question, slug: entry.slug };
    }),
  };
}

function statusFrom(value: Record<string, any>): string {
  if (value.closed === true) return "closed";
  if (value.active === true) return "active";
  return stringValue(value.status) ?? "unknown";
}

function parseMaybeJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
}

function ensureArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (Array.isArray(record.events)) return record.events;
  if (Array.isArray(record.markets)) return record.markets;
  if (Array.isArray(record.data)) return record.data;
  return value === undefined || value === null ? [] : [value];
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function stringValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function providerLabel(provider: ExternalMarketProvider | "all"): string {
  if (provider === "precog") return "Precog";
  if (provider === "kalshi") return "Kalshi";
  if (provider === "all") return "ForecastOS provider sweep";
  return "Polymarket";
}
