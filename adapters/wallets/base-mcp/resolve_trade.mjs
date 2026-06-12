#!/usr/bin/env node
// Maps a prepared Precog trade intent into Base MCP send_calls (no local private key).
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeEvmChecksumAddress } from "../address_utils.mjs";
import {
  buildSendCallsRequest,
  normalizePreparedTransactions,
} from "./resolve_funding.mjs";

const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_HEX = "0x2105";

if (isMain(import.meta.url)) {
  try {
    const inputPath = argValue("--input");
    const walletAddress = argValue("--wallet-address");
    if (!inputPath) fail("base_mcp_resolve_trade requires --input <prepare-trade-intent-json>.");

    const tradeIntent = readWrappedJson(await readFile(inputPath, "utf8"));
    const result = resolveTrade({
      tradeIntent,
      walletAddress,
      walletId: argValue("--wallet-id"),
      txHashes: parseTxHashes(argValue("--tx-hashes")),
    });
    print(result);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(serializeError(error), null, 2)}\n`);
    process.exit(1);
  }
}

export function resolveTrade({
  tradeIntent,
  walletAddress,
  walletId,
  txHashes,
} = {}) {
  validateTradeIntent(tradeIntent);
  const chain = chainNameFor(tradeIntent.chain_id);
  const transactions = normalizePreparedTransactions(tradeIntent, chain);
  const sendCalls = buildSendCallsRequest(transactions, chain);
  const completed = Array.isArray(txHashes) && txHashes.length === transactions.length;
  const hasWallet = Boolean(walletAddress);

  if (!hasWallet && !completed) {
    return {
      status: "base_mcp_get_wallets_required",
      action: tradeIntent.action,
      market_id: tradeIntent.market_id,
      base_mcp: {
        onboarding_required: ["get_wallets", "present_wallet_status_and_disclaimer"],
        send_calls: sendCalls,
      },
      notes: [
        "Call Base MCP get_wallets and present_wallet_status_and_disclaimer before prepare_buy when allowance must be checked.",
        "Re-run this resolver with --wallet-address <address> to attach wallet audit metadata before send_calls.",
        "After send_calls confirm, re-run with --tx-hashes <hash1,hash2,...>.",
      ],
      next_action: "base_mcp_get_wallets",
    };
  }

  if (!hasWallet && completed) {
    fail("base_mcp_resolve_trade requires --wallet-address when recording submitted trade hashes.");
  }

  assertAddress(walletAddress, "walletAddress");
  const checksummedWalletAddress = normalizeEvmChecksumAddress(walletAddress, "walletAddress");

  if (!completed) {
    return {
      status: "base_mcp_send_calls_required",
      action: tradeIntent.action,
      market_id: tradeIntent.market_id,
      base_mcp: {
        onboarding_required: ["get_wallets", "present_wallet_status_and_disclaimer"],
        send_calls: sendCalls,
      },
      wallet_audit: withoutUndefined({
        provider: "base-mcp",
        wallet_id: walletId ?? checksummedWalletAddress,
        wallet_address: checksummedWalletAddress,
        policy_ids: [],
        chain_id: BASE_CHAIN_ID,
        method: "base_mcp_send_calls",
        transaction_steps: transactions.map((tx) => tx.step).filter(Boolean),
      }),
      notes: [
        "Run Base MCP send_calls with the prepared unsigned trade calldata.",
        "Re-run this resolver with --tx-hashes <hash1,hash2,...> after all calls confirm.",
      ],
      next_action: "base_mcp_send_calls",
    };
  }

  return {
    status: "submitted",
    action: tradeIntent.action,
    market_id: tradeIntent.market_id,
    outcome: tradeIntent.outcome,
    shares: tradeIntent.shares,
    wallet_address: checksummedWalletAddress,
    transaction_hashes: txHashes,
    wallet_audit: withoutUndefined({
      provider: "base-mcp",
      wallet_id: walletId ?? checksummedWalletAddress,
      wallet_address: checksummedWalletAddress,
      policy_ids: [],
      chain_id: BASE_CHAIN_ID,
      method: "base_mcp_send_calls",
      transaction_steps: transactions.map((tx) => tx.step).filter(Boolean),
      transaction_hashes: txHashes,
    }),
    base_mcp: {
      send_calls: sendCalls,
      submitted_transaction_hashes: txHashes,
    },
    next_action: "trade_complete",
  };
}

export const resolveBaseMcpTrade = resolveTrade;

function validateTradeIntent(intent) {
  if (!intent || typeof intent !== "object") fail("Base MCP trade resolver requires a trade intent object.");
  if (intent.intent_type !== "forecastos.precog_trade") {
    fail("Base MCP trade resolver requires intent_type forecastos.precog_trade.");
  }
  if (!intent.market_id && intent.market_id !== 0) fail("Trade intent missing market_id.");
  const chain = chainNameFor(intent.chain_id);
  if (chain !== "base") fail(`Base MCP trade resolver only supports Base mainnet (8453), received ${intent.chain_id}.`);
}

function chainNameFor(value) {
  if (value === undefined || value === null || value === "") fail("Missing chain id for Base MCP trade.");
  const raw = String(value).toLowerCase();
  if (raw === "base" || raw === String(BASE_CHAIN_ID) || raw === BASE_CHAIN_HEX) return "base";
  fail(`Unsupported Base MCP chain id ${value}.`);
}

function parseTxHashes(value) {
  if (!value) return undefined;
  return String(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}

function assertAddress(value, label) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(value ?? ""))) fail(`${label} must be an EVM address.`);
}

function readWrappedJson(text) {
  const parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  return parsed.result ?? parsed;
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isMain(url) {
  return process.argv[1] && resolve(fileURLToPath(url)) === resolve(process.argv[1]);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message) {
  const error = new Error(message);
  error.code = "FORECASTOS_BASE_MCP_RESOLVE_TRADE_ERROR";
  throw error;
}

function serializeError(error) {
  return withoutUndefined({
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    code: error?.code,
  });
}
