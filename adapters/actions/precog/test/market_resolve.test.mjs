import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchPrecogMarket,
  networkForChainId,
  parsePrecogMarketRecord,
  resolveMarketContext,
} from "../lib/market_resolve.mjs";

const mockPrecogConfig = {
  api_root: "https://service.precog.markets",
  open_api_key: "test-key",
};

const brunoMarsMarket = {
  id: 136,
  master_market_id: 23,
  chain_id: 8453,
  name: "Spotify top artist 2026",
  outcomes: "Taylor Swift,Bruno Mars,Bad Bunny",
};

test("parsePrecogMarketRecord maps API id to master_market_id", () => {
  const parsed = parsePrecogMarketRecord(brunoMarsMarket);
  assert.equal(parsed.precog_api_market_id, "136");
  assert.equal(parsed.on_chain_market_id, "23");
  assert.equal(parsed.network, "mainnet");
  assert.deepEqual(parsed.outcome_list, ["Taylor Swift", "Bruno Mars", "Bad Bunny"]);
});

test("networkForChainId maps Base mainnet and sepolia", () => {
  assert.equal(networkForChainId(8453), "mainnet");
  assert.equal(networkForChainId(84532), "sepolia");
});

test("fetchPrecogMarket resolves API id 136 to master_market_id 23", async () => {
  const parsed = await fetchPrecogMarket({
    apiMarketId: 136,
    chainId: 8453,
    precogConfig: mockPrecogConfig,
    fetch: async () => ({
      ok: true,
      async text() {
        return JSON.stringify([brunoMarsMarket]);
      },
    }),
  });
  assert.equal(parsed.precog_api_market_id, "136");
  assert.equal(parsed.on_chain_market_id, "23");
});

test("resolveMarketContext auto-selects mainnet from chain_id 8453", async () => {
  const context = await resolveMarketContext(
    { market: "136", "chain-id": "8453" },
    {
      precogConfig: mockPrecogConfig,
      fetch: async () => ({
        ok: true,
        async text() {
          return JSON.stringify([brunoMarsMarket]);
        },
      }),
    },
  );
  assert.equal(context.on_chain_market_id, "23");
  assert.equal(context.network, "mainnet");
});

test("resolveMarketContext rejects network mismatch", async () => {
  await assert.rejects(
    () => resolveMarketContext(
      { market: "136", network: "sepolia", "chain-id": "8453" },
      {
        precogConfig: mockPrecogConfig,
        fetch: async () => ({
          ok: true,
          async text() {
            return JSON.stringify([brunoMarsMarket]);
          },
        }),
      },
    ),
    /Network mismatch/,
  );
});

test("resolveMarketContext accepts explicit master-market-id", async () => {
  const context = await resolveMarketContext({
    "master-market-id": "23",
    "chain-id": "8453",
  });
  assert.equal(context.on_chain_market_id, "23");
  assert.equal(context.network, "mainnet");
});
