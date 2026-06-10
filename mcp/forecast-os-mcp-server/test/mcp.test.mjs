import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const resourceRoot = process.env.FORECASTOS_RESOURCE_DIR ?? join(projectRoot, "resources");
process.env.FORECASTOS_RESOURCE_DIR = resourceRoot;

const { listForecastOSResources, precogConfigDefaults } = await import("../dist/services/skillRepository.js");
const { checkReadiness } = await import("../dist/services/readiness.js");
const { READ_ONLY_TOOL_NAMES } = await import("../dist/tools/registerTools.js");
const { truncate } = await import("../dist/services/format.js");
const { formatMarketShapeValidation, validateMarketShape } = await import("../dist/tools/marketShape.js");
const { explainNextStep, formatNextStepExplanation } = await import("../dist/tools/nextStep.js");
const {
  getExternalMarket,
  getExternalMarketOrderbook,
  getExternalMarketPrices,
  searchExternalMarkets,
} = await import("../dist/tools/externalMarkets.js");
const { createPolymarketFixtureFetch } = await import("./fixtures/polymarket.mjs");
const { createKalshiFixtureFetch } = await import("./fixtures/kalshi.mjs");
const { createPrecogFixtureFetch } = await import("./fixtures/precog.mjs");

test("resources include remote-ready ForecastOS context", async () => {
  const uris = listForecastOSResources().map((resource) => resource.uri);

  assert.ok(uris.includes("forecastos://docs/remote-mcp"));
  assert.ok(uris.includes("forecastos://docs/install"));
  assert.ok(uris.includes("forecastos://docs/wallet-adapters"));
  assert.ok(uris.includes("forecastos://docs/external-markets"));
  assert.ok(uris.includes("forecastos://docs/precog-liquidity"));
  assert.ok(uris.includes("forecastos://docs/providers/polymarket-read"));
  assert.ok(uris.includes("forecastos://docs/providers/kalshi-read"));
  assert.ok(uris.includes("forecastos://templates/multi-outcome-market"));
  assert.ok(uris.includes("forecastos://schemas/actions"));
  assert.ok(uris.includes("forecastos://examples/full-workflow"));
  assert.ok(uris.includes("forecastos://precog/capabilities"));
  assert.ok(uris.includes("forecastos://precog/config-defaults"));
  assert.ok(uris.includes("forecastos://providers/precog/capabilities"));
  assert.ok(uris.includes("forecastos://providers/polymarket/capabilities"));
  assert.ok(uris.includes("forecastos://providers/kalshi/capabilities"));
});

test("config defaults include public open_api_key", async () => {
  const defaults = await precogConfigDefaults();

  assert.equal(defaults.open_api_key, "7b655655-9263-4f7b-a96d-bbfdd7711042");
  assert.equal(defaults.chain_id, 8453);
});

test("readiness verifies bundled skill resources", async () => {
  const readiness = await checkReadiness();

  assert.equal(readiness.ok, true);
  assert.equal(readiness.mode, "public_read_only");
  assert.equal(readiness.resource_root, resourceRoot);
  assert.ok(readiness.resources_checked.includes("forecastos://docs/skill"));
  assert.ok(readiness.resources_checked.includes("forecastos://docs/install"));
  assert.ok(readiness.resources_checked.includes("forecastos://precog/config-defaults"));
});

test("tool names stay read-only", async () => {
  for (const name of READ_ONLY_TOOL_NAMES) {
    assert.ok(!/(create|fund_market|draft_market|run_skill_step|wallet|sign|swap|approve|bridge)/.test(name));
  }
  assert.ok(!READ_ONLY_TOOL_NAMES.includes("forecastos_list_workflows"));
  assert.ok(!READ_ONLY_TOOL_NAMES.includes("forecastos_list_drafts"));
  assert.ok(READ_ONLY_TOOL_NAMES.includes("forecastos_search_markets"));
  assert.ok(READ_ONLY_TOOL_NAMES.includes("forecastos_get_market"));
  assert.ok(READ_ONLY_TOOL_NAMES.includes("forecastos_get_market_prices"));
  assert.ok(READ_ONLY_TOOL_NAMES.includes("forecastos_get_market_orderbook"));
});

test("Polymarket provider searches and normalizes fixture-backed public markets", async () => {
  const fetcher = createPolymarketFixtureFetch();
  const result = await searchExternalMarkets(
    {
      provider: "polymarket",
      query: "Who is more liekly to win Brazil Presidential election first round",
      limit: 1,
      offset: 0,
    },
    fetcher,
  );

  assert.equal(result.provider, "polymarket");
  assert.equal(result.read_only, true);
  assert.equal(result.normalized.markets.length, 1);
  assert.equal(result.normalized.markets[0].slug, "brazil-presidential-election");
  assert.equal(result.normalized.markets[0].outcomes, undefined);
  assert.equal(result.normalized.markets[0].market_count, 2);
  assert.equal(result.normalized.markets[0].markets.length, 2);
  assert.equal(result.normalized.markets[0].markets[0].outcomes[0].price, "0.43");
  assert.equal(result.normalized.search_mode, "public_search");
  assert.equal(result.raw.event_count, 2);
  assert.equal(result.raw.events.length, 1);
  assert.equal(result.raw.events[0].slug, "brazil-presidential-election");
  assert.equal(result.raw.events[0].market_count, 2);
  assert.equal(result.raw.events[0].markets[0].question, "Will Lula win the 2026 Brazilian presidential election?");
  assert.equal(result.raw.profiles, undefined);
  assert.equal(result.raw.tags, undefined);
  assert.ok(result.source.includes("gamma-api.polymarket.com/public-search"));
  assert.ok(result.source.includes("events_status=active"));
  assert.ok(result.source.includes("search_profiles=false"));
});

test("Polymarket provider reads market, prices, and orderbook from fixtures", async () => {
  const fetcher = createPolymarketFixtureFetch();

  const market = await getExternalMarket(
    {
      provider: "polymarket",
      identifier: { polymarket: { slug: "fed-decision-in-october" } },
    },
    fetcher,
  );
  assert.equal(market.normalized.condition_id, undefined);
  assert.equal(market.normalized.markets[0].condition_id, "0xcondition");

  const prices = await getExternalMarketPrices(
    {
      provider: "polymarket",
      identifier: { polymarket: { token_id: "token-hold" } },
    },
    fetcher,
  );
  assert.equal(prices.read_only, true);
  assert.equal(prices.normalized.prices[0].token_id, "token-hold");
  assert.equal(prices.normalized.prices[0].midpoint, "0.60");

  const book = await getExternalMarketOrderbook(
    {
      provider: "polymarket",
      identifier: { polymarket: { token_id: "token-hold" } },
      depth: 1,
    },
    fetcher,
  );
  assert.equal(book.normalized.bids.length, 1);
  assert.equal(book.normalized.asks.length, 1);
  assert.equal(book.normalized.tick_size, "0.01");
});

test("default market search checks Precog first, then Kalshi, then Polymarket", async (t) => {
  const previousCacheDir = process.env.FORECASTOS_KALSHI_CACHE_DIR;
  const cacheDir = await mkdtemp(join(tmpdir(), "forecastos-kalshi-cache-"));
  process.env.FORECASTOS_KALSHI_CACHE_DIR = cacheDir;
  t.after(async () => {
    if (previousCacheDir === undefined) delete process.env.FORECASTOS_KALSHI_CACHE_DIR;
    else process.env.FORECASTOS_KALSHI_CACHE_DIR = previousCacheDir;
    await rm(cacheDir, { recursive: true, force: true });
  });

  const precog = createPrecogFixtureFetch();
  const kalshi = createKalshiFixtureFetch();
  const polymarket = createPolymarketFixtureFetch();
  const calls = [];
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.hostname);
    if (url.hostname === "service.precog.markets") return precog(input, init);
    if (url.hostname === "external-api.kalshi.com") return kalshi(input, init);
    return polymarket(input, init);
  };

  const result = await searchExternalMarkets(
    {
      query: "Brazil",
      limit: 1,
      status: "active",
    },
    fetcher,
  );

  assert.equal(result.provider, "all");
  assert.equal(result.read_only, true);
  assert.deepEqual(result.normalized.provider_order, ["precog", "kalshi", "polymarket"]);
  assert.equal(result.normalized.providers[0].provider, "precog");
  assert.equal(result.normalized.providers[1].provider, "kalshi");
  assert.equal(result.normalized.providers[2].provider, "polymarket");
  assert.equal(calls[0], "service.precog.markets");
  assert.ok(calls.some((hostname) => hostname === "service.precog.markets"));
  assert.ok(calls.includes("external-api.kalshi.com"));
  assert.ok(calls.includes("gamma-api.polymarket.com"));
  assert.equal(result.normalized.markets[0].provider, "precog");
  assert.ok(polymarket.calls?.[0]?.includes("/public-search"));
  assert.ok(precog.calls[0].includes("/api/v1/markets/"));
  assert.ok(precog.calls[0].includes("status=OPEN"));
  assert.ok(precog.calls[0].includes("limit=1000"));
  assert.ok(!precog.calls[0].includes("upcoming-markets"));
});

test("Precog provider searches markets and returns outcome prices", async () => {
  const fetcher = createPrecogFixtureFetch();
  const result = await searchExternalMarkets(
    {
      provider: "precog",
      query: "Who is more liekly to win Brazil's Presidential election first round?",
      limit: 1,
      status: "active",
    },
    fetcher,
  );

  assert.equal(result.provider, "precog");
  assert.equal(result.read_only, true);
  assert.equal(result.normalized.markets.length, 1);
  assert.equal(result.normalized.markets[0].provider_market_id, "503");
  assert.equal(result.normalized.markets[0].title, "Who wins Brazil's Presidential election first round?");
  assert.equal(result.normalized.markets[0].outcomes[0].price, "0.62");
  assert.equal(result.raw.market_count, 2);
  assert.equal(result.raw.matched_count, 2);
  assert.equal(result.raw.markets.length, 1);
  assert.equal(result.raw.markets[0].name, "Who wins Brazil's Presidential election first round?");
  assert.ok(result.source.includes("service.precog.markets/api/v1/markets"));
  assert.ok(result.source.includes("status=OPEN"));
  assert.ok(result.source.includes("limit=1000"));
  assert.equal(result.normalized.scan_limit, 1000);
  assert.ok(!result.source.includes("upcoming-markets"));

  const market = await getExternalMarket(
    {
      provider: "precog",
      identifier: { precog: { master_market_id: 503 } },
    },
    fetcher,
  );
  assert.equal(market.normalized.provider_market_id, "503");
  assert.equal(market.normalized.title, "Who wins Brazil's Presidential election first round?");
  assert.equal(market.normalized.status, "active");

  const prices = await getExternalMarketPrices(
    {
      provider: "precog",
      identifier: { precog: { master_market_id: 503 } },
    },
    fetcher,
  );
  assert.equal(prices.normalized.prices[0].outcomes[0].name, "Lula");
  assert.equal(prices.normalized.prices[0].outcomes[0].price, "0.62");
});

test("Precog provider reads current state config before resource defaults", async (t) => {
  const previousStateDir = process.env.FORECASTOS_STATE_DIR;
  const stateDir = await mkdtemp(join(tmpdir(), "forecastos-state-"));
  process.env.FORECASTOS_STATE_DIR = stateDir;
  t.after(async () => {
    if (previousStateDir === undefined) delete process.env.FORECASTOS_STATE_DIR;
    else process.env.FORECASTOS_STATE_DIR = previousStateDir;
    await rm(stateDir, { recursive: true, force: true });
  });

  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: "https://service.precog.markets/",
        open_api_key: "new-test-open-api-key",
        chain_id: 8453,
        deployed_master_address: "0x00000000000c109080dfa976923384b97165a57a",
      },
    }),
  );

  const fetcher = async (input, init) => {
    assert.equal(init.headers["x-api-key"], "new-test-open-api-key");
    return new Response(JSON.stringify([{
      master_market_id: 700,
      question: "Brazil first round winner",
      outcomes: "Lula,Other",
      outcomes_prices: "0.7,0.3",
      status: "OPEN",
    }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await searchExternalMarkets(
    {
      provider: "precog",
      query: "Brazil",
      limit: 5,
    },
    fetcher,
  );

  assert.equal(result.normalized.markets[0].provider_market_id, "700");
});

test("Kalshi provider searches and normalizes fixture-backed public markets", async () => {
  const fetcher = createKalshiFixtureFetch();
  const result = await searchExternalMarkets(
    {
      provider: "kalshi",
      query: "bitcoin",
      limit: 5,
      status: "active",
      cache_mode: "bypass",
    },
    fetcher,
  );

  assert.equal(result.provider, "kalshi");
  assert.equal(result.read_only, true);
  assert.equal(result.normalized.markets.length, 1);
  assert.equal(result.normalized.markets[0].provider_market_id, "KXBTC-26JUN-T100000");
  assert.equal(result.normalized.markets[0].outcomes[0].bid, 0.56);
  assert.equal(result.normalized.search_mode, "live_scan_local_filter");
  assert.equal(result.normalized.cache.enabled, false);
  assert.ok(result.source.includes("external-api.kalshi.com/trade-api/v2/markets"));
});

test("Kalshi keyword search builds and reuses a persistent cache", async (t) => {
  const previousCacheDir = process.env.FORECASTOS_KALSHI_CACHE_DIR;
  const cacheDir = await mkdtemp(join(tmpdir(), "forecastos-kalshi-cache-"));
  process.env.FORECASTOS_KALSHI_CACHE_DIR = cacheDir;
  t.after(async () => {
    if (previousCacheDir === undefined) delete process.env.FORECASTOS_KALSHI_CACHE_DIR;
    else process.env.FORECASTOS_KALSHI_CACHE_DIR = previousCacheDir;
    await rm(cacheDir, { recursive: true, force: true });
  });

  const fetcher = createKalshiFixtureFetch();
  const first = await searchExternalMarkets(
    {
      provider: "kalshi",
      query: "crypto",
      limit: 5,
      status: "active",
    },
    fetcher,
  );

  assert.equal(first.provider, "kalshi");
  assert.equal(first.read_only, true);
  assert.equal(first.normalized.search_mode, "persistent_cache");
  assert.equal(first.normalized.cache.hit, false);
  assert.equal(first.normalized.cache.market_count, 1);
  assert.equal(first.normalized.markets.length, 1);
  assert.ok(fetcher.calls.some((url) => url.includes("/series")));
  assert.ok(fetcher.calls.some((url) => url.includes("/markets")));

  const failingFetch = async (input) => {
    throw new Error(`unexpected network call for cached search: ${input}`);
  };
  const second = await searchExternalMarkets(
    {
      provider: "kalshi",
      query: "bitcoin",
      limit: 5,
      status: "active",
    },
    failingFetch,
  );

  assert.equal(second.normalized.search_mode, "persistent_cache");
  assert.equal(second.normalized.cache.hit, true);
  assert.equal(second.normalized.markets[0].provider_market_id, "KXBTC-26JUN-T100000");
});

test("Kalshi cache refresh rebuilds the persistent cache", async (t) => {
  const previousCacheDir = process.env.FORECASTOS_KALSHI_CACHE_DIR;
  const cacheDir = await mkdtemp(join(tmpdir(), "forecastos-kalshi-cache-"));
  process.env.FORECASTOS_KALSHI_CACHE_DIR = cacheDir;
  t.after(async () => {
    if (previousCacheDir === undefined) delete process.env.FORECASTOS_KALSHI_CACHE_DIR;
    else process.env.FORECASTOS_KALSHI_CACHE_DIR = previousCacheDir;
    await rm(cacheDir, { recursive: true, force: true });
  });

  const firstFetcher = createKalshiFixtureFetch();
  await searchExternalMarkets(
    {
      provider: "kalshi",
      query: "bitcoin",
      limit: 5,
      status: "active",
    },
    firstFetcher,
  );

  const refreshFetcher = createKalshiFixtureFetch();
  const refreshed = await searchExternalMarkets(
    {
      provider: "kalshi",
      query: "bitcoin",
      limit: 5,
      status: "active",
      cache_mode: "refresh",
    },
    refreshFetcher,
  );

  assert.equal(refreshed.normalized.search_mode, "persistent_cache");
  assert.equal(refreshed.normalized.cache.hit, false);
  assert.ok(refreshFetcher.calls.some((url) => url.includes("/series")));
  assert.ok(refreshFetcher.calls.some((url) => url.includes("/markets")));
});

test("Kalshi provider reads event, prices, and orderbook from fixtures", async () => {
  const fetcher = createKalshiFixtureFetch();

  const event = await getExternalMarket(
    {
      provider: "kalshi",
      identifier: { kalshi: { event_ticker: "KXBTC-26JUN" } },
    },
    fetcher,
  );
  assert.equal(event.normalized.event_ticker, "KXBTC-26JUN");
  assert.equal(event.normalized.markets[0].provider_market_id, "KXBTC-26JUN-T100000");

  const prices = await getExternalMarketPrices(
    {
      provider: "kalshi",
      identifier: { kalshi: { ticker: "KXBTC-26JUN-T100000" } },
    },
    fetcher,
  );
  assert.equal(prices.read_only, true);
  assert.equal(prices.normalized.prices[0].ticker, "KXBTC-26JUN-T100000");
  assert.equal(prices.normalized.prices[0].outcomes[0].last_price, 0.57);

  const book = await getExternalMarketOrderbook(
    {
      provider: "kalshi",
      identifier: { kalshi: { ticker: "KXBTC-26JUN-T100000" } },
      depth: 1,
    },
    fetcher,
  );
  assert.equal(book.normalized.yes_bids.length, 1);
  assert.equal(book.normalized.no_bids.length, 1);
  assert.equal(book.normalized.yes_bids[0].price, 0.56);
});

test("optional live Polymarket smoke test", { skip: process.env.FORECASTOS_LIVE_POLYMARKET_TEST !== "1" }, async () => {
  const search = await searchExternalMarkets({
    provider: "polymarket",
    query: "Fed",
    limit: 1,
  });
  assert.equal(search.provider, "polymarket");
  assert.equal(search.read_only, true);
  assert.ok(search.normalized.markets.length >= 1);

  const tokenId = search.normalized.markets[0].outcomes?.find((outcome) => outcome.token_id)?.token_id;
  if (tokenId) {
    const book = await getExternalMarketOrderbook({
      provider: "polymarket",
      identifier: { polymarket: { token_id: tokenId } },
      depth: 1,
    });
    assert.equal(book.read_only, true);
  }
});

test("market shape validation rejects raw Yes/No and missing fields", () => {
  const validation = validateMarketShape({
    market_type: "multi_outcome",
    question: "Will BLG reach the Worlds final?",
    outcomes: ["Yes", "No"],
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.blocking_issues.some((issue) => issue.includes("at least three")));
  assert.ok(validation.blocking_issues.some((issue) => issue.includes("Missing source_of_truth")));
  assert.equal(validation.next_step, "needs_info");
  assert.ok(formatMarketShapeValidation(validation).includes("Ask the user for the missing details"));
});

test("market shape validation rejects fallback outcome mismatch", () => {
  const validation = validateMarketShape({
    market_type: "multi_outcome",
    question: "Worlds 2027 final peak viewership?",
    outcomes: ["Under 1.5M", "1.5M - 2.5M", "2.5M - 3.5M", "3.5M - 5M", "Over 5M"],
    source_of_truth: "Riot Games / LoL Esports official post-event viewership report",
    close_time: "2027-11-15T00:00:00Z",
    resolution_time: "2027-11-20T12:00:00Z",
    resolution_criteria:
      "Fallback: If Riot does not publish a final report by resolution time, market resolves as Invalid / ambiguous.",
  });

  assert.equal(validation.valid, false);
  assert.ok(
    validation.blocking_issues.some((issue) =>
      issue.includes('references "Invalid / ambiguous" which is not a listed outcome'),
    ),
  );
});

test("next-step explanation is human guidance and read-only", async () => {
  const guidance = await explainNextStep({ step: "create_market" });

  assert.equal(guidance.read_only, true);
  assert.ok(guidance.next_step_guidance.includes("wallet/action tool"));
  assert.ok(guidance.execution_surface.includes("not MCP"));
  assert.ok(formatNextStepExplanation(guidance).includes("Current step: create_market."));
  assert.ok(!formatNextStepExplanation(guidance).includes("creator_signature"));
});

test("response truncation is explicit and actionable", () => {
  const truncated = truncate("x".repeat(30_000));
  assert.ok(truncated.length < 30_000);
  assert.ok(truncated.includes("ForecastOS MCP response truncated"));
  assert.ok(truncated.includes("Use a narrower resource/tool request"));
});

test("stdio protocol initializes and lists resources/tools", async (t) => {
  const client = spawn(process.execPath, [join(projectRoot, "dist", "stdio.js")], {
    cwd: projectRoot,
    env: { ...process.env, FORECASTOS_RESOURCE_DIR: resourceRoot },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => client.kill());
  const messages = [];
  let buffer = "";
  client.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) messages.push(JSON.parse(line));
    }
  });

  client.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "forecast-os-test", version: "0.1.0" },
      },
    })}\n`,
  );
  const init = await waitForMessage(messages, 1);
  assert.equal(init.result.serverInfo.name, "forecast-os-mcp-server");

  client.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  client.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "resources/list" })}\n`);
  const resources = await waitForMessage(messages, 2);
  assert.ok(
    resources.result.resources.some((resource) => resource.uri === "forecastos://docs/remote-mcp"),
  );

  client.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" })}\n`);
  const tools = await waitForMessage(messages, 3);
  const toolNames = tools.result.tools.map((tool) => tool.name);
  assert.ok(toolNames.includes("forecastos_validate_market_shape"));
  assert.ok(toolNames.includes("forecastos_get_config_defaults"));
  assert.ok(toolNames.includes("forecastos_search_markets"));
  assert.ok(toolNames.includes("forecastos_get_market_prices"));
  for (const tool of tools.result.tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
  }

  client.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "forecastos_validate_market_shape",
        arguments: {
          market: {
            question: "Will BLG reach the Worlds final?",
            outcomes: ["Yes", "No"],
          },
        },
      },
    })}\n`,
  );
  const validation = await waitForMessage(messages, 4);
  assert.ok(validation.result.content[0].text.includes("Market shape needs changes"));
  assert.ok(!validation.result.content[0].text.trim().startsWith("{"));

  client.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "forecastos_validate_market_shape",
        arguments: {
          response_format: "json",
          market: {
            question: "Will BLG reach the Worlds final?",
            outcomes: ["Yes", "No"],
          },
        },
      },
    })}\n`,
  );
  const jsonValidation = await waitForMessage(messages, 5);
  assert.equal(JSON.parse(jsonValidation.result.content[0].text).valid, false);

  client.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "forecastos_get_resource",
        arguments: { uri: "forecastos://missing" },
      },
    })}\n`,
  );
  const missing = await waitForMessage(messages, 6);
  const missingText = missing.error?.message ?? missing.result?.content?.[0]?.text ?? JSON.stringify(missing);
  assert.ok(missingText.includes("forecastos_list_resources"));

  client.kill();
});

test("streamable HTTP exposes health/readiness and production guards", async (t) => {
  const port = 3777 + Math.floor(Math.random() * 1000);
  const client = spawn(process.execPath, [join(projectRoot, "dist", "http.js")], {
    cwd: projectRoot,
    env: {
      ...process.env,
      FORECASTOS_RESOURCE_DIR: resourceRoot,
      FORECASTOS_MCP_PORT: String(port),
      FORECASTOS_MCP_RATE_LIMIT_MAX: "1",
      FORECASTOS_MCP_BODY_LIMIT_BYTES: "20",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  t.after(() => client.kill());
  await waitForHttp(`http://127.0.0.1:${port}/healthz`);

  const health = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, "forecast-os-mcp-server");
  const healthAlias = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(healthAlias.status, 200);

  const ready = await fetch(`http://127.0.0.1:${port}/readyz`);
  assert.equal(ready.status, 200);
  assert.equal(ready.headers.get("x-content-type-options"), "nosniff");
  const readyBody = await ready.json();
  assert.equal(readyBody.mode, "public_read_only");
  assert.ok(readyBody.resources_checked.includes("forecastos://schemas/actions"));
  const readyAlias = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(readyAlias.status, 200);

  const missing = await fetch(`http://127.0.0.1:${port}/not-mcp`);
  assert.equal(missing.status, 404);
  assert.ok((await missing.json()).next_step.includes("/mcp"));

  const tooLarge = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(50) }),
  });
  assert.equal(tooLarge.status, 413);
  assert.ok((await tooLarge.json()).next_step.includes("smaller MCP request"));

  const first = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.notEqual(first.status, 429);
  const second = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(second.status, 429);
  assert.ok((await second.json()).next_step.includes("Retry"));

  client.kill();
  await once(client, "exit");
});

test("Docker packaging uses MCP-owned resources and keeps runtime HTTP-only", async () => {
  const dockerfile = await readFile(join(projectRoot, "Dockerfile"), "utf8");
  const dockerignore = await readFile(join(projectRoot, ".dockerignore"), "utf8");
  const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));

  assert.ok(dockerfile.includes("FROM node:22-alpine AS deps"));
  assert.ok(dockerfile.includes("COPY package*.json ./"));
  assert.ok(dockerfile.includes("COPY resources ./resources"));
  assert.ok(dockerfile.includes("ENV FORECASTOS_RESOURCE_DIR=/app/mcp/resources"));
  assert.ok(!dockerfile.includes("COPY forecast-os"));
  assert.ok(!dockerfile.includes("FORECASTOS_SKILL_DIR"));
  assert.ok(dockerfile.includes('CMD ["node", "dist/http.js"]'));
  assert.ok(dockerfile.includes("USER node"));
  assert.ok(dockerignore.includes("**/.forecastos/config.local.json"));
  assert.ok(dockerignore.includes("dist"));
  assert.ok(packageJson.scripts["docker:build"].includes("docker build"));
  assert.ok(packageJson.scripts["docker:build"].includes("."));
  assert.ok(!packageJson.scripts["docker:build"].includes("../.."));
  assert.ok(packageJson.scripts["docker:smoke"].includes("scripts/docker-smoke.mjs"));
  assert.ok(packageJson.scripts["sync:resources"].includes("scripts/sync-resources.mjs"));
  assert.ok(packageJson.scripts.check.includes("typecheck"));
});

test("runtime does not depend on bundled or parent forecast-os folder", async () => {
  const constants = await readFile(join(projectRoot, "src", "constants.ts"), "utf8");
  const repository = await readFile(join(projectRoot, "src", "services", "skillRepository.ts"), "utf8");
  const nextStep = await readFile(join(projectRoot, "src", "tools", "nextStep.ts"), "utf8");

  assert.ok(!constants.includes("FORECASTOS_SKILL_DIR"));
  assert.ok(!constants.includes("..\", \"..\", \"forecast-os\""));
  assert.ok(!repository.includes(".forecastos"));
  assert.ok(!repository.includes("readSavedWorkflows"));
  assert.ok(!nextStep.includes("readSavedWorkflows"));
});

test("MCP resources are owned by this project", async () => {
  const skillDoc = await readFile(join(projectRoot, "resources", "docs", "skill.md"), "utf8");
  const schema = JSON.parse(await readFile(join(projectRoot, "resources", "schemas", "actions.json"), "utf8"));
  const defaults = JSON.parse(
    await readFile(join(projectRoot, "resources", "precog", "config-defaults.json"), "utf8"),
  );

  assert.ok(skillDoc.includes("name: forecast-os"));
  assert.ok(schema.title || schema.$schema || schema.definitions);
  assert.ok(defaults.precog.open_api_key);
});

async function waitForMessage(messages, id) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    const found = messages.find((message) => message.id === id);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for MCP message id ${id}. Received: ${JSON.stringify(messages)}`);
}

async function waitForHttp(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Timed out waiting for HTTP server at ${url}`);
}
