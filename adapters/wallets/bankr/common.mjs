import { normalizeEvmChecksumAddress } from "../address_utils.mjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BANKR_API_ROOT = "https://api.bankr.bot";
const DEFAULT_BASE_RPC_URL = "https://mainnet.base.org";
const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_HEX = "0x2105";

export function bankrApiRoot(value) {
  return String(value ?? DEFAULT_BANKR_API_ROOT).replace(/\/+$/, "");
}

export function buildBankrAuth({ apiKey, env = process.env } = {}) {
  const resolvedApiKey = apiKey ?? env.BANKR_API_KEY;
  if (!resolvedApiKey) {
    fail("Bankr API key is required: pass --api-key or set BANKR_API_KEY.");
  }
  return {
    apiKey: resolvedApiKey,
    headers: {
      "X-API-Key": resolvedApiKey,
      "Content-Type": "application/json",
    },
  };
}

export async function readBankrWallet(fetch, { apiRoot, auth, walletAddress } = {}) {
  if (typeof fetch !== "function") fail("Fetch API is not available in this runtime.");
  const response = await fetch(`${bankrApiRoot(apiRoot)}/wallet/me`, {
    method: "GET",
    headers: auth.headers,
  });
  const body = await readJsonResponse(response);
  if (!response.ok) {
    fail(`Bankr wallet lookup failed: ${response.status}${bankrErrorSuffix(body)}`);
  }
  const address = extractEvmAddress(body);
  if (!address) fail("Bankr wallet lookup did not include an EVM wallet address.");
  assertAddress(address, "Bankr wallet address");
  if (walletAddress && !sameAddress(address, walletAddress)) {
    fail(`Bankr wallet address ${address} did not match requested --wallet-address ${walletAddress}.`);
  }
  return {
    id: body.wallet?.id ?? body.id ?? address,
    address,
    raw: body,
  };
}

export async function signTypedData(fetch, { apiRoot, auth, typedData } = {}) {
  const response = await fetch(`${bankrApiRoot(apiRoot)}/wallet/sign`, {
    method: "POST",
    headers: auth.headers,
    body: JSON.stringify({
      signatureType: "eth_signTypedData_v4",
      typedData,
    }),
  });
  const body = await readJsonResponse(response);
  if (!response.ok) fail(`Bankr typed-data signing failed: ${response.status}${bankrErrorSuffix(body)}`);
  const signature = body.signature ?? body.data?.signature ?? body.result?.signature ?? body.result;
  if (!signature) fail("Bankr typed-data signing response did not include a signature.");
  assertHex(signature, "Bankr signature");
  return {
    signature,
    signer: body.signer ?? body.data?.signer ?? body.result?.signer,
    raw: body,
  };
}

export async function submitTransaction(fetch, { apiRoot, auth, transaction, description } = {}) {
  const response = await fetch(`${bankrApiRoot(apiRoot)}/wallet/submit`, {
    method: "POST",
    headers: auth.headers,
    body: JSON.stringify({
      transaction,
      description,
      waitForConfirmation: true,
    }),
  });
  const body = await readJsonResponse(response);
  if (!response.ok) fail(`Bankr transaction submission failed: ${response.status}${bankrErrorSuffix(body)}`);
  const transactionHash = body.transactionHash ?? body.txHash ?? body.hash ?? body.data?.transactionHash ?? body.result?.transactionHash;
  if (!transactionHash) fail("Bankr transaction submission response did not include a transaction hash.");
  assertHex(transactionHash, "Bankr transaction hash");
  return {
    transactionHash,
    signer: body.signer ?? body.data?.signer ?? body.result?.signer,
    raw: body,
  };
}

export async function fetchPendingNonce(fetch, rpcUrl, address) {
  const response = await fetch(rpcUrl ?? DEFAULT_BASE_RPC_URL, {
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
  if (!response.ok || body.error) fail(`Base RPC nonce lookup failed: ${response.status}${bankrErrorSuffix(body)}`);
  return Number.parseInt(String(body.result ?? "0x0").replace(/^0x/, ""), 16);
}

export function buildBankrTypedData(template, account, nonce, label = "intent") {
  if (!template || typeof template !== "object") fail(`${label} missing eip712_typed_data_template.`);
  const checksummedAccount = normalizeEvmChecksumAddress(account, "account");
  const primaryType = template.primaryType ?? template.primary_type;
  if (!primaryType) fail(`${label} typed data missing primaryType.`);
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
    fail("Bankr funding requires a prepared unsigned calldata envelope or transactions[] batch.");
  }

  return rawTransactions.map((tx, index) => normalizeTransaction(tx, index, expectedChain));
}

export function chainNameFor(value, label = "Bankr chain id") {
  if (value === undefined || value === null || value === "") fail(`Missing ${label}.`);
  const raw = String(value).toLowerCase();
  if (raw === "base" || raw === String(BASE_CHAIN_ID) || raw === BASE_CHAIN_HEX) return "base";
  fail(`Unsupported ${label} ${value}. Bankr ForecastOS funding currently supports Base chain 8453.`);
}

export function chainIdFor(value) {
  chainNameFor(value);
  return BASE_CHAIN_ID;
}

export function normalizeNonce(value) {
  if (value === undefined || value === null || value === "" || value === "<next_pending_nonce>") {
    fail("Bankr typed data requires --nonce <next_pending_nonce> or an RPC nonce lookup.");
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

export function isEoaEip712Signature(value) {
  return /^0x[0-9a-fA-F]{130}$/.test(String(value ?? ""));
}

export function assertAddress(value, label) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(value ?? ""))) fail(`${label} must be an EVM address.`);
}

export function assertHex(value, label) {
  if (!/^0x[0-9a-fA-F]*$/.test(String(value ?? ""))) fail(`${label} must be hex data.`);
}

export function readWrappedJson(text) {
  const parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  return parsed.result ?? parsed;
}

export function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function isMain(url, argv = process.argv) {
  return argv[1] && resolve(fileURLToPath(url)) === resolve(argv[1]);
}

export function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function fail(message) {
  const error = new Error(message);
  error.code = "FORECASTOS_BANKR_WALLET_ADAPTER_ERROR";
  throw error;
}

export function serializeError(error) {
  return withoutUndefined({
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    code: error?.code,
    status: error?.status,
  });
}

async function readJsonResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
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

function normalizeChainName(value) {
  const chain = String(value ?? "").trim().toLowerCase();
  if (chain === "base") return "base";
  fail(`Unsupported Bankr chain ${value}.`);
}

function normalizeValue(value) {
  if (value === undefined || value === null || value === "") return "0";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) fail("Transaction value number must be a non-negative safe integer.");
    return String(value);
  }
  const raw = String(value);
  if (/^0x[0-9a-fA-F]+$/.test(raw)) return String(BigInt(raw));
  if (/^(?:0|[1-9]\d*)$/.test(raw)) return raw;
  fail("Transaction value must be a hex or non-negative integer string.");
}

function extractEvmAddress(body) {
  const candidates = [
    body?.address,
    body?.walletAddress,
    body?.evmAddress,
    body?.wallet?.address,
    body?.wallet?.evmAddress,
    body?.wallets?.evm?.address,
    body?.wallets?.base?.address,
    body?.data?.address,
    body?.data?.walletAddress,
    body?.data?.wallet?.address,
  ];
  const fromArray = [...(body?.wallets ?? []), ...(body?.data?.wallets ?? [])].find((wallet) => {
    const chain = String(wallet?.chain ?? wallet?.chainType ?? wallet?.chain_type ?? "").toLowerCase();
    return wallet?.address && (!chain || chain.includes("evm") || chain.includes("base") || chain.includes("ethereum"));
  });
  return candidates.find((candidate) => /^0x[0-9a-fA-F]{40}$/.test(String(candidate ?? ""))) ?? fromArray?.address;
}

function sameAddress(left, right) {
  return String(left ?? "").toLowerCase() === String(right ?? "").toLowerCase();
}

function bankrErrorSuffix(body) {
  const message = body?.error ?? body?.message ?? body?.details;
  return message ? ` (${message})` : "";
}
