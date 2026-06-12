import assert from "node:assert/strict";
import test from "node:test";
import { prepareBuyTrade } from "../lib/prepare_trade.mjs";

const walletAddress = "0x1111111111111111111111111111111111111111";
const colToken = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const futureEnd = BigInt(Math.floor(Date.now() / 1000) + 3600);

test("prepareBuyTrade builds approve+buy transactions without private key", async () => {
  const intent = await prepareBuyTrade({
    market: "4",
    outcome: "1",
    shares: "10",
    max: "5",
    walletAddress,
    slippage: 0,
    deps: {
      multiread: async () => [
        [colToken, 0n, "USDC", 6],
        [0n, 0n, 0n, 0n, "Yes|No", 0n, 0n, 0n, 0n, futureEnd],
      ],
      readAllowance: async () => 0n,
      getChainId: () => 8453,
    },
  });

  assert.equal(intent.intent_type, "forecastos.precog_trade");
  assert.equal(intent.action, "buy");
  assert.equal(intent.wallet_address, walletAddress);
  assert.equal(intent.transactions.length, 2);
  assert.equal(intent.transactions[0].step, "approve");
  assert.equal(intent.transactions[1].step, "buy");
  assert.match(intent.transactions[1].data, /^0x[0-9a-f]+$/i);
  assert.equal(intent.next_action, "resolve_trade_with_wallet_adapter");
});

test("prepareBuyTrade skips approve when allowance is sufficient", async () => {
  const intent = await prepareBuyTrade({
    market: "4",
    outcome: "1",
    shares: "10",
    max: "5",
    walletAddress,
    deps: {
      multiread: async () => [
        [colToken, 0n, "USDC", 6],
        [0n, 0n, 0n, 0n, "Yes|No", 0n, 0n, 0n, 0n, futureEnd],
      ],
      readAllowance: async () => 10_000_000n,
      getChainId: () => 8453,
    },
  });

  assert.equal(intent.transactions.length, 1);
  assert.equal(intent.transactions[0].step, "buy");
});
