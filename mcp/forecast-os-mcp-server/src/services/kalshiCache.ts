import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  EXTERNAL_MARKET_REQUEST_TIMEOUT_MS,
  KALSHI_API_ROOT,
} from "../constants.js";

export type KalshiCacheMode = "auto" | "refresh" | "bypass";
export type KalshiFetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface KalshiCacheMetadata {
  enabled: true;
  mode: Exclude<KalshiCacheMode, "bypass">;
  hit: boolean;
  path: string;
  built_at: string;
  expires_at: string;
  ttl_ms: number;
  market_count: number;
}

export interface KalshiCacheSearchResult {
  markets: Record<string, any>[];
  total_matches: number;
  cache: KalshiCacheMetadata;
  source: string;
  raw: {
    cache: KalshiCacheMetadata;
    markets: Record<string, any>[];
  };
}

interface KalshiCacheFile {
  version: 1;
  api_root: string;
  built_at: string;
  series_count: number;
  market_count: number;
  markets: Record<string, any>[];
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_FILE_NAME = "kalshi_open_markets.json";

export function kalshiCacheTtlMs() {
  const ttlMs = Number(process.env.FORECASTOS_KALSHI_CACHE_TTL_MS ?? CACHE_TTL_MS);
  return Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : CACHE_TTL_MS;
}

export function kalshiCacheDir() {
  return resolve(
    process.env.FORECASTOS_KALSHI_CACHE_DIR
      ?? join(homedir(), ".cache", "forecast-os", "kalshi"),
  );
}

export async function searchKalshiMarketCache(input: {
  query: string;
  limit: number;
  offset: number;
  mode: Exclude<KalshiCacheMode, "bypass">;
  fetcher: KalshiFetchLike;
  apiRoot?: string;
}): Promise<KalshiCacheSearchResult> {
  const apiRoot = input.apiRoot ?? KALSHI_API_ROOT;
  const cachePath = join(kalshiCacheDir(), CACHE_FILE_NAME);
  const ttlMs = kalshiCacheTtlMs();
  const existing = input.mode === "refresh" ? undefined : await readValidCache(cachePath, ttlMs, apiRoot);
  const hit = Boolean(existing);
  const cache = existing ?? await buildKalshiMarketCache({ cachePath, fetcher: input.fetcher, apiRoot });
  const builtAtMs = Date.parse(cache.built_at);
  const metadata: KalshiCacheMetadata = {
    enabled: true,
    mode: input.mode,
    hit,
    path: cachePath,
    built_at: cache.built_at,
    expires_at: new Date(builtAtMs + ttlMs).toISOString(),
    ttl_ms: ttlMs,
    market_count: cache.market_count,
  };
  const matches = cache.markets
    .filter((market) => kalshiCacheMarketMatches(market, input.query))
    .sort(compareKalshiMarketActivity);
  const markets = matches.slice(input.offset, input.offset + input.limit);

  return {
    markets,
    total_matches: matches.length,
    cache: metadata,
    source: `${apiRoot}/series + ${apiRoot}/markets (persistent cache)`,
    raw: {
      cache: metadata,
      markets,
    },
  };
}

async function readValidCache(path: string, ttlMs: number, apiRoot: string): Promise<KalshiCacheFile | undefined> {
  try {
    const [cacheStat, raw] = await Promise.all([stat(path), readFile(path, "utf8")]);
    if (Date.now() - cacheStat.mtimeMs > ttlMs) return undefined;
    const parsed = JSON.parse(raw) as KalshiCacheFile;
    if (parsed.version !== 1 || parsed.api_root !== apiRoot || !Array.isArray(parsed.markets)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

async function buildKalshiMarketCache(input: {
  cachePath: string;
  fetcher: KalshiFetchLike;
  apiRoot: string;
}): Promise<KalshiCacheFile> {
  const series = await fetchKalshiCollection(input.apiRoot, "/series", "series", {}, input.fetcher);
  const markets: Record<string, any>[] = [];
  for (const seriesEntry of series) {
    const seriesRecord = asRecord(seriesEntry);
    const seriesTicker = stringValue(seriesRecord.ticker);
    if (!seriesTicker) continue;
    const seriesMarkets = await fetchKalshiCollection(
      input.apiRoot,
      "/markets",
      "markets",
      {
        status: "open",
        series_ticker: seriesTicker,
      },
      input.fetcher,
    );
    for (const market of seriesMarkets) {
      markets.push({
        ...asRecord(market),
        series_ticker: stringValue(asRecord(market).series_ticker) ?? seriesTicker,
        series_title: stringValue(seriesRecord.title),
        series_category: stringValue(seriesRecord.category),
      });
    }
  }

  const cache: KalshiCacheFile = {
    version: 1,
    api_root: input.apiRoot,
    built_at: new Date().toISOString(),
    series_count: series.length,
    market_count: markets.length,
    markets,
  };
  await writeCacheFile(input.cachePath, cache);
  return cache;
}

async function writeCacheFile(path: string, cache: KalshiCacheFile) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

async function fetchKalshiCollection(
  apiRoot: string,
  path: string,
  collectionKey: string,
  params: Record<string, string | number | undefined>,
  fetcher: KalshiFetchLike,
) {
  const items: unknown[] = [];
  let cursor: string | undefined;
  do {
    const url = buildUrl(apiRoot, path, {
      limit: 1000,
      ...params,
      cursor,
    });
    const raw = asRecord(await fetchKalshiJson(url, fetcher));
    items.push(...ensureArray(raw[collectionKey]));
    cursor = stringValue(raw.cursor);
  } while (cursor);
  return items;
}

async function fetchKalshiJson(url: URL, fetcher: KalshiFetchLike): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_MARKET_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Kalshi cache read failed: ${response.status} ${response.statusText} for ${url.toString()}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function kalshiCacheMarketMatches(market: Record<string, any>, query: string) {
  const queryLower = query.toLowerCase();
  return JSON.stringify({
    ticker: market.ticker,
    event_ticker: market.event_ticker,
    series_ticker: market.series_ticker,
    series_title: market.series_title,
    series_category: market.series_category,
    title: market.title,
    subtitle: market.subtitle ?? market.sub_title,
    yes_sub_title: market.yes_sub_title,
    no_sub_title: market.no_sub_title,
    rules_primary: market.rules_primary,
    rules_secondary: market.rules_secondary,
  }).toLowerCase().includes(queryLower);
}

function compareKalshiMarketActivity(left: Record<string, any>, right: Record<string, any>) {
  return numericValue(right.volume_24h) - numericValue(left.volume_24h)
    || numericValue(right.volume) - numericValue(left.volume)
    || numericValue(right.open_interest) - numericValue(left.open_interest);
}

function numericValue(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
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

function ensureArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function stringValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}
