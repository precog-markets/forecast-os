#!/usr/bin/env node
// Resolves a ForecastOS create intent with a Privy EVM wallet.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PRIVY_API_ROOT = "https://api.privy.io/v1";
const DEFAULT_BASE_RPC_URL = "https://mainnet.base.org";

if (isMain(import.meta.url)) {
  try {
    const inputPath = argValue("--input");
    if (!inputPath) fail("privy_resolve_create requires --input <intent-json>.");
    const input = JSON.parse((await readFile(inputPath, "utf8")).replace(/^\uFEFF/, ""));
    const result = await resolveCreate({
      intent: input.result ?? input,
      walletId: argValue("--wallet-id"),
      walletAddress: argValue("--wallet-address"),
      rpcUrl: argValue("--rpc-url") ?? process.env.FORECASTOS_BASE_RPC_URL ?? process.env.BASE_RPC_URL,
      env: process.env,
      fetch: globalThis.fetch,
    });
    print(result);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(serializeError(error), null, 2)}\n`);
    process.exit(1);
  }
}

export async function resolveCreate({
  intent,
  walletId,
  walletAddress,
  rpcUrl,
  env = process.env,
  fetch = globalThis.fetch,
} = {}) {
  if (!intent || typeof intent !== "object") fail("Privy create resolver requires a create intent object.");
  if (intent.intent_type !== "forecastos.create_market") {
    fail("Privy create resolver requires intent_type forecastos.create_market.");
  }
  if (typeof fetch !== "function") fail("Fetch API is not available in this runtime.");

  const auth = buildPrivyAuth(env);
  const wallets = await listEthereumWallets(fetch, auth);
  const { eligibleWallets, diagnostics } = await walletsWithPolicyCapabilities(fetch, auth, wallets);
  const selected = selectWallet(eligibleWallets, { walletId, walletAddress, diagnostics });
  const creatorAddress = selected.address;
  const chainId = intent.chain_id ?? intent.eip712_typed_data_template?.domain?.chainId;
  if (Number(chainId) !== 8453) {
    fail(`Privy create resolver currently supports Base chain 8453, received ${chainId}.`);
  }
  const nonce = await fetchPendingNonce(fetch, rpcUrl ?? DEFAULT_BASE_RPC_URL, creatorAddress);
  const typedData = buildCreateTypedData(intent.eip712_typed_data_template, creatorAddress, nonce);
  const signature = await signTypedData(fetch, auth, selected.id, typedData);

  return {
    event: withoutUndefined({
      image_url: intent.precog_payload_template?.image_url,
      category: intent.precog_payload_template?.category,
      creator_address: creatorAddress,
      creator_signature: signature,
      wallet_provider: "privy",
      wallet_audit: {
        provider: "privy",
        wallet_id: selected.id,
        wallet_address: creatorAddress,
        policy_ids: selected.policy_ids ?? [],
        chain_id: Number(chainId),
        nonce,
        method: "eth_signTypedData_v4",
        typed_data_primary_type: typedData.primary_type,
      },
    }),
    creator_address: creatorAddress,
    creator_signature: signature,
    wallet: {
      provider: "privy",
      id: selected.id,
      address: creatorAddress,
      policy_ids: selected.policy_ids ?? [],
    },
    nonce,
    chain_id: Number(chainId),
    next_action: "run_skill_step",
  };
}

export const resolvePrivyCreate = resolveCreate;

export function buildCreateTypedData(template, account, nonce) {
  if (!template || typeof template !== "object") fail("Create intent missing eip712_typed_data_template.");
  const primaryType = template.primaryType ?? template.primary_type;
  if (!primaryType) fail("Create intent typed data missing primaryType.");
  return {
    types: template.types,
    primary_type: primaryType,
    domain: template.domain,
    message: {
      ...template.message,
      account,
      nonce,
    },
  };
}

export const buildPrivyTypedData = buildCreateTypedData;

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
  const response = await fetch(endpoint, {
    method: "GET",
    headers: auth.headers,
  });
  const body = await readJsonResponse(response);
  if (!response.ok) throw buildPrivyApiError("Privy wallet list failed", response, endpoint, body);
  return Array.isArray(body.data) ? body.data : [];
}

async function walletsWithPolicyCapabilities(fetch, auth, wallets) {
  const eligibleWallets = [];
  const diagnostics = {
    total_wallets: wallets.length,
    checked_wallets: [],
    policy_read_failures: [],
  };
  for (const wallet of wallets) {
    const policies = [];
    for (const policyId of wallet.policy_ids ?? []) {
      const result = await readPolicy(fetch, auth, policyId);
      if (result.ok) {
        policies.push(result.policy);
      } else {
        diagnostics.policy_read_failures.push({
          wallet_id: wallet.id,
          policy_id: policyId,
          status: result.status,
          endpoint: result.endpoint,
          body: result.body,
        });
      }
    }
    const methods = policies
      .flatMap((policy) => policy.rules ?? [])
      .filter((rule) => String(rule.action ?? "").toUpperCase() === "ALLOW")
      .map((rule) => rule.method);
    diagnostics.checked_wallets.push({
      wallet_id: wallet.id,
      address: wallet.address,
      policy_ids: wallet.policy_ids ?? [],
      allow_methods: [...new Set(methods)].sort(),
    });
    if (allowsMethod(methods, "eth_signTypedData_v4") && allowsMethod(methods, "eth_sendTransaction")) {
      eligibleWallets.push({ ...wallet, policies });
    }
  }
  return { eligibleWallets, diagnostics };
}

async function readPolicy(fetch, auth, policyId) {
  const endpoint = `${PRIVY_API_ROOT}/policies/${policyId}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: auth.headers,
  });
  const body = await readJsonResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      endpoint,
      body: summarizeBody(body),
    };
  }
  return { ok: true, policy: body };
}

function selectWallet(wallets, { walletId, walletAddress, diagnostics } = {}) {
  let filtered = wallets;
  if (walletId) filtered = filtered.filter((wallet) => wallet.id === walletId);
  if (walletAddress) {
    filtered = filtered.filter((wallet) => sameAddress(wallet.address, walletAddress));
  }
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 0) {
    const error = new Error("No Privy Ethereum wallet with ALLOW eth_signTypedData_v4 and eth_sendTransaction policy permissions matched the selector.");
    error.code = "PRIVY_WALLET_SELECTION_REQUIRED";
    error.wallet_diagnostics = diagnostics;
    throw error;
  }
  const choices = filtered.map((wallet) => ({
    wallet_id: wallet.id,
    address: wallet.address,
    policy_ids: wallet.policy_ids ?? [],
  }));
  const error = new Error("Multiple Privy wallets can sign typed data. Select one with --wallet-id or --wallet-address.");
  error.code = "PRIVY_WALLET_SELECTION_REQUIRED";
  error.wallets = choices;
  throw error;
}

async function fetchPendingNonce(fetch, rpcUrl, address) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionCount",
      params: [address, "pending"],
    }),
  });
  const body = await readJsonResponse(response);
  if (!response.ok || body.error) fail(`Base RPC nonce lookup failed: ${response.status}`);
  return Number.parseInt(String(body.result ?? "0x0").replace(/^0x/, ""), 16);
}

async function signTypedData(fetch, auth, walletId, typedData) {
  const endpoint = `${PRIVY_API_ROOT}/wallets/${walletId}/rpc`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: auth.headers,
    body: JSON.stringify({
      method: "eth_signTypedData_v4",
      params: {
        typed_data: typedData,
      },
    }),
  });
  const body = await readJsonResponse(response);
  if (!response.ok) throw buildPrivyApiError("Privy typed-data signing failed", response, endpoint, body);
  const signature = body.data?.signature ?? body.data?.result ?? body.signature ?? body.result;
  if (!signature) fail("Privy typed-data signing response did not include a signature.");
  return signature;
}

async function readJsonResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function sameAddress(left, right) {
  return String(left ?? "").toLowerCase() === String(right ?? "").toLowerCase();
}

function allowsMethod(methods, method) {
  return methods.includes(method) || methods.includes("*");
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
  error.code = "FORECASTOS_PRIVY_RESOLVE_CREATE_ERROR";
  throw error;
}

function buildPrivyApiError(message, response, endpoint, body) {
  const error = new Error(`${message}: ${response.status}`);
  error.code = "PRIVY_API_REQUEST_FAILED";
  error.status = response.status;
  error.endpoint = endpoint;
  error.body = summarizeBody(body);
  return error;
}

function summarizeBody(body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function serializeError(error) {
  return withoutUndefined({
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    code: error?.code,
    status: error?.status,
    endpoint: error?.endpoint,
    body: error?.body,
    wallets: error?.wallets,
    wallet_diagnostics: error?.wallet_diagnostics,
  });
}
