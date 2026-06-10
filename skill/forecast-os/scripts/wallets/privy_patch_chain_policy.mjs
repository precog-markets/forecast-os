#!/usr/bin/env node
// Compatibility shim. Provider implementations live in adapters/wallets/<provider>/.
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  buildRepoRootGuidance,
  buildRepoRootCandidates,
} from "../lib/repo_discovery.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PATCH_ADAPTER_REL = ["adapters", "wallets", "privy", "patch_forecastos_chain_policy.mjs"];

function buildPrivyPatchAdapterPath(repoRoot) {
  return resolve(repoRoot, ...PATCH_ADAPTER_REL);
}

function getPrivyPatchAdapterCandidates(env = process.env, root = skillRoot) {
  return buildRepoRootCandidates(env, root).map((repoRoot) => buildPrivyPatchAdapterPath(repoRoot));
}

if (isMain(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`${JSON.stringify(serializeError(error), null, 2)}\n`);
    process.exit(1);
  });
}

async function runCli() {
  const adapterPath = await resolvePrivyPatchAdapterPath();
  const repoRoot = resolve(adapterPath, "..", "..", "..");
  const nodeBin = process.env.FORECASTOS_NODE_BIN ?? "node";
  await new Promise((resolvePromise, reject) => {
    const child = spawn(nodeBin, [adapterPath, ...process.argv.slice(2)], {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      if (code === 0) resolvePromise();
      else reject(Object.assign(new Error(`patch-privy-chain-policy exited with code ${code}`), { code: "PRIVY_POLICY_PATCH_ERROR" }));
    });
  });
}

async function resolvePrivyPatchAdapterPath() {
  const checkedPaths = getPrivyPatchAdapterCandidates(process.env, skillRoot);
  let lastError;
  for (const adapterPath of checkedPaths) {
    try {
      await access(adapterPath);
      return adapterPath;
    } catch (error) {
      lastError = error;
    }
  }
  const guidance = buildRepoRootGuidance(checkedPaths, lastError);
  const wrapped = new Error(
    ["ForecastOS Privy policy patch adapter not found.", guidance].join("\n"),
  );
  wrapped.code = "FORECASTOS_REPO_ROOT_REQUIRED";
  wrapped.checked_paths = checkedPaths;
  wrapped.guidance = guidance;
  wrapped.cause = lastError;
  throw wrapped;
}

function isMain(url) {
  return process.argv[1] && resolve(fileURLToPath(url)) === resolve(process.argv[1]);
}

function serializeError(error) {
  return Object.fromEntries(
    Object.entries({
      name: error?.name ?? "Error",
      message: error?.message ?? String(error),
      code: error?.code,
      checked_paths: error?.checked_paths,
      guidance: error?.guidance,
    }).filter(([, value]) => value !== undefined),
  );
}

export { getPrivyPatchAdapterCandidates, buildPrivyPatchAdapterPath };
