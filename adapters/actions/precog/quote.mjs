#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { parseArgs, requireArgs } from "./lib/args.mjs";
import { bootstrapFromArgs } from "./lib/bootstrap.mjs";
import * as client from "./lib/client.mjs";
import {
  LSLMSR,
  marketSharesFromCost,
  marketPriceAfterTrade,
  getFuturePriceAfterTrade,
} from "./lib/helper.mjs";

export async function main(deps = {}) {
  const _parseArgs = deps.parseArgs ?? parseArgs;
  const _requireArgs = deps.requireArgs ?? requireArgs;
  const a = _parseArgs();
  bootstrapFromArgs(a);

  const {
    multiread,
    outcomes,
    pct,
    toFP64,
    fromFP64,
    fromRaw,
    tokenBalance,
  } = { ...client, ...deps };

  _requireArgs(a, ["market", "outcome"]);
  if (!("shares" in a) && !("cost" in a) && !("price" in a) && !("all" in a)) {
    throw new Error("Provide one of: --shares, --cost, --price <0.0-1.0>, --all");
  }

  const showBuy = !("sell" in a);
  const showSell = !("buy" in a);
  const marketId = BigInt(a.market);
  const outcome = Number.parseInt(a.outcome, 10);

  const [marketRes, colRes, setupRes, sharesRes, pricesRes] = await multiread([
    ["markets", [marketId]],
    ["marketCollateralInfo", [marketId]],
    ["marketSetupInfo", [marketId]],
    ["marketSharesInfo", [marketId]],
    ["marketPrices", [marketId]],
  ], { allowFailure: true });

  if (marketRes.status === "failure") throw new Error("Failed to load market");
  if (colRes.status === "failure") throw new Error("Failed to load collateral info");
  if (setupRes.status === "failure") throw new Error("Failed to load market setup info");
  if (sharesRes.status === "failure") throw new Error("Failed to load market shares info");

  const [question, , , , outcomesRaw] = marketRes.result;
  const [colToken, , colSymbol] = colRes.result;
  const [, alphaFP, , sellFeeFP] = setupRes.result;
  const [, sharesBalancesFP] = sharesRes.result;

  const rawOuts = outcomes(outcomesRaw);
  const outcomeList = (rawOuts.length === 1 && rawOuts[0].includes(","))
    ? rawOuts[0].split(",").map((value) => value.trim()).filter(Boolean)
    : rawOuts;
  const label = outcomeList[outcome - 1] ?? `Outcome ${outcome}`;

  const alpha = fromFP64(alphaFP);
  const sellFee = fromFP64(sellFeeFP);
  const sharesArr = sharesBalancesFP.map((fp) => fromFP64(fp));

  let sharesNum;
  if ("all" in a) {
    const walletAddress = a["wallet-address"];
    if (!walletAddress) {
      throw new Error("--all requires --wallet-address <0x...> (no local private key needed).");
    }
    const balRaw = await tokenBalance(colToken, walletAddress);
    const balance = Number(balRaw) / 1e18;
    console.log(`  Wallet balance : ${balance.toFixed(4)} ${colSymbol}`);
    sharesNum = Math.floor(marketSharesFromCost(sharesArr, alpha, outcome, balance));
  } else if ("cost" in a) {
    sharesNum = Math.floor(marketSharesFromCost(sharesArr, alpha, outcome, Number.parseFloat(a.cost)));
  } else if ("price" in a) {
    const outcomesBalances = {};
    for (let j = 0; j < outcomeList.length; j += 1) {
      outcomesBalances[outcomeList[j]] = sharesArr[j + 1];
    }
    const lslmsr = LSLMSR.fromState(outcomesBalances, alpha);
    lslmsr.sellFee = sellFee;
    sharesNum = Math.floor(lslmsr.maxSharesFromPrice(label, Number.parseFloat(a.price)));
  } else {
    sharesNum = Number.parseFloat(a.shares);
  }

  if (sharesNum <= 0) {
    console.log("\nNot enough for even 1 share.\n");
    return null;
  }

  const sharesFP = toFP64(sharesNum);
  const [buyCostFP, sellRetFP] = await multiread([
    ["marketBuyPrice", [marketId, BigInt(outcome), sharesFP]],
    ["marketSellPrice", [marketId, BigInt(outcome), sharesFP]],
  ]);
  const buyCost = fromFP64(BigInt(buyCostFP));
  const sellRet = fromFP64(BigInt(sellRetFP));
  const perShare = buyCost / sharesNum;
  const futureBuyPrice = marketPriceAfterTrade(sharesArr, alpha, outcome, sharesNum);
  const futureSellPrice = getFuturePriceAfterTrade(sharesArr, alpha, outcome, -sharesNum);
  const maxReturn = sharesNum;
  const buyProfit = maxReturn - buyCost;
  const sellPerShare = sellRet / sharesNum;

  let prob = "N/A";
  if (pricesRes.status === "success") {
    prob = `${pct(pricesRes.result[0][outcome])}%`;
  }

  const hr = "-".repeat(57);
  console.log(`\nQuote - Market ${a.market}: ${question}`);
  console.log(hr);
  console.log(`  Outcome      : ${label}`);
  console.log(`  Shares       : ${sharesNum}`);
  console.log(`  Current prob : ${prob}`);

  if (showBuy) {
    console.log(`\n  Buy ${sharesNum} shares`);
    console.log(`  Cost         : ~${buyCost.toFixed(4)} ${colSymbol}`);
    console.log(`  Price/share  : ${perShare.toFixed(4)} ${colSymbol}`);
    console.log(`  Prob after   : ${pct(futureBuyPrice)}%`);
    console.log(`  Max return   : ${maxReturn.toFixed(4)} ${colSymbol} (+${buyProfit.toFixed(4)} if "${label}" wins)`);
    console.log(`  Suggested --max for buy : ${(buyCost * 1.01).toFixed(4)}`);
  }

  if (showSell) {
    console.log(`\n  Sell ${sharesNum} shares`);
    console.log(`  Return       : ~${sellRet.toFixed(4)} ${colSymbol}`);
    console.log(`  Price/share  : ${sellPerShare.toFixed(4)} ${colSymbol}`);
    console.log(`  Prob after   : ${pct(futureSellPrice)}%`);
    console.log(`  Suggested --min for sell : ${(sellRet * 0.99).toFixed(4)}`);
  }

  console.log("--- Paste ALL lines above verbatim before asking to confirm ---\n");

  return {
    label,
    shares: sharesNum,
    buyCost,
    sellRet,
    suggestedMax: buyCost * 1.01,
    suggestedMin: sellRet * 0.99,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
