#!/usr/bin/env node
import { bootstrapFromArgs } from "./lib/bootstrap.mjs";
import { parseArgs } from "./lib/args.mjs";
import { resolveOutcomeFromMarket } from "./lib/outcome.mjs";
import * as client from "./lib/client.mjs";
import { prepareSellTrade } from "./lib/prepare_trade.mjs";

const args = parseArgs(process.argv.slice(2));

const hasOutcome = "outcome" in args || "outcome-label" in args;
if (!args.market || !hasOutcome || !args.shares || !args.min || !args["wallet-address"]) {
  console.error(
    "Usage: node prepare_sell.mjs --market <api-id> (--outcome <n> | --outcome-label <name>) --shares <n> --min <amount> --wallet-address <0x...> [--chain-id 8453] [--slippage 1] [--network mainnet]",
  );
  process.exit(1);
}

try {
  const marketContext = await bootstrapFromArgs(args);
  const onChainMarketId = marketContext.on_chain_market_id;
  const { outcomeIndex } = await resolveOutcomeFromMarket({
    market: onChainMarketId,
    outcome: args.outcome,
    outcomeLabel: args["outcome-label"],
    multiread: client.multiread,
    marketContext,
  });
  const intent = await prepareSellTrade({
    market: onChainMarketId,
    outcome: String(outcomeIndex),
    shares: args.shares,
    min: args.min,
    walletAddress: args["wallet-address"],
    slippage: args.slippage ?? 1,
    marketContext,
  });
  console.log(JSON.stringify(intent, null, 2));
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
}
