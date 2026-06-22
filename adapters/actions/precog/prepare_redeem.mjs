#!/usr/bin/env node
import { bootstrapFromArgs } from "./lib/bootstrap.mjs";
import { parseArgs } from "./lib/args.mjs";
import { prepareRedeemTrade } from "./lib/redeem.mjs";

const args = parseArgs(process.argv.slice(2));

if (!args.market || !args["wallet-address"]) {
  console.error(
    "Usage: node prepare_redeem.mjs --market <api-id> --wallet-address <0x...> [--chain-id 8453] [--network mainnet]",
  );
  process.exit(1);
}

try {
  const marketContext = await bootstrapFromArgs(args);
  const onChainMarketId = marketContext?.on_chain_market_id ?? args.market;
  const intent = await prepareRedeemTrade({
    market: onChainMarketId,
    walletAddress: args["wallet-address"],
    marketContext,
  });
  console.log(JSON.stringify(intent, null, 2));
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
}
