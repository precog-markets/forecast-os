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
    ensureApproval,
    outcomes,
    toFP64,
    toRaw,
    MASTER_ADDRESS,
  } = { ...client, ...deps };

  _requireArgs(a, ["market", "outcome", "shares", "max"]);

  const marketId = BigInt(a.market);
  const outcome = Number.parseInt(a.outcome, 10);
  const sharesFP = toFP64(a.shares);
  const slippage = Number.parseFloat(a.slippage ?? "1");
  const { account, wallet } = await getWallet();

  const [colRes, marketRes] = await multiread([
    ["marketCollateralInfo", [marketId]],
    ["markets", [marketId]],
  ]);
  const [colToken, , colSymbol, colDecimals] = colRes;
  const market = marketRes;
  const dec = Number(colDecimals);
  const maxRaw = toRaw((Number.parseFloat(a.max) * (1 + slippage / 100)).toFixed(dec), dec);

  const [, , , , outcomesRaw, , , , , endTs] = market;
  if (Date.now() / 1000 > Number(endTs)) {
    throw new Error("Market has ended.");
  }

  const outs = outcomes(outcomesRaw);
  const label = outs[outcome - 1] ?? `Outcome ${outcome}`;

  console.log(`\nBuying ${a.shares} shares of [${label}] on market ${a.market}`);
  console.log(`Max spend: ${a.max} ${colSymbol} (+${slippage}% slippage)`);
  console.log(`Wallet: ${account.address}\n`);

  await ensureApproval(wallet, account, colToken, MASTER_ADDRESS, maxRaw);
  await write(wallet, account, "marketBuy", [marketId, BigInt(outcome), sharesFP, maxRaw]);

  console.log(`\nBought ${a.shares} shares of ${label} on market ${a.market}`);
  return { label, shares: a.shares, market: a.market };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
