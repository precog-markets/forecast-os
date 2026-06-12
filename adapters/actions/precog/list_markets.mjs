#!/usr/bin/env node
import { parseArgs } from "./lib/args.mjs";
import { fetchPrecogMarkets } from "./lib/market_resolve.mjs";

const args = parseArgs(process.argv.slice(2));
const chainId = args["chain-id"] ?? args.chain_id;
const status = args.status ?? "OPEN";

if (!chainId) {
  console.error("Usage: node list_markets.mjs --chain-id <id> [--status OPEN]");
  process.exit(1);
}

try {
  const markets = await fetchPrecogMarkets({ chainId, status });
  if (!markets.length) {
    console.log(`No ${status} markets for chain_id ${chainId}.`);
    process.exit(0);
  }

  const header = ["api_id", "master_market_id", "name", "outcomes"];
  console.log(header.join("\t"));
  for (const market of markets) {
    const outcomes = market.outcome_list.join(", ");
    const truncatedOutcomes = outcomes.length > 60 ? `${outcomes.slice(0, 57)}...` : outcomes;
    const row = [
      market.precog_api_market_id ?? "",
      market.on_chain_market_id,
      market.question.replace(/\s+/g, " ").slice(0, 80),
      truncatedOutcomes,
    ];
    console.log(row.join("\t"));
  }
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
}
