#!/usr/bin/env node
// Compatibility shim. Provider implementations live in adapters/wallets/<provider>/.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildRepoRootGuidance,
  getPrivyAdapterCandidates,
} from "../lib/repo_discovery.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

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
      rpcUrl: argValue("--rpc-url"),
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
  const checkedPaths = getPrivyAdapterCandidates(process.env, skillRoot);
  let lastError;
  for (const adapterPath of checkedPaths) {
    try {
      await readFile(adapterPath, "utf8");
      return await import(pathToFileURL(adapterPath).href);
    } catch (error) {
      lastError = error;
    }
  }
  const guidance = buildRepoRootGuidance(checkedPaths, lastError);
  const wrapped = new Error(
    [
      "ForecastOS Privy adapter not found.",
      guidance,
    ].join("\n"),
  );
  wrapped.code = "FORECASTOS_REPO_ROOT_REQUIRED";
  wrapped.checked_paths = checkedPaths;
  wrapped.guidance = guidance;
  wrapped.cause = lastError;
  throw wrapped;
}

export { getPrivyAdapterCandidates };

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
      guidance: error?.guidance,
    }).filter(([, value]) => value !== undefined),
  );
}
