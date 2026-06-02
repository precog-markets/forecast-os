#!/usr/bin/env node
// Maps a ForecastOS funding intent plus prepared calldata into Base MCP wallet actions.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_HEX = "0x2105";

if (isMain(import.meta.url)) {
  try {
    const inputPath = argValue("--input");
    const preparePath = argValue("--prepare-response");
    const walletAddress = argValue("--wallet-address");
    if (!inputPath) fail("base_mcp_resolve_funding requires --input <prepare-funding-intent-json>.");
    if (!preparePath) fail("base_mcp_resolve_funding requires --prepare-response <unsigned-calldata-json>.");
    if (!walletAddress) fail("base_mcp_resolve_funding requires --wallet-address <address> from Base MCP get_wallets.");

    const intent = readWrappedJson(await readFile(inputPath, "utf8"));
    const prepareResponse = readWrappedJson(await readFile(preparePath, "utf8"));
    const result = resolveFunding({
      intent,
      prepareResponse,
      walletAddress,
      walletId: argValue("--wallet-id"),
      nonce: argValue("--nonce"),
      funderSignature: argValue("--funder-signature"),
      txHash: argValue("--tx-hash"),
    });
    print(result);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(serializeError(error), null, 2)}\n`);
    process.exit(1);
  }
}

export function resolveFunding({
  intent,
  prepareResponse,
  walletAddress,
  walletId,
  nonce,
  funderSignature,
  txHash,
} = {}) {
  validateFundingIntent(intent);
  assertAddress(walletAddress, "walletAddress");
  const chain = chainNameFor(intent.chain_id ?? intent.eip712_typed_data_template?.domain?.chainId);
  const transactions = normalizePreparedTransactions(prepareResponse, chain);
  const sendCalls = buildSendCallsRequest(transactions, chain);
  const hasTxHash = Boolean(txHash);
  const typedData = hasTxHash || funderSignature
    ? buildFundingTypedData(intent.eip712_typed_data_template, walletAddress, nonce)
    : null;
  const walletAudit = withoutUndefined({
    provider: "base-mcp",
    wallet_id: walletId ?? walletAddress,
    wallet_address: walletAddress,
    policy_ids: [],
    chain_id: BASE_CHAIN_ID,
    nonce: typedData?.message?.nonce,
    method: hasTxHash ? "base_mcp_post_tx_sign" : "base_mcp_send_calls",
    signature_compatibility: "base_account_eip1271_erc6492_supported_for_precog_funding_post_tx_nonce",
    typed_data_primary_type: typedData?.primaryType,
    transaction_steps: transactions.map((tx) => tx.step).filter(Boolean),
  });

  if (!txHash) {
    return {
      status: "base_mcp_send_calls_required",
      base_mcp: {
        onboarding_required: ["get_wallets", "present_wallet_status_and_disclaimer"],
        send_calls: sendCalls,
      },
      wallet_audit: walletAudit,
      notes: [
        "Run Base MCP send_calls first with the prepared unsigned funding calldata.",
        "After Base MCP returns tx_hash, fetch the wallet's new pending nonce and run this resolver again with --tx-hash and --nonce to request the FUND_UPCOMING_MARKET signature.",
      ],
      next_action: "base_mcp_send_calls",
    };
  }

  assertHex(txHash, "txHash");

  const baseMcp = {
    onboarding_required: ["get_wallets", "present_wallet_status_and_disclaimer"],
    sign: {
      method: "sign",
      signature_method: "eip712_typed_data",
      typed_data: typedData,
    },
    send_calls: sendCalls,
  };

  if (!funderSignature) {
    return {
      status: "base_mcp_post_tx_signature_required",
      base_mcp: {
        onboarding_required: baseMcp.onboarding_required,
        sign: baseMcp.sign,
      },
      wallet_audit: walletAudit,
      funding_request_template: {
        upcoming_market: intent.upcoming_market,
        amount: intent.amount,
        tx_hash: txHash,
        funder_address: walletAddress,
        funder_signature: "<signature_from_base_mcp_post_tx_sign>",
      },
      notes: [
        "Sign FUND_UPCOMING_MARKET after the funding transaction hash exists, using the post-transaction pending nonce.",
        "Do not reuse a signature collected before send_calls changed the wallet nonce.",
      ],
      next_action: "base_mcp_post_tx_sign",
    };
  }

  assertHex(funderSignature, "funderSignature");

  return {
    funding_request: {
      upcoming_market: intent.upcoming_market,
      amount: intent.amount,
      tx_hash: txHash,
      funder_address: walletAddress,
      funder_signature: funderSignature,
    },
    wallet_audit: walletAudit,
    base_mcp: baseMcp,
    next_action: "fund_market",
  };
}

export function buildFundingTypedData(template, account, nonce) {
  if (!template || typeof template !== "object") fail("Funding intent missing eip712_typed_data_template.");
  assertAddress(account, "account");
  const primaryType = template.primaryType ?? template.primary_type;
  if (!primaryType) fail("Funding intent typed data missing primaryType.");
  return {
    types: template.types,
    primaryType,
    domain: template.domain,
    message: {
      ...template.message,
      account,
      nonce: normalizeNonce(nonce ?? template.message?.nonce),
    },
  };
}

export function normalizePreparedTransactions(response, expectedChain = "base") {
  const body = response?.result ?? response;
  const source = body?.data && body.data.to && body.data.data ? body.data : body;
  const rawTransactions = Array.isArray(source?.transactions)
    ? source.transactions
    : Array.isArray(source?.calls)
      ? source.calls
      : source?.to && source?.data
        ? [source]
        : null;

  if (!rawTransactions?.length) {
    fail("Base MCP funding requires a prepared unsigned calldata envelope or transactions[] batch.");
  }

  return rawTransactions.map((tx, index) => normalizeTransaction(tx, index, expectedChain));
}

export function buildSendCallsRequest(transactions, chain = "base") {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    fail("buildSendCallsRequest requires at least one transaction.");
  }
  return {
    chain,
    calls: transactions.map((tx) => ({
      to: tx.to,
      value: tx.value,
      data: tx.data,
    })),
  };
}

function normalizeTransaction(tx, index, expectedChain) {
  if (!tx || typeof tx !== "object") fail(`Prepared transaction ${index} must be an object.`);
  const chain = tx.chain ? normalizeChainName(tx.chain) : chainNameFor(tx.chainId ?? tx.chain_id ?? BASE_CHAIN_ID);
  if (chain !== expectedChain) {
    fail(`Prepared transaction ${index} targets ${chain}; expected ${expectedChain}.`);
  }
  const to = tx.to ?? tx.target;
  const data = tx.data ?? tx.calldata;
  assertAddress(to, `transactions[${index}].to`);
  assertHex(data, `transactions[${index}].data`);
  return withoutUndefined({
    step: tx.step,
    to,
    value: normalizeValue(tx.value),
    data,
    chainId: BASE_CHAIN_ID,
  });
}

function validateFundingIntent(intent) {
  if (!intent || typeof intent !== "object") fail("Base MCP funding resolver requires a funding intent object.");
  if (intent.intent_type !== "forecastos.fund_market") {
    fail("Base MCP funding resolver requires intent_type forecastos.fund_market.");
  }
  if (!intent.upcoming_market && intent.upcoming_market !== 0) fail("Funding intent missing upcoming_market.");
  if (!/^(?:0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(?:\.[0-9]+)?)$/.test(String(intent.amount ?? ""))) {
    fail("Funding intent amount must be a positive Precog display-unit decimal string.");
  }
  const chain = chainNameFor(intent.chain_id ?? intent.eip712_typed_data_template?.domain?.chainId);
  if (chain !== "base") fail(`Base MCP funding resolver only supports base, received ${chain}.`);
}

function chainNameFor(value) {
  if (value === undefined || value === null || value === "") fail("Missing chain id for Base MCP funding.");
  const raw = String(value).toLowerCase();
  if (raw === "base" || raw === String(BASE_CHAIN_ID) || raw === BASE_CHAIN_HEX) return "base";
  fail(`Unsupported Base MCP chain id ${value}.`);
}

function normalizeChainName(value) {
  const chain = String(value ?? "").trim().toLowerCase();
  if (chain === "base") return "base";
  fail(`Unsupported Base MCP chain ${value}.`);
}

function normalizeValue(value) {
  if (value === undefined || value === null || value === "") return "0x0";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) fail("Transaction value number must be a non-negative safe integer.");
    return `0x${value.toString(16)}`;
  }
  const raw = String(value);
  if (/^0x[0-9a-fA-F]+$/.test(raw)) return raw;
  if (/^(?:0|[1-9]\d*)$/.test(raw)) return `0x${BigInt(raw).toString(16)}`;
  fail("Transaction value must be a hex or non-negative integer string.");
}

function normalizeNonce(value) {
  if (value === undefined || value === null || value === "" || value === "<next_pending_nonce>") {
    fail("Base MCP funding typed data requires --nonce <next_pending_nonce>.");
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) fail("Nonce number must be a non-negative safe integer.");
    return value;
  }
  const raw = String(value);
  if (/^0x[0-9a-fA-F]+$/.test(raw)) return Number.parseInt(raw.slice(2), 16);
  if (/^(?:0|[1-9]\d*)$/.test(raw)) return Number(raw);
  fail("Nonce must be a non-negative integer or hex string.");
}

function assertAddress(value, label) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(value ?? ""))) fail(`${label} must be an EVM address.`);
}

function assertHex(value, label) {
  if (!/^0x[0-9a-fA-F]*$/.test(String(value ?? ""))) fail(`${label} must be hex data.`);
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
  error.code = "FORECASTOS_BASE_MCP_RESOLVE_FUNDING_ERROR";
  throw error;
}

function serializeError(error) {
  return withoutUndefined({
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    code: error?.code,
  });
}

