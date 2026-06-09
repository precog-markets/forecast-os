#!/usr/bin/env node
// Runs the Arbitrum Warcraft 2026 example through draft, approval, and create-intent prep.
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const exampleDir = dirname(fileURLToPath(import.meta.url));
const skillRoot = join(exampleDir, "..", "..", "..");
const actionScript = join(skillRoot, "scripts", "forecastos_action.mjs");
const stateDir = process.env.FORECASTOS_STATE_DIR ?? join(skillRoot, ".forecastos");
const outputDir = join(stateDir, "examples", "warcraft-arb");

await ensureStateConfig(stateDir);
await mkdir(outputDir, { recursive: true });

console.log("Step 1: draft via run_skill_step");
const drafted = await runAction("run_skill_step", join(exampleDir, "01_draft.json"));
await writeJson(join(outputDir, "01_drafted.json"), drafted);
assertStep(drafted, "await_approval");
assertChain(drafted.result.state, 42161);

const approveInput = JSON.parse(await readFile(join(exampleDir, "02_approve.json"), "utf8"));
approveInput.state = drafted.result.state;
await writeJson(join(outputDir, "02_approve.resolved.json"), approveInput);

console.log("Step 2: approve for Arbitrum");
const approved = await runAction("run_skill_step", join(outputDir, "02_approve.resolved.json"));
await writeJson(join(outputDir, "02_approved.json"), approved);
assertStep(approved, "create_market");
assertChain(approved.result.state, 42161);

console.log("Step 3: prepare create intent");
const createIntentInput = {
  state: approved.result.state,
  event: {
    image_url: "https://upload.wikimedia.org/wikipedia/en/7/71/World_of_Warcraft_2018_logo.svg",
    chain_id: 42161,
    collateral_symbol: "USDC",
    collateral_address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
};
const createIntentInputPath = join(outputDir, "03_create_intent_input.json");
await writeJson(createIntentInputPath, createIntentInput);
const intentStep = await runAction("run_skill_step", createIntentInputPath);
await writeJson(join(outputDir, "03_create_intent.json"), intentStep);

const workflowId = approved.result.state.workflow_id;
const createIntent = intentStep.result.tool_result ?? approved.result.tool_result;
await writeJson(join(outputDir, "create-intent.json"), createIntent);

console.log("");
console.log("Example complete through create-intent preparation.");
console.log(`Workflow id: ${workflowId}`);
console.log(`State dir: ${stateDir}`);
console.log("");
console.log("Next: sign with Privy on Arbitrum");
console.log(
  `node ${join(skillRoot, "..", "..", "adapters", "wallets", "privy", "resolve_create.mjs")} --input ${join(outputDir, "create-intent.json")} --wallet-id <privy-wallet-id>`,
);
console.log("");
console.log("Then publish:");
console.log(
  `node ${actionScript} publish_approved_market --workflow-id ${workflowId} --wallet-output <privy-output.json>`,
);

if (process.env.PRIVY_APP_ID && process.env.PRIVY_APP_SECRET && process.env.PRIVY_WALLET_ID) {
  console.log("");
  console.log("PRIVY_* env vars detected; attempting live sign + publish is optional and not run automatically.");
}

async function runAction(action, inputPath) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [actionScript, action, "--input", inputPath],
    {
      cwd: skillRoot,
      env: {
        ...process.env,
        FORECASTOS_STATE_DIR: stateDir,
      },
    },
  );
  return JSON.parse(stdout);
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertStep(payload, expectedStep) {
  const step = payload?.result?.state?.step;
  if (step !== expectedStep) {
    throw new Error(`Expected step ${expectedStep}, received ${step ?? "unknown"}`);
  }
}

function assertChain(state, chainId) {
  if (Number(state?.chain_id) !== chainId) {
    throw new Error(`Expected chain_id ${chainId}, received ${state?.chain_id ?? "unknown"}`);
  }
}

async function ensureStateConfig(dir) {
  const configPath = join(dir, "config.json");
  try {
    await readFile(configPath, "utf8");
  } catch {
    await mkdir(dir, { recursive: true });
    await copyFile(join(skillRoot, ".forecastos", "config.json"), configPath);
  }
}
