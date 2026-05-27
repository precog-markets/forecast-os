import {
  EXTERNAL_MARKET_REQUEST_TIMEOUT_MS,
  POLYMARKET_CLOB_API_ROOT,
  POLYMARKET_GAMMA_API_ROOT,
} from "../constants.js";
import type { ResponseFormat } from "../types.js";

export type ExternalMarketProvider = "polymarket" | "kalshi";
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface PolymarketIdentifier {
  slug?: string;
  event_id?: string | number;
  market_id?: string | number;
  condition_id?: string;
  token_id?: string;
}

export interface ExternalMarketIdentifier {
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

export interface SearchMarketsInput extends ExternalMarketEnvelope {
  query?: string;
  slug?: string;
  tag_id?: string | number;
  status?: "active" | "closed" | "all";
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
  provider_market_id?: string;
  condition_id?: string;
  slug?: string;
  title?: string;
  question?: string;
  status?: string;
  outcomes?: Array<{
    name?: string;
    token_id?: string;
    price?: number | string;
  }>;
  volume?: number | string;
  liquidity?: number | string;
  close_time?: string;
  resolution_time?: string;
  source_url?: string;
  markets?: NormalizedMarket[];
}

function providerOf(input: ExternalMarketEnvelope): ExternalMarketProvider {
  return input.provider ?? "polymarket";
}

function readOnlyEnvelope(provider: ExternalMarketProvider, source: string, normalized: unknown, raw: unknown) {
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
) {
  const provider = providerOf(input);
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
  if (value.provider !== "polymarket") {
    return `Provider ${value.provider} is not implemented yet.\n\n${value.next_step ?? ""}`.trim();
  }
  const normalized = value.normalized ?? {};
  if (Array.isArray(normalized.markets)) {
    const lines = normalized.markets.map((market: NormalizedMarket) =>
      `- ${market.title ?? market.question ?? market.slug ?? market.provider_market_id ?? "Untitled"}${market.source_url ? ` (${market.source_url})` : ""}`,
    );
    return [`Polymarket markets (${normalized.markets.length})`, ...lines, "", `Source: ${value.source}`].join("\n");
  }
  if (Array.isArray(normalized.prices)) {
    const lines = normalized.prices.map((price: any) =>
      `- ${price.token_id}: midpoint ${price.midpoint ?? "n/a"}, spread ${price.spread ?? "n/a"}, last ${price.last_trade_price ?? "n/a"}`,
    );
    return [`Polymarket prices (${normalized.prices.length})`, ...lines, "", `Source: ${value.source}`].join("\n");
  }
  if (normalized.bids || normalized.asks) {
    return [
      `Polymarket orderbook for ${normalized.token_id}`,
      `Bids: ${normalized.bids?.length ?? 0}`,
      `Asks: ${normalized.asks?.length ?? 0}`,
      `Source: ${value.source}`,
    ].join("\n");
  }
  const title = normalized.title ?? normalized.question ?? normalized.slug ?? normalized.provider_market_id ?? "Polymarket market";
  return [
    `${title}`,
    normalized.source_url ? `URL: ${normalized.source_url}` : undefined,
    `Source: ${value.source}`,
  ].filter(Boolean).join("\n");
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

async function fetchJson(url: URL, fetcher: FetchLike): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_MARKET_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`External market read failed: ${response.status} ${response.statusText} for ${url.toString()}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function buildUrl(base: string, path: string, params: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
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

function polymarketIdentifier(identifier: ExternalMarketIdentifier): PolymarketIdentifier {
  const polymarket = identifier.polymarket ?? {};
  if (!Object.values(polymarket).some((value) => value !== undefined && value !== "")) {
    throw new Error("Provide identifier.polymarket with slug, event_id, market_id, condition_id, or token_id.");
  }
  return polymarket;
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
