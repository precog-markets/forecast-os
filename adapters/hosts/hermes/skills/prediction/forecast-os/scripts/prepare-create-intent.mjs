#!/usr/bin/env node
// Forward Hermes create-intent preparation to a verified canonical ForecastOS bridge.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { assertActionBridgeSupports, printRuntimeError, resolveHermesSkillRoot } from "./forecastos-runtime.mjs";

const action = "prepare_create_intent";
const nodeBin = process.env.FORECASTOS_NODE_BIN ?? "node";
const hermesSkillRoot = resolveHermesSkillRoot();
let runtime;
try {
  runtime = await assertActionBridgeSupports(action);
} catch (error) {
  printRuntimeError(error);
  process.exit(1);
}

const child = spawn(nodeBin, [runtime.actionScript, action, ...process.argv.slice(2)], {
  cwd: runtime.canonicalSkillDir,
  env: {
    ...process.env,
    FORECASTOS_SKILL_DIR: runtime.canonicalSkillDir,
    FORECASTOS_STATE_DIR: process.env.FORECASTOS_STATE_DIR ?? join(hermesSkillRoot, ".forecastos"),
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
