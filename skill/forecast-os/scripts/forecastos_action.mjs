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
  "prepare_create_intent",
  "await_precog_approval",
  "prepare_funding_intent",
  "fund_market",
  "consume_prediction",
]);

const action = process.argv[2];
const inputPath = argValue("--input");
const walletOutputPath = argValue("--wallet-output") ?? argValue("--adapter-output");
const stateDir = process.env.FORECASTOS_STATE_DIR ?? ".forecastos";
const scriptDir = dirname(fileURLToPath(import.meta.url));

if (!ACTIONS.has(action)) {
  fail(`Unsupported action '${action ?? ""}'. Supported actions: ${[...ACTIONS].join(", ")}`);
}

const rawInput = inputPath ? parseJsonInput(await readFile(inputPath, "utf8")) : {};
const walletOutput = walletOutputPath ? parseJsonInput(await readFile(walletOutputPath, "utf8")) : undefined;
const input = normalizeInput(action, mergeWalletOutput(action, rawInput, walletOutput));
enforceApproval(action, input);

const forecastos = await loadForecastOS();
try {
  const result = await dispatch(forecastos, action, input);
  print({
    action,
    status: "ok",
    runtime: "bundled",
    result,
  });
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        action,
        status: "error",
        runtime: "bundled",
        error: serializeError(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseJsonInput(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

function enforceApproval(actionName, input) {
  if (actionName === "create_market" && input.approved !== true) {
    fail("create_market requires approved: true.");
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

function mergeWalletOutput(actionName, input, walletOutput) {
  if (!walletOutput) return input;
  const resolved = walletOutput.result ?? walletOutput;
  const event = resolved.event ?? {};
  const fundingRequest = resolved.funding_request ?? event.funding_request;
  const walletAudit = resolved.wallet_audit ?? event.wallet_audit;
  if (actionName === "run_skill_step") {
    return {
      ...input,
      event: withoutUndefined({
        ...(input.event ?? {}),
        ...event,
        funding_request: fundingRequest ?? input.event?.funding_request,
        wallet_audit: walletAudit ?? input.event?.wallet_audit,
      }),
    };
  }
  if (actionName === "create_market") {
    return withoutUndefined({
      ...input,
      ...event,
      wallet_audit: walletAudit ?? input.wallet_audit,
    });
  }
  if (actionName === "fund_market") {
    return {
      ...input,
      wallet_audit: walletAudit ?? input.wallet_audit,
      funding_request: withoutUndefined({
        ...(input.funding_request ?? {}),
        ...(fundingRequest ?? {}),
      }),
    };
  }
  return input;
}

async function loadForecastOS() {
  const imported = await import(pathToFileURL(resolve(scriptDir, "forecastos_runtime.mjs")).href);
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

async function dispatch(forecastos, actionName, input) {
  if (actionName === "draft_market") return forecastos.draftMarket(input);
  if (actionName === "run_skill_step") {
    return forecastos.runSkillStep(input.state, input.event ?? {});
  }
  if (actionName === "create_market") return forecastos.createMarket(input);
  if (actionName === "prepare_create_intent") return forecastos.prepareCreateIntent(input);
  if (actionName === "await_precog_approval") {
    return forecastos.awaitPrecogApproval(input.state, input.event ?? {});
  }
  if (actionName === "prepare_funding_intent") {
    return forecastos.prepareFundingIntent(input.state, {
      ...(input.event ?? {}),
      funding_request: {
        ...(input.event?.funding_request ?? {}),
        ...(input.funding_request ?? {}),
        provider: input.provider ?? input.wallet_provider ?? input.funding_request?.provider ?? input.event?.funding_request?.provider,
        amount: input.amount ?? input.funding_request?.amount ?? input.event?.funding_request?.amount,
        asset: input.asset ?? input.funding_request?.asset ?? input.event?.funding_request?.asset,
        funding_asset: input.funding_asset ?? input.funding_request?.funding_asset ?? input.event?.funding_request?.funding_asset,
        collateral_symbol: input.collateral_symbol ?? input.funding_request?.collateral_symbol ?? input.event?.funding_request?.collateral_symbol,
        collateral_address: input.collateral_address ?? input.funding_request?.collateral_address ?? input.event?.funding_request?.collateral_address,
        upcoming_market: input.upcoming_market ?? input.funding_request?.upcoming_market ?? input.event?.funding_request?.upcoming_market,
      },
    });
  }
  if (actionName === "fund_market") {
    return forecastos.fundMarket(input.state, {
      ...(input.event ?? {}),
      approved: input.approved,
      funding_request: {
        ...(input.event?.funding_request ?? {}),
        ...(input.funding_request ?? {}),
        upcoming_market: input.upcoming_market ?? input.funding_request?.upcoming_market ?? input.event?.funding_request?.upcoming_market,
        amount: input.amount ?? input.funding_request?.amount ?? input.event?.funding_request?.amount,
        tx_hash: input.tx_hash ?? input.funding_request?.tx_hash ?? input.event?.funding_request?.tx_hash,
        funder_address: input.funder_address ?? input.funding_request?.funder_address ?? input.event?.funding_request?.funder_address,
        funder_signature: input.funder_signature ?? input.funding_request?.funder_signature ?? input.event?.funding_request?.funder_signature,
      },
    });
  }
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

function serializeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    code: error?.code,
    status: error?.status,
    endpoint: error?.endpoint,
    body: error?.body,
  };
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
