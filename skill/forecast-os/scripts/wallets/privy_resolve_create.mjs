#!/usr/bin/env node
// Compatibility shim. Provider implementations live in adapters/wallets/<provider>/.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (isMain(import.meta.url)) {
  try {
    const inputPath = argValue("--input");
    if (!inputPath) fail("privy_resolve_create requires --input <intent-json>.");
    const input = JSON.parse((await readFile(inputPath, "utf8")).replace(/^\uFEFF/, ""));
    const adapter = await loadPrivyAdapter();
    const result = await adapter.resolveCreate({
      intent: input.result ?? input,
      walletId: argValue("--wallet-id"),
      walletAddress: argValue("--wallet-address"),
      rpcUrl: argValue("--rpc-url") ?? process.env.FORECASTOS_BASE_RPC_URL ?? process.env.BASE_RPC_URL,
      env: process.env,
      fetch: globalThis.fetch,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(serializeError(error), null, 2)}\n`);
    process.exit(1);
  }
}

export async function resolvePrivyCreate(options) {
  return (await loadPrivyAdapter()).resolveCreate(options);
}

export async function resolveCreate(options) {
  return resolvePrivyCreate(options);
}

export async function buildPrivyTypedData(...args) {
  return (await loadPrivyAdapter()).buildCreateTypedData(...args);
}

export async function buildCreateTypedData(...args) {
  return buildPrivyTypedData(...args);
}

async function loadPrivyAdapter() {
  const checkedPaths = getPrivyAdapterCandidates();
  let lastError;
  for (const adapterPath of checkedPaths) {
    try {
      return await import(pathToFileURL(adapterPath).href);
    } catch (error) {
      lastError = error;
    }
  }
  const message = [
    "ForecastOS Privy wallet support moved to the top-level adapter:",
    "adapters/wallets/privy/resolve_create.mjs",
    "Checked paths:",
    ...checkedPaths.map((path) => `- ${path}`),
    "If this skill was copied into Hermes, set FORECASTOS_REPO_ROOT to the ForecastOS repo root.",
    "Alternatively, run the adapter directly from the ForecastOS repo or install/sync wallet adapters next to this skill source.",
  ].join(" ");
  const wrapped = new Error(message);
  wrapped.code = "FORECASTOS_WALLET_ADAPTER_NOT_FOUND";
  wrapped.checked_paths = checkedPaths;
  wrapped.cause = lastError;
  throw wrapped;
}

export function getPrivyAdapterCandidates(env = process.env) {
  const candidates = [];
  if (env.FORECASTOS_REPO_ROOT) {
    candidates.push(
      resolve(env.FORECASTOS_REPO_ROOT, "adapters", "wallets", "privy", "resolve_create.mjs"),
    );
  }
  candidates.push(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../adapters/wallets/privy/resolve_create.mjs",
    ),
  );
  return [...new Set(candidates)];
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isMain(url) {
  return process.argv[1] && resolve(fileURLToPath(url)) === resolve(process.argv[1]);
}

function fail(message) {
  const error = new Error(message);
  error.code = "FORECASTOS_PRIVY_RESOLVE_CREATE_ERROR";
  throw error;
}

function serializeError(error) {
  return Object.fromEntries(
    Object.entries({
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
      code: error?.code,
      status: error?.status,
      wallets: error?.wallets,
      checked_paths: error?.checked_paths,
    }).filter(([, value]) => value !== undefined),
  );
}
