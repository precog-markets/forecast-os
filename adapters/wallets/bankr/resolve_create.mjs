#!/usr/bin/env node
// Resolves a ForecastOS create intent with the Bankr Wallet API.
import { readFile } from "node:fs/promises";
import {
  argValue,
  bankrApiRoot,
  buildBankrAuth,
  buildBankrTypedData,
  chainIdFor,
  fail,
  fetchPendingNonce,
  isEoaEip712Signature,
  isMain,
  print,
  readBankrWallet,
  readWrappedJson,
  serializeError,
  signTypedData,
  withoutUndefined,
} from "./common.mjs";

if (isMain(import.meta.url)) {
  try {
    const inputPath = argValue("--input");
    if (!inputPath) fail("bankr_resolve_create requires --input <prepare-create-intent-json>.");
    const intent = readWrappedJson(await readFile(inputPath, "utf8"));
    const result = await resolveCreate({
      intent,
      apiKey: argValue("--api-key"),
      apiRoot: argValue("--api-url"),
      walletAddress: argValue("--wallet-address"),
      nonce: argValue("--nonce"),
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
  apiKey,
  apiRoot,
  walletAddress,
  nonce,
  rpcUrl,
  env = process.env,
  fetch = globalThis.fetch,
} = {}) {
  if (!intent || typeof intent !== "object") fail("Bankr create resolver requires a create intent object.");
  if (intent.intent_type !== "forecastos.create_market") {
    fail("Bankr create resolver requires intent_type forecastos.create_market.");
  }
  if (typeof fetch !== "function") fail("Fetch API is not available in this runtime.");

  const chainId = chainIdFor(intent.chain_id ?? intent.eip712_typed_data_template?.domain?.chainId);
  const root = bankrApiRoot(apiRoot ?? env.BANKR_API_URL);
  const auth = buildBankrAuth({ apiKey, env });
  const wallet = await readBankrWallet(fetch, { apiRoot: root, auth, walletAddress });
  const resolvedNonce = nonce === undefined || nonce === null || nonce === ""
    ? await fetchPendingNonce(fetch, rpcUrl, wallet.address)
    : nonce;
  const typedData = buildBankrTypedData(intent.eip712_typed_data_template, wallet.address, resolvedNonce, "Create intent");
  const signed = await signTypedData(fetch, { apiRoot: root, auth, typedData });
  if (signed.signer && signed.signer.toLowerCase() !== wallet.address.toLowerCase()) {
    fail(`Bankr signing response signer ${signed.signer} did not match wallet ${wallet.address}.`);
  }
  if (!isEoaEip712Signature(signed.signature)) {
    fail("Bankr create signature is not an EOA-style 65-byte EIP-712 signature. The current Precog create endpoint requires EOA-compatible signatures.");
  }

  return {
    event: withoutUndefined({
      image_url: intent.precog_payload_template?.image_url,
      category: intent.precog_payload_template?.category,
      creator_address: wallet.address,
      creator_signature: signed.signature,
      wallet_provider: "bankr",
      wallet_audit: {
        provider: "bankr",
        wallet_id: wallet.id,
        wallet_address: wallet.address,
        policy_ids: [],
        chain_id: chainId,
        nonce: typedData.message?.nonce,
        method: "bankr_wallet_sign",
        api_endpoint: "/wallet/sign",
        typed_data_primary_type: typedData.primaryType,
      },
    }),
    creator_address: wallet.address,
    creator_signature: signed.signature,
    wallet: {
      provider: "bankr",
      id: wallet.id,
      address: wallet.address,
    },
    nonce: typedData.message?.nonce,
    chain_id: chainId,
    next_action: "run_skill_step",
  };
}

export const resolveBankrCreate = resolveCreate;
export { buildBankrTypedData };
