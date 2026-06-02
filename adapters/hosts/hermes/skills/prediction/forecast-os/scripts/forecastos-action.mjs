#!/usr/bin/env node
// Forward Hermes skill commands to the canonical ForecastOS action bridge.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { assertActionBridgeSupports, printRuntimeError } from "./forecastos-runtime.mjs";

const action = process.argv[2];
const nodeBin = process.env.FORECASTOS_NODE_BIN ?? "node";
let runtime;
try {
  runtime = await assertActionBridgeSupports(action);
} catch (error) {
  printRuntimeError(error);
  process.exit(1);
}

const child = spawn(nodeBin, [runtime.actionScript, ...process.argv.slice(2)], {
  cwd: runtime.canonicalSkillDir,
  env: {
    ...process.env,
    FORECASTOS_SKILL_DIR: runtime.canonicalSkillDir,
    FORECASTOS_STATE_DIR: process.env.FORECASTOS_STATE_DIR ?? join(runtime.canonicalSkillDir, ".forecastos"),
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
