#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { parseArgs, requireArgs } from "./lib/args.mjs";
import { bootstrapFromArgs } from "./lib/bootstrap.mjs";
import * as client from "./lib/client.mjs";

export async function main(deps = {}) {
  const _parseArgs = deps.parseArgs ?? parseArgs;
  const _requireArgs = deps.requireArgs ?? requireArgs;
  const a = _parseArgs();
  bootstrapFromArgs(a);

  const {
    multiread,
    outcomes,
    fromRaw,
    pct,
  } = { ...client, ...deps };

  _requireArgs(a, ["market", "wallet-address"]);

  const marketId = BigInt(a.market);
  const walletAddress = a["wallet-address"];

  const [marketRes, colRes, accountRes, pricesRes] = await multiread([
    ["markets", [marketId]],
    ["marketCollateralInfo", [marketId]],
    ["marketAccountInfo", [marketId, walletAddress]],
    ["marketPrices", [marketId]],
  ], { allowFailure: true });

  if (marketRes.status === "failure") throw new Error("Failed to load market");
  if (colRes.status === "failure") throw new Error("Failed to load collateral info");
  if (accountRes.status === "failure") throw new Error("Failed to load account info");

  const [question, , , , outcomesRaw] = marketRes.result;
  const [, , colSymbol, colDecimals] = colRes.result;
  const [totalBuys, totalSells, deposited, withdrawn, redeemed, balances] = accountRes.result;
  const buyPrices = pricesRes.status === "success" ? pricesRes.result[0] : null;

  const dec = Number(colDecimals);
  const outs = outcomes(outcomesRaw);
  const netCost = deposited - withdrawn - redeemed;

  console.log(`\nMarket ${a.market}`);
  console.log(`${question}\n`);
  console.log(`Wallet: ${walletAddress}`);
  console.log(`Net cost ${fromRaw(netCost < 0n ? 0n : netCost, dec)} ${colSymbol} · ${totalBuys} buys · ${totalSells} sells\n`);

  const held = [];
  for (let i = 1; i < balances.length; i += 1) {
    if (balances[i] === 0n) continue;
    const outcomeLabel = outs[i - 1] ?? `Outcome ${i}`;
    const sharesHuman = Number.parseFloat((Number(balances[i]) / 1e18).toFixed(4));
    const priceStr = buyPrices ? ` · ${pct(buyPrices[i])}%` : "";
    held.push({ outcome: i, label: outcomeLabel, shares: sharesHuman, priceStr });
  }

  if (held.length === 0) {
    console.log("No shares held in this market.\n");
  } else {
    console.log("Shares held");
    for (const position of held) {
      console.log(`  [${position.outcome}] ${position.label} ${position.shares} shares${position.priceStr}`);
    }
    console.log("");
  }

  return { netCost, totalBuys, totalSells, held };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
