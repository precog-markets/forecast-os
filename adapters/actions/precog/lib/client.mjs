import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, fallback, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getNetworkConfig, loadMainnetMasterFromForecastOSConfig } from "./config.mjs";
import { resolvePrivateKey } from "./credentials.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const ABI_PATH = join(moduleDir, "../abi/PrecogMasterV8.json");

let networkKey = resolveNetworkKey();
let networkConfig = getNetworkConfig(networkKey);
let chain = networkConfig.chain;
let transport = buildTransport(networkConfig);
export let MASTER_ADDRESS = networkConfig.address;
export let pub = createPublicClient({ chain, transport });
export const ABI = JSON.parse(readFileSync(ABI_PATH, "utf8"));

let credentialOptions = {};

await loadMainnetMasterFromForecastOSConfig();
if (networkKey === "mainnet") {
  const refreshed = getNetworkConfig("mainnet");
  MASTER_ADDRESS = refreshed.address;
}

export function configureCredentials(options = {}) {
  credentialOptions = { ...credentialOptions, ...options };
}

function resolveNetworkKey(value) {
  const key = String(value ?? process.env.PRECOG_NETWORK ?? "sepolia").toLowerCase();
  if (key !== "sepolia" && key !== "mainnet") {
    throw new Error(`Unknown network "${key}". Use "sepolia" or "mainnet".`);
  }
  return key;
}

function buildTransport(cfg) {
  return process.env.PRECOG_RPC_URL
    ? http(process.env.PRECOG_RPC_URL)
    : fallback(cfg.rpcs.map((url) => http(url)));
}

export function setNetwork(network) {
  networkKey = resolveNetworkKey(network);
  networkConfig = getNetworkConfig(networkKey);
  chain = networkConfig.chain;
  transport = buildTransport(networkConfig);
  MASTER_ADDRESS = networkConfig.address;
  pub = createPublicClient({ chain, transport });
}

export async function getWallet() {
  const privateKey = await resolvePrivateKey(credentialOptions);
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({ account, chain, transport });
  return { account, wallet };
}

export function read(fn, args = []) {
  return pub.readContract({ address: MASTER_ADDRESS, abi: ABI, functionName: fn, args });
}

export function multiread(calls, { allowFailure = false } = {}) {
  return pub.multicall({
    contracts: calls.map(([functionName, args = []]) => ({
      address: MASTER_ADDRESS,
      abi: ABI,
      functionName,
      args,
    })),
    allowFailure,
  });
}

export async function write(wallet, account, fn, fnArgs) {
  const hash = await wallet.writeContract({
    address: MASTER_ADDRESS,
    abi: ABI,
    functionName: fn,
    args: fnArgs,
    account,
  });
  process.stdout.write(`Tx sent: ${hash}\nWaiting for confirmation...`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(` confirmed (block ${receipt.blockNumber})`);
  return receipt;
}

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
];

export async function tokenBalance(token, addr) {
  return pub.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [addr],
  });
}

export async function ensureApproval(wallet, account, token, spender, amount) {
  const allowance = await pub.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, spender],
  });
  if (allowance >= amount) return;
  console.log(`Approving ${token}...`);
  const hash = await wallet.writeContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
    account,
  });
  await pub.waitForTransactionReceipt({ hash });
  console.log("Approved.");
}

export const TWO_POW_64 = 2n ** 64n;

export function toFP64(shares) {
  const [whole, fraction = ""] = String(shares).split(".");
  const dec18 = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0").slice(0, 18));
  return (dec18 * TWO_POW_64) / 10n ** 18n;
}

export function fromFP64(fp) {
  return Number((BigInt(fp) * 10000n) / TWO_POW_64) / 10000;
}

export function toRaw(amount, decimals) {
  const [whole, fraction = ""] = String(amount).split(".");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0").slice(0, decimals));
}

export function fromRaw(raw, decimals) {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  return `${whole}.${String(frac).padStart(decimals, "0").slice(0, 4)}`;
}

export function pct(price1e18) {
  return (Number(price1e18) / 1e18 * 100).toFixed(1);
}

export function outcomes(raw) {
  return raw.split("|").map((value) => value.trim()).filter(Boolean);
}

export function status(endTs) {
  return Date.now() / 1000 < Number(endTs) ? "active" : "ended";
}

export function date(ts) {
  return new Date(Number(ts) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
