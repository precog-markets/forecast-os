import assert from "node:assert/strict";
import test from "node:test";
import {
  ALREADY_REDEEMED,
  NOTHING_TO_REDEEM,
  READY_TO_REDEEM,
  calculateRedeemStatus,
  prepareRedeemTrade,
} from "../lib/redeem.mjs";

const walletAddress = "0x1111111111111111111111111111111111111111";
const SHARE_10 = 10n * 10n ** 18n;

function mockMultireadReady({ marketResult = 2n, winningBalance = SHARE_10, redeemed = 0n } = {}) {
  return async () => [
    { status: "success", result: [marketResult, 1n, walletAddress] },
    {
      status: "success",
      result: [0n, 0n, 0n, 0n, redeemed, [0n, 0n, winningBalance]],
    },
    { status: "success", result: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 0n, "USDC", 6] },
    { status: "success", result: ["Question?", "", "", "", "A|B", walletAddress, walletAddress, walletAddress, 0n, 0n, walletAddress] },
  ];
}

test("calculateRedeemStatus returns READY_TO_REDEEM when resolved with winning shares", () => {
  const status = calculateRedeemStatus({
    marketResult: 2n,
    accountRedeemed: 0n,
    winningShareBalance: SHARE_10,
  });
  assert.equal(status.redeemStatus, READY_TO_REDEEM);
  assert.equal(status.canRedeem, true);
  assert.equal(status.alreadyRedeemed, false);
});

test("calculateRedeemStatus returns ALREADY_REDEEMED after redeem", () => {
  const status = calculateRedeemStatus({
    marketResult: 2n,
    accountRedeemed: 5_000_000n,
    winningShareBalance: 0n,
  });
  assert.equal(status.redeemStatus, ALREADY_REDEEMED);
  assert.equal(status.canRedeem, false);
  assert.equal(status.alreadyRedeemed, true);
});

test("calculateRedeemStatus returns NOTHING_TO_REDEEM when unresolved", () => {
  const status = calculateRedeemStatus({
    marketResult: 0n,
    accountRedeemed: 0n,
    winningShareBalance: SHARE_10,
  });
  assert.equal(status.redeemStatus, NOTHING_TO_REDEEM);
  assert.equal(status.canRedeem, false);
});

test("calculateRedeemStatus returns NOTHING_TO_REDEEM when resolved but no winning shares", () => {
  const status = calculateRedeemStatus({
    marketResult: 1n,
    accountRedeemed: 0n,
    winningShareBalance: 0n,
  });
  assert.equal(status.redeemStatus, NOTHING_TO_REDEEM);
  assert.equal(status.canRedeem, false);
});

test("prepareRedeemTrade builds single redeem transaction", async () => {
  const intent = await prepareRedeemTrade({
    market: "23",
    walletAddress,
    marketContext: { precog_api_market_id: "136", on_chain_market_id: "23" },
    deps: {
      multiread: mockMultireadReady(),
      getChainId: () => 8453,
    },
  });

  assert.equal(intent.intent_type, "forecastos.precog_trade");
  assert.equal(intent.action, "redeem");
  assert.equal(intent.market_id, "23");
  assert.equal(intent.precog_api_market_id, "136");
  assert.equal(intent.outcome, 2);
  assert.equal(intent.transactions.length, 1);
  assert.equal(intent.transactions[0].step, "redeem");
  assert.match(intent.transactions[0].data, /^0x[0-9a-f]+$/i);
  assert.equal(intent.trade_summary.winning_outcome_label, "B");
  assert.equal(intent.trade_summary.collateral_symbol, "USDC");
  assert.equal(intent.next_action, "resolve_trade_with_wallet_adapter");
});

test("prepareRedeemTrade rejects unresolved market", async () => {
  await assert.rejects(
    () => prepareRedeemTrade({
      market: "23",
      walletAddress,
      deps: {
        multiread: mockMultireadReady({ marketResult: 0n }),
        getChainId: () => 8453,
      },
    }),
    /redeem_status=NOTHING_TO_REDEEM/,
  );
});

test("prepareRedeemTrade rejects already redeemed", async () => {
  await assert.rejects(
    () => prepareRedeemTrade({
      market: "23",
      walletAddress,
      deps: {
        multiread: mockMultireadReady({ redeemed: 10_000_000n, winningBalance: 0n }),
        getChainId: () => 8453,
      },
    }),
    /redeem_status=ALREADY_REDEEMED/,
  );
});

test("prepareRedeemTrade uses winning balance at result index", async () => {
  const intent = await prepareRedeemTrade({
    market: "4",
    walletAddress,
    deps: {
      multiread: async () => [
        { status: "success", result: [2n, 1n, walletAddress] },
        {
          status: "success",
          result: [0n, 0n, 0n, 0n, 0n, [0n, 5n * 10n ** 18n, 8n * 10n ** 18n]],
        },
        { status: "success", result: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 0n, "USDC", 6] },
        { status: "success", result: ["Q", "", "", "", "X|Y", walletAddress, walletAddress, walletAddress, 0n, 0n, walletAddress] },
      ],
      getChainId: () => 8453,
    },
  });
  assert.equal(intent.outcome, 2);
  assert.equal(intent.trade_summary.winning_shares, "8");
});
