#!/usr/bin/env node
// Maps a ForecastOS create intent into Base MCP signing guidance and validates
// returned signatures before they are submitted to Precog.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  const typedData = buildCreateTypedData(intent.eip712_typed_data_template, walletAddress, nonce);
  const chainId = Number(intent.chain_id ?? typedData.domain?.chainId);
  if (chainId !== 8453) fail(`Base MCP create resolver only supports Base chain 8453, received ${chainId}.`);

  const walletAudit = {
    provider: "base-mcp",
    wallet_id: walletId ?? walletAddress,
    wallet_address: walletAddress,
    policy_ids: [],
    chain_id: chainId,
    nonce: typedData.message.nonce,
    method: "sign",
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
        "Only continue if Base MCP returns an EOA-style 65-byte EIP-712 signature. Current Base Account smart-account/WebAuthn signatures are not accepted by the Precog create endpoint.",
      ],
      next_action: "base_mcp_sign",
    };
  }

  if (!isEoaEip712Signature(creatorSignature)) {
    fail(
      "Base MCP returned a smart-account/WebAuthn signature, but the current Precog create endpoint requires an EOA-style 65-byte EIP-712 signature. Use Privy, another EOA-compatible wallet/action tool, or the Precog creation area for market creation.",
      "BASE_MCP_CREATE_SIGNATURE_UNSUPPORTED",
    );
  }

  return {
    event: withoutUndefined({
      image_url: intent.precog_payload_template?.image_url,
      category: intent.precog_payload_template?.category,
      creator_address: walletAddress,
      creator_signature: creatorSignature,
      wallet_provider: "base-mcp",
      wallet_audit: walletAudit,
    }),
    creator_address: walletAddress,
    creator_signature: creatorSignature,
    wallet_audit: walletAudit,
    next_action: "run_skill_step",
  };
}

export function buildCreateTypedData(template, account, nonce) {
  if (!template || typeof template !== "object") fail("Create intent missing eip712_typed_data_template.");
  const primaryType = template.primaryType ?? template.primary_type;
  if (!primaryType) fail("Create intent typed data missing primaryType.");
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

function isEoaEip712Signature(value) {
  return /^0x[0-9a-fA-F]{130}$/.test(String(value ?? ""));
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
