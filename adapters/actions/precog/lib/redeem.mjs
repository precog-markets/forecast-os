import { encodeFunctionData } from "viem";
import { normalizeEvmChecksumAddress } from "../../../wallets/address_utils.mjs";
import {
  ABI,
  MASTER_ADDRESS,
  getChainId,
  multiread,
  fromRaw,
} from "./client.mjs";
import { parseOutcomeList } from "./outcome.mjs";

export const READY_TO_REDEEM = "READY_TO_REDEEM";
export const ALREADY_REDEEMED = "ALREADY_REDEEMED";
export const NOTHING_TO_REDEEM = "NOTHING_TO_REDEEM";

export function calculateRedeemStatus({
  marketResult,
  accountRedeemed,
  winningShareBalance,
}) {
  const result = BigInt(marketResult ?? 0);
  const redeemed = BigInt(accountRedeemed ?? 0);
  const winning = BigInt(winningShareBalance ?? 0);
  const isResolved = result !== 0n;
  const hasWinningShares = winning > 0n;
  const canRedeem = isResolved && hasWinningShares && redeemed === 0n;
  const alreadyRedeemed = isResolved && redeemed > 0n;

  let redeemStatus = NOTHING_TO_REDEEM;
  if (canRedeem) redeemStatus = READY_TO_REDEEM;
  else if (alreadyRedeemed) redeemStatus = ALREADY_REDEEMED;

  return {
    isResolved,
    hasWinningShares,
    canRedeem,
    alreadyRedeemed,
    redeemStatus,
    marketResult: result,
    accountRedeemed: redeemed,
    winningShareBalance: winning,
  };
}

function sharesHumanFromBalance(balance) {
  return Number.parseFloat((Number(balance) / 1e18).toFixed(4));
}

function estimatedPayoutRaw(winningShareBalance, colDecimals) {
  const sharesHuman = Number(winningShareBalance) / 1e18;
  const payoutWhole = Math.floor(sharesHuman);
  const payoutFrac = sharesHuman - payoutWhole;
  const wholeRaw = BigInt(payoutWhole) * 10n ** BigInt(colDecimals);
  const fracRaw = BigInt(Math.round(payoutFrac * Number(10n ** BigInt(colDecimals))));
  return wholeRaw + fracRaw;
}

export async function readRedeemContext({
  marketId,
  walletAddress,
  marketContext,
  deps = {},
}) {
  const _multiread = deps.multiread ?? multiread;
  const marketIdBig = BigInt(marketId);
  const wallet = normalizeEvmChecksumAddress(walletAddress, "wallet_address");

  const [resultRes, accountRes, colRes, marketRes] = await _multiread([
    ["marketResultInfo", [marketIdBig]],
    ["marketAccountInfo", [marketIdBig, wallet]],
    ["marketCollateralInfo", [marketIdBig]],
    ["markets", [marketIdBig]],
  ], { allowFailure: true });

  if (resultRes.status === "failure") throw new Error("Failed to load market result info");
  if (accountRes.status === "failure") throw new Error("Failed to load account info");
  if (colRes.status === "failure") throw new Error("Failed to load collateral info");
  if (marketRes.status === "failure") throw new Error("Failed to load market info");

  const [marketResult, closed] = resultRes.result;
  const [, , , , redeemed, balances] = accountRes.result;
  const [, , colSymbol, colDecimals] = colRes.result;
  const [, , , , outcomesRaw] = marketRes.result;

  const outcomeIndex = Number(marketResult);
  const winningShareBalance = outcomeIndex > 0 && outcomeIndex < balances.length
    ? balances[outcomeIndex]
    : 0n;

  const status = calculateRedeemStatus({
    marketResult,
    accountRedeemed: redeemed,
    winningShareBalance,
  });

  const outcomeList = marketContext?.outcome_list?.length
    ? marketContext.outcome_list
    : parseOutcomeList(outcomesRaw);
  const winningOutcomeLabel = outcomeIndex > 0
    ? (outcomeList[outcomeIndex - 1] ?? `Outcome ${outcomeIndex}`)
    : null;

  const dec = Number(colDecimals);
  const winningSharesHuman = sharesHumanFromBalance(winningShareBalance);
  const payoutRaw = estimatedPayoutRaw(winningShareBalance, dec);
  const estimatedPayout = fromRaw(payoutRaw, dec);

  return {
    ...status,
    closed: BigInt(closed ?? 0),
    winningOutcome: outcomeIndex > 0 ? outcomeIndex : null,
    winningOutcomeLabel,
    winningShares: winningSharesHuman,
    collateralSymbol: colSymbol,
    collateralDecimals: dec,
    estimatedPayout,
    estimatedPayoutRaw: payoutRaw,
    walletAddress: wallet,
    onChainMarketId: String(marketId),
    precogApiMarketId: marketContext?.precog_api_market_id ?? String(marketId),
  };
}

export async function prepareRedeemTrade({
  market,
  walletAddress,
  marketContext,
  deps = {},
}) {
  const _getChainId = deps.getChainId ?? getChainId;
  const context = await readRedeemContext({
    marketId: market,
    walletAddress,
    marketContext,
    deps,
  });

  if (!context.canRedeem) {
    throw new Error(
      `Cannot redeem shares for market ${market}: redeem_status=${context.redeemStatus}.`,
    );
  }

  const marketId = BigInt(market);
  const chainId = _getChainId();
  const funder = normalizeEvmChecksumAddress(walletAddress, "wallet_address");

  const transactions = [{
    step: "redeem",
    to: MASTER_ADDRESS,
    value: "0",
    data: encodeFunctionData({
      abi: ABI,
      functionName: "marketRedeemShares",
      args: [marketId],
    }),
    chainId,
  }];

  const onChainMarketId = String(market);
  const precogApiMarketId = marketContext?.precog_api_market_id;
  return {
    intent_type: "forecastos.precog_trade",
    action: "redeem",
    chain_id: chainId,
    precog_api_market_id: precogApiMarketId ?? onChainMarketId,
    on_chain_market_id: onChainMarketId,
    market_id: onChainMarketId,
    outcome: context.winningOutcome,
    wallet_address: funder,
    trade_summary: {
      winning_outcome: context.winningOutcome,
      winning_outcome_label: context.winningOutcomeLabel,
      winning_shares: String(context.winningShares),
      collateral_symbol: context.collateralSymbol,
      estimated_payout: context.estimatedPayout,
    },
    transactions,
    next_action: "resolve_trade_with_wallet_adapter",
    wallet_adapter_hint: "Run adapters/wallets/<provider>/resolve_trade.mjs with this JSON as --input.",
  };
}

export function formatRedeemStatusLines(context, { displayApiId, question } = {}) {
  const lines = [];
  const apiId = displayApiId ?? context.precogApiMarketId;
  const onChainId = context.onChainMarketId;
  lines.push(`\nMarket ${apiId} (on-chain ${onChainId})`);
  if (question) lines.push(`${question}\n`);
  lines.push(`Wallet: ${context.walletAddress}`);
  lines.push(`Redeem status: ${context.redeemStatus}`);
  if (context.isResolved && context.winningOutcome) {
    lines.push(`Winning outcome: [${context.winningOutcome}] ${context.winningOutcomeLabel}`);
    lines.push(`Winning shares: ${context.winningShares}`);
    lines.push(`Estimated payout: ${context.estimatedPayout} ${context.collateralSymbol} (1:1)`);
  } else if (!context.isResolved) {
    lines.push("Market is not resolved yet.");
  }
  if (context.alreadyRedeemed) {
    lines.push(`Already redeemed: ${fromRaw(context.accountRedeemed, context.collateralDecimals ?? 6)} ${context.collateralSymbol ?? ""}`.trim());
  }
  lines.push("");
  return lines.join("\n");
}
