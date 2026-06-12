#!/usr/bin/env node
import { bootstrapFromArgs } from "./lib/bootstrap.mjs";
import { parseArgs } from "./lib/args.mjs";
import { prepareBuyTrade } from "./lib/prepare_trade.mjs";

const args = parseArgs(process.argv.slice(2));
bootstrapFromArgs(args);

if (!args.market || !args.outcome || !args.shares || !args.max || !args["wallet-address"]) {
  console.error(
    "Usage: node prepare_buy.mjs --market <id> --outcome <n> --shares <n> --max <amount> --wallet-address <0x...> [--slippage 1] [--network sepolia|mainnet]",
  );
  process.exit(1);
}

try {
  const intent = await prepareBuyTrade({
    market: args.market,
    outcome: args.outcome,
    shares: args.shares,
    max: args.max,
    walletAddress: args["wallet-address"],
    slippage: args.slippage ?? 1,
  });
  console.log(JSON.stringify(intent, null, 2));
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
}
