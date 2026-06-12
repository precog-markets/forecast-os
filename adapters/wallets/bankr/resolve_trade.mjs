#!/usr/bin/env node
// Submits a prepared Precog trade intent via Bankr wallet/submit (no local private key).
import { readFile } from "node:fs/promises";
import {
  argValue,
  bankrApiRoot,
  buildBankrAuth,
  chainIdFor,
  chainNameFor,
  fail,
  isMain,
  normalizePreparedTransactions,
  print,
  readBankrWallet,
  readWrappedJson,
  serializeError,
  submitTransaction,
  withoutUndefined,
} from "./common.mjs";

if (isMain(import.meta.url)) {
  try {
    const inputPath = argValue("--input");
    if (!inputPath) fail("bankr_resolve_trade requires --input <prepare-trade-intent-json>.");
    const tradeIntent = readWrappedJson(await readFile(inputPath, "utf8"));
    const result = await resolveTrade({
      tradeIntent,
      apiKey: argValue("--api-key"),
      apiRoot: argValue("--api-url"),
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
  apiKey,
  apiRoot,
  walletAddress,
  env = process.env,
  fetch = globalThis.fetch,
} = {}) {
  validateTradeIntent(tradeIntent);
  if (typeof fetch !== "function") fail("Fetch API is not available in this runtime.");

  const chainId = chainIdFor(tradeIntent.chain_id);
  const chain = chainNameFor(chainId);
  const transactions = normalizePreparedTransactions(tradeIntent, chain);
  const root = bankrApiRoot(apiRoot ?? env.BANKR_API_URL);
  const auth = buildBankrAuth({ apiKey, env });
  const wallet = await readBankrWallet(fetch, { apiRoot: root, auth, walletAddress });

  const submissions = [];
  for (const [index, transaction] of transactions.entries()) {
    const step = transaction.step ?? `step ${index + 1}`;
    const submission = await submitTransaction(fetch, {
      apiRoot: root,
      auth,
      transaction: {
        to: transaction.to,
        chainId,
        value: transaction.value,
        data: transaction.data,
      },
      description: `ForecastOS Precog ${tradeIntent.action} ${step} on market ${tradeIntent.market_id}`,
    });
    submissions.push(submission);
    if (submission.signer && submission.signer.toLowerCase() !== wallet.address.toLowerCase()) {
      fail(`Bankr submit signer ${submission.signer} did not match wallet ${wallet.address}.`);
    }
  }

  const finalSubmission = submissions.at(-1);
  return {
    status: "submitted",
    action: tradeIntent.action,
    market_id: tradeIntent.market_id,
    outcome: tradeIntent.outcome,
    shares: tradeIntent.shares,
    wallet_address: wallet.address,
    transaction_hash: finalSubmission.transactionHash,
    wallet_audit: withoutUndefined({
      provider: "bankr",
      wallet_id: wallet.id,
      wallet_address: wallet.address,
      policy_ids: [],
      chain_id: chainId,
      method: "bankr_wallet_submit",
      submit_endpoint: "/wallet/submit",
      transaction_steps: transactions.map((tx) => tx.step).filter(Boolean),
      transaction_hashes: submissions.map((submission) => submission.transactionHash),
    }),
    bankr: {
      submitted_transaction_hashes: submissions.map((submission) => submission.transactionHash),
    },
    next_action: "trade_complete",
  };
}

export const resolveBankrTrade = resolveTrade;

function validateTradeIntent(intent) {
  if (!intent || typeof intent !== "object") fail("Bankr trade resolver requires a trade intent object.");
  if (intent.intent_type !== "forecastos.precog_trade") {
    fail("Bankr trade resolver requires intent_type forecastos.precog_trade.");
  }
  if (!intent.market_id && intent.market_id !== 0) fail("Trade intent missing market_id.");
  if (!intent.action || !["buy", "sell"].includes(intent.action)) {
    fail('Trade intent action must be "buy" or "sell".');
  }
  const chain = chainNameFor(intent.chain_id);
  if (chain !== "base") fail(`Bankr trade resolver only supports Base mainnet (8453), received chain ${intent.chain_id}.`);
}
