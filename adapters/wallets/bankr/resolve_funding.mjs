#!/usr/bin/env node
// Resolves a ForecastOS funding intent with Bankr typed-data signing and raw transaction submission.
import { readFile } from "node:fs/promises";
import {
  argValue,
  bankrApiRoot,
  buildBankrAuth,
  buildBankrTypedData,
  chainIdFor,
  chainNameFor,
  fail,
  fetchPendingNonce,
  isMain,
  normalizePreparedTransactions,
  print,
  readBankrWallet,
  readWrappedJson,
  serializeError,
  signTypedData,
  submitTransaction,
  withoutUndefined,
} from "./common.mjs";

if (isMain(import.meta.url)) {
  try {
    const inputPath = argValue("--input");
    const preparePath = argValue("--prepare-response");
    if (!inputPath) fail("bankr_resolve_funding requires --input <prepare-funding-intent-json>.");
    if (!preparePath) fail("bankr_resolve_funding requires --prepare-response <unsigned-calldata-json>.");
    const intent = readWrappedJson(await readFile(inputPath, "utf8"));
    const prepareResponse = readWrappedJson(await readFile(preparePath, "utf8"));
    const result = await resolveFunding({
      intent,
      prepareResponse,
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

export async function resolveFunding({
  intent,
  prepareResponse,
  apiKey,
  apiRoot,
  walletAddress,
  nonce,
  rpcUrl,
  env = process.env,
  fetch = globalThis.fetch,
} = {}) {
  validateFundingIntent(intent);
  if (typeof fetch !== "function") fail("Fetch API is not available in this runtime.");

  const chainId = chainIdFor(intent.chain_id ?? intent.eip712_typed_data_template?.domain?.chainId);
  const chain = chainNameFor(chainId);
  const transactions = normalizePreparedTransactions(prepareResponse, chain);
  const root = bankrApiRoot(apiRoot ?? env.BANKR_API_URL);
  const auth = buildBankrAuth({ apiKey, env });
  const wallet = await readBankrWallet(fetch, { apiRoot: root, auth, walletAddress });
  const resolvedNonce = nonce === undefined || nonce === null || nonce === ""
    ? await fetchPendingNonce(fetch, rpcUrl, wallet.address)
    : nonce;
  const typedData = buildBankrTypedData(intent.eip712_typed_data_template, wallet.address, resolvedNonce, "Funding intent");
  const signed = await signTypedData(fetch, { apiRoot: root, auth, typedData });
  if (signed.signer && signed.signer.toLowerCase() !== wallet.address.toLowerCase()) {
    fail(`Bankr signing response signer ${signed.signer} did not match wallet ${wallet.address}.`);
  }

  const submissions = [];
  for (const [index, transaction] of transactions.entries()) {
    const step = transaction.step ?? `step ${index + 1}`;
    submissions.push(
      await submitTransaction(fetch, {
        apiRoot: root,
        auth,
        transaction: {
          to: transaction.to,
          chainId,
          value: transaction.value,
          data: transaction.data,
        },
        description: `ForecastOS funding ${step} for upcoming market ${intent.upcoming_market}`,
      }),
    );
  }
  const finalSubmission = submissions.at(-1);

  return {
    funding_request: {
      upcoming_market: intent.upcoming_market,
      amount: intent.amount,
      tx_hash: finalSubmission.transactionHash,
      funder_address: wallet.address,
      funder_signature: signed.signature,
    },
    wallet_audit: withoutUndefined({
      provider: "bankr",
      wallet_id: wallet.id,
      wallet_address: wallet.address,
      policy_ids: [],
      chain_id: chainId,
      nonce: typedData.message?.nonce,
      method: "bankr_wallet_sign_and_submit",
      sign_endpoint: "/wallet/sign",
      submit_endpoint: "/wallet/submit",
      typed_data_primary_type: typedData.primaryType,
      transaction_steps: transactions.map((tx) => tx.step).filter(Boolean),
      transaction_hashes: submissions.map((submission) => submission.transactionHash),
    }),
    bankr: {
      submitted_transaction_hashes: submissions.map((submission) => submission.transactionHash),
    },
    next_action: "fund_market",
  };
}

export const resolveBankrFunding = resolveFunding;

function validateFundingIntent(intent) {
  if (!intent || typeof intent !== "object") fail("Bankr funding resolver requires a funding intent object.");
  if (intent.intent_type !== "forecastos.fund_market") {
    fail("Bankr funding resolver requires intent_type forecastos.fund_market.");
  }
  if (!intent.upcoming_market && intent.upcoming_market !== 0) fail("Funding intent missing upcoming_market.");
  if (!/^(?:0\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(?:\.[0-9]+)?)$/.test(String(intent.amount ?? ""))) {
    fail("Funding intent amount must be a positive Precog display-unit decimal string.");
  }
  const chain = chainNameFor(intent.chain_id ?? intent.eip712_typed_data_template?.domain?.chainId);
  if (chain !== "base") fail(`Bankr funding resolver only supports base, received ${chain}.`);
}
