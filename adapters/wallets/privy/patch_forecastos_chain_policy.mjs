#!/usr/bin/env node
// Adds missing ForecastOS typed-data ALLOW rules to Privy wallet policies.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractAllowedTypedDataChainIds } from "./resolve_create.mjs";
import {
  buildSendTransactionAllowRule,
  buildTypedDataAllowRule,
  policyAllowsSendTransaction,
  requireSupportedForecastOSChain,
} from "./policy_rules.mjs";

const PRIVY_API_ROOT = "https://api.privy.io/v1";

if (isMain(import.meta.url)) {
  try {
    const result = await patchForecastOSChainPolicy({
      walletId: argValue("--wallet-id") ?? process.env.PRIVY_WALLET_ID,
      chainId: argValue("--chain-id"),
      confirm: process.argv.includes("--confirm"),
      includeSendTransaction: process.argv.includes("--include-send-transaction"),
      env: process.env,
      fetch: globalThis.fetch,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(serializeError(error), null, 2)}\n`);
    process.exit(1);
  }
}

export async function patchForecastOSChainPolicy({
  walletId,
  chainId,
  confirm = false,
  includeSendTransaction = false,
  env = process.env,
  fetch = globalThis.fetch,
} = {}) {
  if (!confirm) {
    fail(
      "Refusing to mutate Privy policy without --confirm. Re-run with --confirm after operator approval.",
      "PRIVY_POLICY_PATCH_CONFIRMATION_REQUIRED",
    );
  }
  if (!walletId) fail("patch_forecastos_chain_policy requires --wallet-id or PRIVY_WALLET_ID.");
  if (chainId === undefined || chainId === null || chainId === "") {
    fail("patch_forecastos_chain_policy requires --chain-id (8453 or 42161).");
  }
  if (typeof fetch !== "function") fail("Fetch API is not available in this runtime.");

  const normalizedChainId = requireSupportedForecastOSChain(chainId);
  const auth = buildPrivyAuth(env);
  const wallet = await readPrivyWallet(fetch, auth, walletId);
  const policyIds = wallet.policy_ids ?? [];
  if (!policyIds.length) {
    fail(`Privy wallet ${walletId} has no attached policies.`);
  }

  const addedRules = [];
  const skippedPolicies = [];

  for (const policyId of policyIds) {
    const policy = await readPrivyPolicy(fetch, auth, policyId);
    const { chainIds, hasUnrestrictedRule } = extractAllowedTypedDataChainIds([policy]);
    const chainCovered =
      hasUnrestrictedRule ||
      chainIds.includes(String(normalizedChainId)) ||
      chainIds.includes(String(Number(normalizedChainId)));

    if (chainCovered && (!includeSendTransaction || policyAllowsSendTransaction([policy]))) {
      skippedPolicies.push({
        policy_id: policyId,
        reason: chainCovered ? "typed_data_chain_already_allowed" : "send_transaction_already_allowed",
        allowed_chain_ids: chainIds,
        has_unrestricted_rule: hasUnrestrictedRule,
      });
      continue;
    }

    if (!chainCovered) {
      const rule = buildTypedDataAllowRule(normalizedChainId);
      const created = await addPolicyRule(fetch, auth, policyId, rule);
      addedRules.push({
        policy_id: policyId,
        rule_type: "eth_signTypedData_v4",
        chain_id: normalizedChainId,
        rule: created.rule ?? rule,
      });
    }

    if (includeSendTransaction && !policyAllowsSendTransaction([policy])) {
      const sendRule = buildSendTransactionAllowRule(normalizedChainId);
      const created = await addPolicyRule(fetch, auth, policyId, sendRule);
      addedRules.push({
        policy_id: policyId,
        rule_type: "eth_sendTransaction",
        chain_id: normalizedChainId,
        rule: created.rule ?? sendRule,
      });
    }
  }

  const refreshedPolicies = [];
  for (const policyId of policyIds) {
    refreshedPolicies.push(await readPrivyPolicy(fetch, auth, policyId));
  }
  const { chainIds: allowedChainIdsAfter, hasUnrestrictedRule } =
    extractAllowedTypedDataChainIds(refreshedPolicies);

  return {
    ok: true,
    wallet_id: walletId,
    chain_id: normalizedChainId,
    policy_ids: policyIds,
    added_rules: addedRules,
    skipped_policies: skippedPolicies,
    allowed_chain_ids_after: allowedChainIdsAfter,
    has_unrestricted_rule: hasUnrestrictedRule,
    supports_target_chain:
      hasUnrestrictedRule ||
      allowedChainIdsAfter.includes(String(normalizedChainId)) ||
      allowedChainIdsAfter.includes(String(Number(normalizedChainId))),
  };
}

function buildPrivyAuth(env) {
  const appId = env.PRIVY_APP_ID;
  const appSecret = env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    fail("Privy credentials are required: set PRIVY_APP_ID and PRIVY_APP_SECRET.");
  }
  const basic = Buffer.from(`${appId}:${appSecret}`, "utf8").toString("base64");
  return {
    headers: {
      Authorization: `Basic ${basic}`,
      "privy-app-id": appId,
      "Content-Type": "application/json",
    },
  };
}

async function readPrivyWallet(fetch, auth, walletId) {
  const endpoint = `${PRIVY_API_ROOT}/wallets/${walletId}`;
  const response = await fetch(endpoint, { method: "GET", headers: auth.headers });
  const body = await readJsonResponse(response);
  if (!response.ok) fail(`Privy wallet read failed (${response.status}).`, "PRIVY_API_REQUEST_FAILED");
  return body;
}

async function readPrivyPolicy(fetch, auth, policyId) {
  const endpoint = `${PRIVY_API_ROOT}/policies/${policyId}`;
  const response = await fetch(endpoint, { method: "GET", headers: auth.headers });
  const body = await readJsonResponse(response);
  if (!response.ok) fail(`Privy policy read failed for ${policyId} (${response.status}).`, "PRIVY_API_REQUEST_FAILED");
  return body;
}

async function addPolicyRule(fetch, auth, policyId, rule) {
  const endpoint = `${PRIVY_API_ROOT}/policies/${policyId}/rules`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: auth.headers,
    body: JSON.stringify(rule),
  });
  const body = await readJsonResponse(response);
  if (!response.ok) {
    const error = new Error(`Privy policy rule create failed for ${policyId}: ${response.status}`);
    error.code = "PRIVY_POLICY_PATCH_FAILED";
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return { rule: body };
}

async function readJsonResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isMain(url) {
  return process.argv[1] && resolve(fileURLToPath(url)) === resolve(process.argv[1]);
}

function fail(message, code = "PRIVY_POLICY_PATCH_ERROR") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function serializeError(error) {
  return Object.fromEntries(
    Object.entries({
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
      code: error?.code,
      status: error?.status,
      body: error?.body,
    }).filter(([, value]) => value !== undefined),
  );
}
