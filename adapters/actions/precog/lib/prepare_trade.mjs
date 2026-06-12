import { encodeFunctionData } from "viem";
import { normalizeEvmChecksumAddress } from "../../../wallets/address_utils.mjs";
import {
  ABI,
  ERC20_ABI,
  MASTER_ADDRESS,
  getChainId,
  multiread,
  outcomes,
  readAllowance,
  toFP64,
  toRaw,
} from "./client.mjs";

export async function prepareBuyTrade({
  market,
  outcome,
  shares,
  max,
  walletAddress,
  slippage = 1,
  marketContext,
  deps = {},
}) {
  const {
    multiread: _multiread = multiread,
    readAllowance: _readAllowance = readAllowance,
    getChainId: _getChainId = getChainId,
  } = deps;
  const marketId = BigInt(market);
  const outcomeIndex = Number.parseInt(outcome, 10);
  const sharesFP = toFP64(shares);
  const slippagePct = Number.parseFloat(slippage);
  const funder = normalizeEvmChecksumAddress(walletAddress, "wallet_address");

  const [colRes, marketRes] = await _multiread([
    ["marketCollateralInfo", [marketId]],
    ["markets", [marketId]],
  ]);
  const [colToken, , colSymbol, colDecimals] = colRes;
  const dec = Number(colDecimals);
  const maxRaw = toRaw((Number.parseFloat(max) * (1 + slippagePct / 100)).toFixed(dec), dec);

  const [, , , , outcomesRaw, , , , , endTs] = marketRes;
  if (Date.now() / 1000 > Number(endTs)) {
    throw new Error("Market has ended.");
  }

  const outs = outcomes(outcomesRaw);
  const label = outs[outcomeIndex - 1] ?? `Outcome ${outcomeIndex}`;
  const chainId = _getChainId();
  const transactions = [];

  const allowance = await _readAllowance(colToken, funder, MASTER_ADDRESS);
  if (allowance < maxRaw) {
    transactions.push({
      step: "approve",
      to: colToken,
      value: "0",
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [MASTER_ADDRESS, maxRaw],
      }),
      chainId,
    });
  }

  transactions.push({
    step: "buy",
    to: MASTER_ADDRESS,
    value: "0",
    data: encodeFunctionData({
      abi: ABI,
      functionName: "marketBuy",
      args: [marketId, BigInt(outcomeIndex), sharesFP, maxRaw],
    }),
    chainId,
  });

  return buildTradeIntent({
    action: "buy",
    chainId,
    market,
    marketContext,
    outcome: outcomeIndex,
    shares: String(shares),
    max: String(max),
    slippage: String(slippagePct),
    walletAddress: funder,
    label,
    colSymbol,
    transactions,
  });
}

export async function prepareSellTrade({
  market,
  outcome,
  shares,
  min,
  walletAddress,
  slippage = 1,
  marketContext,
  deps = {},
}) {
  const {
    multiread: _multiread = multiread,
    getChainId: _getChainId = getChainId,
  } = deps;
  const marketId = BigInt(market);
  const outcomeIndex = Number.parseInt(outcome, 10);
  const sharesFP = toFP64(shares);
  const slippagePct = Number.parseFloat(slippage);

  const [colRes, marketRes] = await _multiread([
    ["marketCollateralInfo", [marketId]],
    ["markets", [marketId]],
  ]);
  const [, , colSymbol, colDecimals] = colRes;
  const dec = Number(colDecimals);
  const minRaw = toRaw((Number.parseFloat(min) * (1 - slippagePct / 100)).toFixed(dec), dec);

  const [, , , , outcomesRaw, , , , , endTs] = marketRes;
  if (Date.now() / 1000 > Number(endTs)) {
    throw new Error("Market has ended.");
  }

  const outs = outcomes(outcomesRaw);
  const label = outs[outcomeIndex - 1] ?? `Outcome ${outcomeIndex}`;
  const chainId = _getChainId();
  const funder = normalizeEvmChecksumAddress(walletAddress, "wallet_address");

  const transactions = [{
    step: "sell",
    to: MASTER_ADDRESS,
    value: "0",
    data: encodeFunctionData({
      abi: ABI,
      functionName: "marketSell",
      args: [marketId, BigInt(outcomeIndex), sharesFP, minRaw],
    }),
    chainId,
  }];

  return buildTradeIntent({
    action: "sell",
    chainId,
    market,
    marketContext,
    outcome: outcomeIndex,
    shares: String(shares),
    min: String(min),
    slippage: String(slippagePct),
    walletAddress: funder,
    label,
    colSymbol,
    transactions,
  });
}

function buildTradeIntent(fields) {
  const onChainMarketId = String(fields.market);
  const precogApiMarketId = fields.marketContext?.precog_api_market_id;
  return {
    intent_type: "forecastos.precog_trade",
    action: fields.action,
    chain_id: fields.chainId,
    precog_api_market_id: precogApiMarketId ?? onChainMarketId,
    on_chain_market_id: onChainMarketId,
    market_id: onChainMarketId,
    outcome: fields.outcome,
    shares: fields.shares,
    max: fields.max,
    min: fields.min,
    slippage: fields.slippage,
    wallet_address: fields.walletAddress,
    trade_summary: {
      label: fields.label,
      collateral_symbol: fields.colSymbol,
    },
    transactions: fields.transactions,
    next_action: "resolve_trade_with_wallet_adapter",
    wallet_adapter_hint: "Run adapters/wallets/<provider>/resolve_trade.mjs with this JSON as --input.",
  };
}
