import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  fetchPrecogMarketsInline,
  formatMarketList,
  listPrecogMarkets,
  loadHermesPrecogConfig,
} from "../precog-list-runtime.mjs";

const hermesSkillRoot = join(fileURLToPath(new URL("../..", import.meta.url)));
const repoSkillRoot = join(hermesSkillRoot, "..", "..", "..", "..", "..", "..", "skill", "forecast-os");

const mockMarket = {
  id: 136,
  master_market_id: 23,
  chain_id: 8453,
  name: "Spotify top artist 2026",
  outcomes: "Taylor Swift,Bruno Mars,Bad Bunny",
};

test("loadHermesPrecogConfig reads open_api_key from skill .forecastos config", async () => {
  const { precog, configPath } = await loadHermesPrecogConfig(repoSkillRoot);
  assert.ok(precog.open_api_key);
  assert.match(configPath, /config\.json$/);
});

test("fetchPrecogMarketsInline maps API records to list rows", async () => {
  const markets = await fetchPrecogMarketsInline({
    chainId: 8453,
    status: "OPEN",
    precogConfig: {
      api_root: "https://service.precog.markets",
      open_api_key: "test-key",
    },
    fetch: async () => ({
      ok: true,
      async text() {
        return JSON.stringify([mockMarket]);
      },
    }),
  });

  assert.equal(markets.length, 1);
  assert.equal(markets[0].precog_api_market_id, "136");
  assert.equal(markets[0].on_chain_market_id, "23");
  assert.deepEqual(markets[0].outcome_list, ["Taylor Swift", "Bruno Mars", "Bad Bunny"]);
});

test("listPrecogMarkets uses inline fetch without FORECASTOS_REPO_ROOT", async () => {
  const { markets } = await listPrecogMarkets({
    args: { "chain-id": "8453", status: "OPEN" },
    env: {},
    skillRoot: repoSkillRoot,
    fetch: async () => ({
      ok: true,
      async text() {
        return JSON.stringify([mockMarket]);
      },
    }),
  });

  assert.equal(markets.length, 1);
  const output = formatMarketList(markets);
  assert.match(output, /api_id\tmaster_market_id\tname\toutcomes/);
  assert.match(output, /136\t23\tSpotify top artist 2026/);
});
