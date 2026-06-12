import assert from "node:assert/strict";
import test from "node:test";
import {
  LSLMSR,
  marketSharesFromCost,
  marketPriceAfterTrade,
} from "../lib/helper.mjs";

test("marketSharesFromCost returns positive shares for a modest budget", () => {
  const shares = [10, 10, 10];
  const alpha = 0.1;
  const result = marketSharesFromCost(shares, alpha, 1, 5);
  assert.ok(result > 0);
});

test("LSLMSR maxSharesFromPrice increases shares as target price rises", () => {
  const market = LSLMSR.fromState({ Yes: 10, No: 10 }, 0.1);
  const low = market.maxSharesFromPrice("Yes", 0.55);
  const high = market.maxSharesFromPrice("Yes", 0.75);
  assert.ok(high > low);
});

test("marketPriceAfterTrade moves probability upward on buys", () => {
  const shares = [10, 10];
  const before = marketPriceAfterTrade(shares, 0.1, 0, 0);
  const after = marketPriceAfterTrade(shares, 0.1, 0, 5);
  assert.ok(after > before);
});
