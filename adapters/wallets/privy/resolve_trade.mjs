#!/usr/bin/env node
// Submits a prepared Precog trade intent via Privy eth_sendTransaction (no local private key).
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeEvmChecksumAddress } from "../address_utils.mjs";
import { policyAllowsSendTransaction } from "./policy_rules.mjs";

const PRIVY_API_ROOT = "https://api.privy.io/v1";
const SUPPORTED_CHAIN_IDS = new Set([8453, 42161]);

if (isMain(import.meta.url)) {
  try {
    const inputPath = argValue("--input");
    if (!inputPath) fail("privy_resolve_trade requires --input <prepare-trade-intent-json>.");
    const tradeIntent = readWrappedJson(await readFile(inputPath, "utf8"));
    const result = await resolveTrade({
      tradeIntent,
      walletId: argValue("--wallet-id"),
      walletAddress: argValue("--wallet-address"),
      env: process.env,
      fetch: globalThis.fetch,
    });
    print(result);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(serializeError(error), null, 2)}\n`);
    process.exit(1);
  }
}

export async function resolveTrade({
  tradeIntent,
  walletId,
  walletAddress,
  env = process.env,
  fetch = globalThis.fetch,
} = {}) {
  validateTradeIntent(tradeIntent);
  if (typeof fetch !== "function") fail("Fetch API is not available in this runtime.");

  const chainId = requireSupportedTradeChain(tradeIntent.chain_id);
  const auth = buildPrivyAuth(env);
  const wallets = await listEthereumWallets(fetch, auth);
  const { eligibleWallets, diagnostics } = await walletsWithSendCapability(fetch, auth, wallets);
  const selected = selectWallet(eligibleWallets, { walletId, walletAddress, diagnostics });
  const signerAddress = normalizeEvmChecksumAddress(selected.address, "wallet_address");
  const transactions = normalizeTradeTransactions(tradeIntent, chainId);

  const submissions = [];
  for (const [index, transaction] of transactions.entries()) {
    const step = transaction.step ?? `step ${index + 1}`;
    const txHash = await sendTransaction(fetch, auth, selected.id, transaction, chainId);
    submissions.push({ step, transactionHash: txHash });
  }

  const finalSubmission = submissions.at(-1);
  return {
    status: "submitted",
    action: tradeIntent.action,
    market_id: tradeIntent.market_id,
    outcome: tradeIntent.outcome,
    shares: tradeIntent.shares,
    wallet_address: signerAddress,
    transaction_hash: finalSubmission.transactionHash,
    wallet_audit: withoutUndefined({
      provider: "privy",
      wallet_id: selected.id,
      wallet_address: signerAddress,
      policy_ids: selected.policy_ids ?? [],
      chain_id: chainId,
      method: "eth_sendTransaction",
      transaction_steps: transactions.map((tx) => tx.step).filter(Boolean),
      transaction_hashes: submissions.map((submission) => submission.transactionHash),
    }),
    privy: {
      submitted_transaction_hashes: submissions.map((submission) => submission.transactionHash),
    },
    next_action: "trade_complete",
  };
}

export const resolvePrivyTrade = resolveTrade;

function validateTradeIntent(intent) {
  if (!intent || typeof intent !== "object") fail("Privy trade resolver requires a trade intent object.");
  if (intent.intent_type !== "forecastos.precog_trade") {
    fail("Privy trade resolver requires intent_type forecastos.precog_trade.");
  }
  if (!intent.market_id && intent.market_id !== 0) fail("Trade intent missing market_id.");
  if (!intent.action || !["buy", "sell", "redeem"].includes(intent.action)) {
    fail('Trade intent action must be "buy", "sell", or "redeem".');
  }
}

function requireSupportedTradeChain(value) {
  const chainId = Number(value);
  if (SUPPORTED_CHAIN_IDS.has(chainId)) return chainId;
  fail(`Privy trade resolver supports Base (8453) and Arbitrum (42161), received ${value}.`);
}

function normalizeTradeTransactions(intent, chainId) {
  const rawTransactions = intent.transactions;
  if (!Array.isArray(rawTransactions) || rawTransactions.length === 0) {
    fail("Trade intent missing transactions[].");
  }
  return rawTransactions.map((tx, index) => {
    const to = tx.to ?? tx.target;
    const data = tx.data ?? tx.calldata;
    assertAddress(to, `transactions[${index}].to`);
    assertHex(data, `transactions[${index}].data`);
    const txChainId = Number(tx.chainId ?? tx.chain_id ?? chainId);
    if (txChainId !== chainId) {
      fail(`Prepared transaction ${index} targets chain ${txChainId}; expected ${chainId}.`);
    }
    return {
      step: tx.step,
      to,
      data,
      value: normalizeValue(tx.value),
    };
  });
}

function buildPrivyAuth(env) {
  const appId = env.PRIVY_APP_ID;
  const appSecret = env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    fail("Privy credentials are required: set PRIVY_APP_ID and PRIVY_APP_SECRET.");
  }
  const basic = Buffer.from(`${appId}:${appSecret}`, "utf8").toString("base64");
  return {
    appId,
    headers: {
      Authorization: `Basic ${basic}`,
      "privy-app-id": appId,
      "Content-Type": "application/json",
    },
  };
}

async function listEthereumWallets(fetch, auth) {
  const endpoint = `${PRIVY_API_ROOT}/wallets?chain_type=ethereum&limit=100`;
  const response = await fetch(endpoint, { method: "GET", headers: auth.headers });
  const body = await readJsonResponse(response);
  if (!response.ok) fail(`Privy wallet list failed: ${response.status}`);
  return Array.isArray(body.data) ? body.data : [];
}

async function walletsWithSendCapability(fetch, auth, wallets) {
  const eligibleWallets = [];
  const diagnostics = { total_wallets: wallets.length, checked_wallets: [], policy_read_failures: [] };
  for (const wallet of wallets) {
    const policies = [];
    for (const policyId of wallet.policy_ids ?? []) {
      const result = await readPolicy(fetch, auth, policyId);
      if (result.ok) policies.push(result.policy);
      else diagnostics.policy_read_failures.push({ wallet_id: wallet.id, policy_id: policyId, status: result.status });
    }
    const allowsSend = policyAllowsSendTransaction(policies);
    diagnostics.checked_wallets.push({
      wallet_id: wallet.id,
      address: wallet.address,
      policy_ids: wallet.policy_ids ?? [],
      allows_send_transaction: allowsSend,
    });
    if (allowsSend) eligibleWallets.push({ ...wallet, policies });
  }
  return { eligibleWallets, diagnostics };
}

async function readPolicy(fetch, auth, policyId) {
  const endpoint = `${PRIVY_API_ROOT}/policies/${policyId}`;
  const response = await fetch(endpoint, { method: "GET", headers: auth.headers });
  const body = await readJsonResponse(response);
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, policy: body };
}

function selectWallet(wallets, { walletId, walletAddress, diagnostics } = {}) {
  let filtered = wallets;
  if (walletId) filtered = filtered.filter((wallet) => wallet.id === walletId);
  if (walletAddress) filtered = filtered.filter((wallet) => sameAddress(wallet.address, walletAddress));
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 0) {
    const error = new Error("No Privy Ethereum wallet with ALLOW eth_sendTransaction policy permissions matched the selector.");
    error.code = "PRIVY_WALLET_SELECTION_REQUIRED";
    error.wallet_diagnostics = diagnostics;
    throw error;
  }
  const error = new Error("Multiple Privy wallets can send transactions. Select one with --wallet-id or --wallet-address.");
  error.code = "PRIVY_WALLET_SELECTION_REQUIRED";
  error.wallets = filtered.map((wallet) => ({
    wallet_id: wallet.id,
    address: wallet.address,
    policy_ids: wallet.policy_ids ?? [],
  }));
  throw error;
}

async function sendTransaction(fetch, auth, walletId, transaction, chainId) {
  const endpoint = `${PRIVY_API_ROOT}/wallets/${walletId}/rpc`;
  const body = {
    method: "eth_sendTransaction",
    caip2: `eip155:${chainId}`,
    params: {
      transaction: {
        to: transaction.to,
        data: transaction.data,
        value: toHexValue(transaction.value),
        chain_id: chainId,
      },
    },
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: auth.headers,
    body: JSON.stringify(body),
  });
  const result = await readJsonResponse(response);
  if (!response.ok) {
    const error = new Error(`Privy eth_sendTransaction failed: ${response.status}`);
    error.code = "PRIVY_API_REQUEST_FAILED";
    error.status = response.status;
    error.body = summarizeBody(result);
    throw error;
  }
  const txHash = result.data?.hash ?? result.data?.transaction_hash ?? result.hash ?? result.result;
  if (!txHash) fail("Privy eth_sendTransaction response did not include a transaction hash.");
  assertHex(txHash, "Privy transaction hash");
  return txHash;
}

function toHexValue(value) {
  if (value === undefined || value === null || value === "" || value === "0") return "0x0";
  if (typeof value === "number") return `0x${BigInt(value).toString(16)}`;
  const raw = String(value);
  if (/^0x[0-9a-fA-F]+$/.test(raw)) return raw;
  if (/^(?:0|[1-9]\d*)$/.test(raw)) return `0x${BigInt(raw).toString(16)}`;
  fail("Transaction value must be a hex or non-negative integer string.");
}

function normalizeValue(value) {
  if (value === undefined || value === null || value === "") return "0";
  return String(value);
}

function assertAddress(value, label) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(value ?? ""))) fail(`${label} must be an EVM address.`);
}

function assertHex(value, label) {
  if (!/^0x[0-9a-fA-F]*$/.test(String(value ?? ""))) fail(`${label} must be hex data.`);
}

function sameAddress(left, right) {
  return String(left ?? "").toLowerCase() === String(right ?? "").toLowerCase();
}

function readWrappedJson(text) {
  const parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  return parsed.result ?? parsed;
}

async function readJsonResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function summarizeBody(body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
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
  error.code = "FORECASTOS_PRIVY_RESOLVE_TRADE_ERROR";
  throw error;
}

function serializeError(error) {
  return withoutUndefined({
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    code: error?.code,
    status: error?.status,
    body: error?.body,
    wallets: error?.wallets,
    wallet_diagnostics: error?.wallet_diagnostics,
  });
}
