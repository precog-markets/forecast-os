import assert from "node:assert/strict";
import test from "node:test";
import { main as quoteMain } from "../quote.mjs";

function buildMultireadResult() {
  return [
    {
      status: "success",
      result: [
        "Will it rain tomorrow?",
        0n,
        0n,
        0n,
        "Yes|No",
        0n,
        0n,
        0n,
        0n,
        BigInt(Math.floor(Date.now() / 1000) + 3600),
      ],
    },
    {
      status: "success",
      result: [
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        0n,
        "USDC",
        6,
      ],
    },
    {
      status: "success",
      result: [0n, 737280000000000000n, 0n, 0n],
    },
    {
      status: "success",
      result: [0n, [0n, 1000000000000000000n, 1000000000000000000n]],
    },
    {
      status: "success",
      result: [[500000000000000000n, 500000000000000000n]],
    },
  ];
}

test("quote returns suggested max/min from mocked contract reads", async () => {
  let multireadCalls = 0;
  const result = await quoteMain({
    parseArgs: () => ({
      market: "1",
      outcome: "1",
      cost: "10",
      buy: true,
    }),
    requireArgs: () => {},
    multiread: async (calls, options = {}) => {
      multireadCalls += 1;
      if (multireadCalls === 1) return buildMultireadResult();
      return [1000000000000000000n, 900000000000000000n];
    },
    outcomes: (raw) => raw.split("|"),
    pct: (value) => (Number(value) / 1e18 * 100).toFixed(1),
    toFP64: (shares) => BigInt(Math.floor(Number(shares) * 1e18)),
    fromFP64: (fp) => Number(fp) / 1e18,
    fromRaw: () => "0",
    tokenBalance: async () => 0n,
  });

  assert.ok(result);
  assert.ok(result.shares > 0);
  assert.ok(result.suggestedMax > result.buyCost);
  assert.ok(result.suggestedMin < result.sellRet);
});
