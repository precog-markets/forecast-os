#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { parseArgs, requireArgs } from "./lib/args.mjs";
import { bootstrapFromArgs } from "./lib/bootstrap.mjs";
import {
  formatRedeemStatusLines,
  readRedeemContext,
} from "./lib/redeem.mjs";

export async function main(deps = {}) {
  const _parseArgs = deps.parseArgs ?? parseArgs;
  const a = _parseArgs();
  const _requireArgs = deps.requireArgs ?? requireArgs;
  _requireArgs(a, ["market", "wallet-address"]);

  const marketContext = await (deps.bootstrapFromArgs ?? bootstrapFromArgs)(a, deps);
  const onChainMarketId = marketContext?.on_chain_market_id ?? a.market;
  const displayApiId = marketContext?.precog_api_market_id ?? a.market;

  const context = await readRedeemContext({
    marketId: onChainMarketId,
    walletAddress: a["wallet-address"],
    marketContext,
    deps,
  });

  const payload = {
    redeem_status: context.redeemStatus,
    can_redeem: context.canRedeem,
    already_redeemed: context.alreadyRedeemed,
    is_resolved: context.isResolved,
    winning_outcome: context.winningOutcome,
    winning_outcome_label: context.winningOutcomeLabel,
    winning_shares: context.winningShares,
    collateral_symbol: context.collateralSymbol,
    estimated_payout: context.estimatedPayout,
    on_chain_market_id: onChainMarketId,
    precog_api_market_id: displayApiId,
    wallet_address: context.walletAddress,
  };

  if (a.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(formatRedeemStatusLines(context, {
      displayApiId,
      question: marketContext?.question,
    }));
  }

  return payload;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
