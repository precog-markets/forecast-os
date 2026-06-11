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
    write,
    getWallet,
    outcomes,
    toFP64,
    toRaw,
  } = { ...client, ...deps };

  _requireArgs(a, ["market", "outcome", "shares", "min"]);

  const marketId = BigInt(a.market);
  const outcome = Number.parseInt(a.outcome, 10);
  const sharesFP = toFP64(a.shares);
  const slippage = Number.parseFloat(a.slippage ?? "1");
  const { account, wallet } = await getWallet();

  const [colRes, marketRes] = await multiread([
    ["marketCollateralInfo", [marketId]],
    ["markets", [marketId]],
  ]);
  const [, , colSymbol, colDecimals] = colRes;
  const dec = Number(colDecimals);
  const minRaw = toRaw((Number.parseFloat(a.min) * (1 - slippage / 100)).toFixed(dec), dec);

  const [, , , , outcomesRaw] = marketRes;
  const outs = outcomes(outcomesRaw);
  const label = outs[outcome - 1] ?? `Outcome ${outcome}`;

  console.log(`\nSelling ${a.shares} shares of [${label}] on market ${a.market}`);
  console.log(`Min receive: ${a.min} ${colSymbol} (-${slippage}% slippage)`);
  console.log(`Wallet: ${account.address}\n`);

  await write(wallet, account, "marketSell", [marketId, BigInt(outcome), sharesFP, minRaw]);

  console.log(`\nSold ${a.shares} shares of ${label} on market ${a.market}`);
  return { label, shares: a.shares, market: a.market };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
