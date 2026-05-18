#!/usr/bin/env node
// Bridges operator-approved ForecastOS actions to the bundled runtime while keeping MCP read-only.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const ACTIONS = new Set([
  "draft_market",
  "run_skill_step",
  "create_market",
  "await_precog_approval",
  "fund_market",
  "consume_prediction",
]);

const action = process.argv[2];
const inputPath = argValue("--input");
const sdkModule = process.env.FORECASTOS_SDK_MODULE;
const stateDir = process.env.FORECASTOS_STATE_DIR ?? ".forecastos";
const scriptDir = dirname(fileURLToPath(import.meta.url));

if (!ACTIONS.has(action)) {
  fail(`Unsupported action '${action ?? ""}'. Supported actions: ${[...ACTIONS].join(", ")}`);
}

const input = normalizeInput(action, inputPath ? JSON.parse(await readFile(inputPath, "utf8")) : {});
enforceApproval(action, input);

const forecastos = await loadForecastOS(sdkModule);
const result = await dispatch(forecastos, action, input);
print({
  action,
  status: "ok",
  runtime: sdkModule ? "external" : "bundled",
  result,
});

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function enforceApproval(actionName, input) {
  if (actionName === "create_market" && input.approved !== true) {
    fail("create_market requires approved: true.");
  }
  if (actionName === "create_market" && !input.approval_text) {
    fail("create_market requires approval_text.");
  }
  if (actionName === "fund_market" && input.approved !== true) {
    fail("fund_market requires explicit operator approval with approved: true.");
  }
}

function normalizeInput(actionName, input) {
  if (actionName === "draft_market") {
    return {
      ...input,
      preferred_market_type: "multi_outcome",
    };
  }
  if (actionName === "run_skill_step") {
    return {
      ...input,
      event: {
        ...(input.event ?? {}),
        input: input.event?.input
          ? {
              ...input.event.input,
              preferred_market_type: "multi_outcome",
            }
          : input.event?.input,
        draft_input: input.event?.draft_input
          ? {
              ...input.event.draft_input,
              preferred_market_type: "multi_outcome",
            }
          : input.event?.draft_input,
      },
    };
  }
  return input;
}

async function loadForecastOS(specifier) {
  const imported = await import(
    specifier
      ? toImportSpecifier(specifier)
      : pathToFileURL(resolve(scriptDir, "forecastos_runtime.mjs")).href
  );
  if (typeof imported.createForecastOS === "function") {
    return imported.createForecastOS(buildForecastOSOptions(imported));
  }
  if (imported.default && typeof imported.default.createForecastOS === "function") {
    return imported.default.createForecastOS(buildForecastOSOptions(imported.default));
  }
  return imported.default ?? imported;
}

function buildForecastOSOptions(imported) {
  const options = {};
  if (typeof imported.DirectoryDraftStateStore === "function") {
    options.store = new imported.DirectoryDraftStateStore(stateDir);
  }
  return options;
}

function toImportSpecifier(specifier) {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(specifier)
  ) {
    return pathToFileURL(resolve(specifier)).href;
  }
  return specifier;
}

async function dispatch(forecastos, actionName, input) {
  if (actionName === "draft_market") return forecastos.draftMarket(input);
  if (actionName === "run_skill_step") {
    return forecastos.runSkillStep(input.state, input.event ?? {});
  }
  if (actionName === "create_market") return forecastos.createMarket(input);
  if (actionName === "await_precog_approval") {
    return forecastos.awaitPrecogApproval(input.state, input.event ?? {});
  }
  if (actionName === "fund_market") return forecastos.fundMarket(input.state, input.event ?? {});
  if (actionName === "consume_prediction") {
    return forecastos.consumePrediction(input.state, input.event ?? {});
  }
  fail(`Unhandled action '${actionName}'.`);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
