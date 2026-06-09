#!/usr/bin/env node
// Alias for Hermes and copied skill installs; delegates to the Privy shim.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const shimScript = join(scriptDir, "wallets", "privy_resolve_create.mjs");
const nodeBin = process.env.FORECASTOS_NODE_BIN ?? "node";

const child = spawn(nodeBin, [shimScript, ...process.argv.slice(2)], {
  cwd: dirname(scriptDir),
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
