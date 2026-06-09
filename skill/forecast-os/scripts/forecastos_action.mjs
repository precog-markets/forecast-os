#!/usr/bin/env node
// Bridges operator-approved ForecastOS actions to the bundled runtime while keeping MCP read-only.
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const ACTIONS = new Set([
  "draft_market",
  "run_skill_step",
  "publish_approved_market",
  "create_market",
  "prepare_create_intent",
  "await_precog_approval",
  "prepare_funding_intent",
  "fund_market",
  "consume_prediction",
]);

const ACTIONS_REQUIRING_INPUT = new Set([
  "draft_market",
  "run_skill_step",
  "create_market",
  "prepare_create_intent",
  "await_precog_approval",
  "prepare_funding_intent",
  "fund_market",
  "consume_prediction",
]);

const RUNTIME_DRAFT_ID = /^draft_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUNTIME_DRAFT_HASH = /^hash_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUNTIME_WORKFLOW_ID = /^workflow_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const action = process.argv[2];
const inputPath = resolveInputPath();
const walletOutputPath = argValue("--wallet-output") ?? argValue("--adapter-output");
const workflowIdArg = argValue("--workflow-id");
const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillRoot = dirname(scriptDir);
const defaultStateDir = join(skillRoot, ".forecastos");
const stateDir = process.env.FORECASTOS_STATE_DIR ?? argValue("--state-dir") ?? defaultStateDir;

if (!ACTIONS.has(action)) {
  fail(`Unsupported action '${action ?? ""}'. Supported actions: ${[...ACTIONS].join(", ")}`);
}

const rawInput = normalizeCliInput(
  action,
  inputPath ? parseJsonInput(await readInput(inputPath)) : {},
);
requireActionInput(action, rawInput);
const resolvedInput = await resolveRunSkillStepInput(action, rawInput);
const walletOutput = walletOutputPath ? parseJsonInput(await readFile(walletOutputPath, "utf8")) : undefined;
const input = normalizeInput(action, mergeWalletOutput(action, resolvedInput, walletOutput));
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

function resolveInputPath() {
  const explicit = argValue("--input");
  if (explicit) return explicit;
  const candidate = process.argv[3];
  if (!candidate || candidate.startsWith("--")) return undefined;
  return candidate;
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseJsonInput(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

async function readInput(path) {
  if (path !== "-") return readFile(path, "utf8");
  return new Promise((resolveInput, reject) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      text += chunk;
    });
    process.stdin.on("end", () => resolveInput(text));
    process.stdin.on("error", reject);
  });
}

function requireActionInput(actionName, input = {}) {
  if (!ACTIONS_REQUIRING_INPUT.has(actionName)) return;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    failMissingInput(actionName);
  }
  if (Object.keys(input).length === 0) {
    failMissingInput(actionName);
  }
  if (actionName === "draft_market") {
    if (!input.prompt && !input.question) {
      failMissingInput(actionName, "draft_market requires prompt or question in the input JSON.");
    }
  }
}

function failMissingInput(actionName, detail) {
  const message = detail ?? [
    `${actionName} requires a JSON input file.`,
    `Use: node scripts/forecastos_action.mjs ${actionName} --input <json-file>`,
    `Or positional shorthand: node scripts/forecastos_action.mjs ${actionName} <json-file>`,
  ].join(" ");
  fail(message);
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
  if (actionName === "run_skill_step" || actionName === "publish_approved_market") {
    const event = input.event ?? {};
    const eventInput = event.input ?? {};
    return {
      ...input,
      event: {
        ...event,
        input: Object.keys(eventInput).length
          ? {
              ...eventInput,
              preferred_market_type: "multi_outcome",
            }
          : eventInput,
        draft_input: event.draft_input
          ? {
              ...event.draft_input,
              preferred_market_type: "multi_outcome",
            }
          : event.draft_input,
      },
    };
  }
  return input;
}

function normalizeCliInput(actionName, input) {
  if (actionName === "publish_approved_market" && workflowIdArg) {
    return {
      ...input,
      workflow_id: input.workflow_id ?? workflowIdArg,
    };
  }
  return input;
}

function normalizeRunSkillStepInput(input = {}) {
  const stateFieldNames = [
    "step",
    "workflow_id",
    "draft_id",
    "draft_hash",
    "prompt",
    "approved_draft_id",
    "approved_draft_hash",
    "approval_prompt",
    "approval_text",
    "approved_by",
    "approved_at",
    "chain_id",
    "collateral_address",
    "collateral_symbol",
    "market_id",
    "upcoming_market",
    "precog_status",
    "pending_check",
    "last_result",
    "create_intent",
    "history",
    "created_at",
    "updated_at",
  ];
  let next = { ...input };
  if (!next.state && (next.step || next.draft_id || next.workflow_id || next.draft_hash)) {
    next.state = Object.fromEntries(
      stateFieldNames
        .filter((key) => next[key] !== undefined)
        .map((key) => [key, next[key]]),
    );
  }

  const event = { ...(next.event ?? {}) };
  const eventInput = event.input ?? {};

  if (eventInput.approved === true && event.approved !== true) {
    event.approved = true;
  }
  for (const key of [
    "chain_id",
    "collateral_address",
    "collateral_symbol",
    "image_url",
    "approved_draft_id",
    "approved_draft_hash",
    "approval_text",
    "category",
    "creator_address",
    "creator_signature",
  ]) {
    if (eventInput[key] !== undefined && event[key] === undefined) {
      event[key] = eventInput[key];
    }
  }
  for (const key of ["chain_id", "collateral_address", "collateral_symbol", "image_url"]) {
    if (next[key] !== undefined && event[key] === undefined) {
      event[key] = next[key];
    }
  }

  next.event = event;
  return next;
}

async function resolveRunSkillStepInput(actionName, input = {}) {
  if (actionName !== "run_skill_step") return input;

  let next = normalizeRunSkillStepInput(input);
  const workflowId = next.workflow_id ?? next.state?.workflow_id;
  const state = next.state ?? {};
  const missingPersistedState = !state.step || !state.workflow_id;

  if (workflowId && missingPersistedState) {
    const persisted = await loadWorkflowState(workflowId);
    if (!persisted) {
      fail(
        `run_skill_step could not find workflow ${workflowId} in ${stateDir}. Run node scripts/inspect_state.mjs or node scripts/next_step.mjs --workflow-id ${workflowId}; do not create workflow files manually.`,
      );
    }
    next.state = {
      ...persisted,
      ...state,
      workflow_id: persisted.workflow_id ?? workflowId,
    };
  }

  rejectHandWrittenBypass(next);
  return next;
}

function rejectHandWrittenBypass(input = {}) {
  const state = input.state ?? {};
  const event = input.event ?? {};
  const draftId =
    state.draft_id ??
    state.approved_draft_id ??
    event.approved_draft_id ??
    event.input?.approved_draft_id;
  const draftHash =
    state.draft_hash ??
    state.approved_draft_hash ??
    event.approved_draft_hash ??
    event.input?.approved_draft_hash;
  const workflowId = state.workflow_id ?? input.workflow_id;

  if (draftId && !RUNTIME_DRAFT_ID.test(String(draftId))) {
    fail(
      `run_skill_step rejected hand-written draft id ${draftId}. Do not create or edit .forecastos/drafts/* by hand; rerun draft_market or run_skill_step with --input <json-file>.`,
    );
  }
  if (draftHash && !RUNTIME_DRAFT_HASH.test(String(draftHash))) {
    fail(
      `run_skill_step rejected hand-written draft hash ${draftHash}. Do not create or edit .forecastos/drafts/* by hand; use the draft_hash returned by ForecastOS.`,
    );
  }
  if (workflowId && !RUNTIME_WORKFLOW_ID.test(String(workflowId))) {
    fail(
      `run_skill_step rejected hand-written workflow id ${workflowId}. Do not create or edit .forecastos/workflows/* by hand; use the workflow_id returned by ForecastOS.`,
    );
  }

  const atIntake = !state.step || state.step === "intake";
  const hasApprovalSignal =
    event.approved === true ||
    event.approved_draft_id ||
    event.input?.approved === true ||
    event.input?.approved_draft_id;
  const hasDraftInput = Boolean(event.input && Object.keys(event.input).length);
  if (atIntake && hasApprovalSignal && !hasDraftInput && !workflowId) {
    fail(
      "run_skill_step received approval fields without a persisted workflow state. Pass the full state object from the prior run_skill_step result, or resume with workflow_id from .forecastos/workflows/all/. Do not hand-write workflow JSON.",
    );
  }
}

function mergeWalletOutput(actionName, input, walletOutput) {
  if (!walletOutput) return input;
  const resolved = walletOutput.result ?? walletOutput;
  const event = resolved.event ?? {};
  const fundingRequest = resolved.funding_request ?? event.funding_request;
  const walletAudit = resolved.wallet_audit ?? event.wallet_audit;
  if (actionName === "run_skill_step" || actionName === "publish_approved_market") {
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
    return forecastos.runSkillStep(input.state ?? {}, input.event ?? {});
  }
  if (actionName === "publish_approved_market") {
    return publishApprovedMarket(forecastos, input);
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

async function publishApprovedMarket(forecastos, input = {}) {
  const workflowId = input.workflow_id ?? input.state?.workflow_id ?? input.workflow?.workflow_id;
  if (!workflowId) {
    fail("publish_approved_market requires workflow_id for the persisted create_market workflow. Pass --input <json containing workflow_id> or --workflow-id <workflow_id>; do not hand-write .forecastos/workflows files.");
  }
  if (!RUNTIME_WORKFLOW_ID.test(String(workflowId))) {
    fail(
      `publish_approved_market rejected hand-written workflow id ${workflowId}. Advance the workflow with run_skill_step --input <json-file> and use the returned workflow_id.`,
    );
  }

  const state = input.state ?? input.workflow ?? await loadWorkflowState(workflowId);
  if (!state) {
    fail(`publish_approved_market could not find workflow ${workflowId} in ${stateDir}. Run node scripts/inspect_state.mjs or node scripts/next_step.mjs --workflow-id <existing_workflow_id> to find an existing persisted workflow; do not create workflow files manually.`);
  }
  if (state.step !== "create_market") {
    fail(
      `publish_approved_market requires workflow ${workflowId} to be at create_market, found ${state.step ?? "unknown"}. Use node scripts/next_step.mjs --workflow-id ${workflowId} and advance with run_skill_step --input <json-file> from the persisted state instead of rewriting workflow JSON.`,
    );
  }

  const event = withoutUndefined({
    ...(input.event ?? {}),
    image_url: input.image_url ?? input.event?.image_url,
    category: input.category ?? input.event?.category,
    creator_address: input.creator_address ?? input.event?.creator_address,
    creator_signature: input.creator_signature ?? input.event?.creator_signature,
    creator_email: input.creator_email ?? input.event?.creator_email,
    wallet_provider: input.wallet_provider ?? input.event?.wallet_provider,
    wallet_audit: input.wallet_audit ?? input.event?.wallet_audit,
    chain_id: input.chain_id ?? input.event?.chain_id ?? state.chain_id,
    collateral_address: input.collateral_address ?? input.event?.collateral_address ?? state.collateral_address,
    collateral_symbol: input.collateral_symbol ?? input.event?.collateral_symbol ?? state.collateral_symbol,
  });
  if (!event.creator_address || !event.creator_signature) {
    fail("publish_approved_market requires wallet output containing event.creator_address and event.creator_signature (or top-level creator_address/creator_signature). Pass --wallet-output <adapter-output-json> from the selected wallet adapter; Base MCP request ids are not signatures.");
  }

  return forecastos.runSkillStep(state, event);
}

async function loadWorkflowState(workflowId) {
  const workflowPath = join(stateDir, "workflows", "all", `${workflowId}.json`);
  try {
    return parseJsonInput(await readFile(workflowPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
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
