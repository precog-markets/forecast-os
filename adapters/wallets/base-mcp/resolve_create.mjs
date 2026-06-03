#!/usr/bin/env node
// Maps a ForecastOS create intent into Base MCP signing guidance and returns
// Base Account EIP-712 signatures for ForecastOS submission.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeEvmChecksumAddress } from "../address_utils.mjs";

if (isMain(import.meta.url)) {
  try {
    const inputPath = argValue("--input");
    if (!inputPath) fail("base_mcp_resolve_create requires --input <prepare-create-intent-json>.");
    const walletAddress = argValue("--wallet-address");
    if (!walletAddress) fail("base_mcp_resolve_create requires --wallet-address <address> from Base MCP get_wallets.");
    const nonce = argValue("--nonce");
    if (!nonce) fail("base_mcp_resolve_create requires --nonce <next_pending_nonce>.");

    const input = JSON.parse((await readFile(inputPath, "utf8")).replace(/^\uFEFF/, ""));
    const result = resolveCreate({
      intent: input.result ?? input,
      walletAddress,
      walletId: argValue("--wallet-id"),
      nonce,
      creatorSignature: argValue("--creator-signature"),
      requestId: argValue("--request-id"),
    });
    print(result);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(serializeError(error), null, 2)}\n`);
    process.exit(1);
  }
}

export function resolveCreate({
  intent,
  walletAddress,
  walletId,
  nonce,
  creatorSignature,
  requestId,
} = {}) {
  validateIntent(intent);
  if (!walletAddress) fail("Base MCP create resolver requires walletAddress.");
  const checksummedWalletAddress = normalizeEvmChecksumAddress(walletAddress, "walletAddress");
  const typedData = buildCreateTypedData(intent.eip712_typed_data_template, checksummedWalletAddress, nonce);
  const chainId = Number(intent.chain_id ?? typedData.domain?.chainId);
  if (chainId !== 8453) fail(`Base MCP create resolver only supports Base chain 8453, received ${chainId}.`);

  const walletAudit = {
    provider: "base-mcp",
    wallet_id: walletId ?? checksummedWalletAddress,
    wallet_address: checksummedWalletAddress,
    policy_ids: [],
    chain_id: chainId,
    nonce: typedData.message.nonce,
    method: "sign",
    signature_compatibility: "base_account_eip1271_erc6492_supported_for_precog_create",
    request_id: requestId,
  };

  if (!creatorSignature) {
    return {
      status: "base_mcp_signature_required",
      base_mcp: {
        sign: {
          type: "typed_data",
          data: typedData,
        },
      },
      wallet_audit: walletAudit,
      notes: [
        "Request the Base MCP typed_data signature shown in base_mcp.sign.",
        "Base Account smart-account/WebAuthn signatures are valid Precog authorization signatures when signed over this canonical typed data and the current pending nonce.",
      ],
      next_action: "base_mcp_sign",
    };
  }

  assertHex(creatorSignature, "creatorSignature");

  return {
    event: withoutUndefined({
      image_url: intent.precog_payload_template?.image_url,
      category: intent.precog_payload_template?.category,
      creator_address: checksummedWalletAddress,
      creator_signature: creatorSignature,
      wallet_provider: "base-mcp",
      wallet_audit: walletAudit,
    }),
    creator_address: checksummedWalletAddress,
    creator_signature: creatorSignature,
    wallet_audit: walletAudit,
    next_action: "run_skill_step",
  };
}

export function buildCreateTypedData(template, account, nonce) {
  if (!template || typeof template !== "object") fail("Create intent missing eip712_typed_data_template.");
  const checksummedAccount = normalizeEvmChecksumAddress(account, "account");
  const primaryType = template.primaryType ?? template.primary_type;
  if (!primaryType) fail("Create intent typed data missing primaryType.");
  return {
    types: template.types,
    primaryType,
    domain: template.domain,
    message: {
      ...template.message,
      account: checksummedAccount,
      nonce: normalizeNonce(nonce ?? template.message?.nonce),
    },
  };
}

function validateIntent(intent) {
  if (!intent || typeof intent !== "object") fail("Base MCP create resolver requires a create intent object.");
  if (intent.intent_type !== "forecastos.create_market") {
    fail("Base MCP create resolver requires intent_type forecastos.create_market.");
  }
}

function normalizeNonce(value) {
  if (value === undefined || value === null || value === "" || value === "<next_pending_nonce>") {
    fail("Base MCP create typed data requires --nonce <next_pending_nonce>.");
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) fail("Nonce number must be a non-negative safe integer.");
    return value;
  }
  const raw = String(value).trim();
  if (/^0x[0-9a-fA-F]+$/.test(raw)) return Number.parseInt(raw.slice(2), 16);
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);
  fail("Nonce must be a non-negative integer or hex string.");
}

function assertHex(value, label) {
  if (!/^0x[0-9a-fA-F]*$/.test(String(value ?? ""))) fail(`${label} must be hex data.`);
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

function fail(message, code = "FORECASTOS_BASE_MCP_RESOLVE_CREATE_ERROR") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function serializeError(error) {
  return withoutUndefined({
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    code: error?.code,
  });
}
