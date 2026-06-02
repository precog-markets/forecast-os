#!/usr/bin/env node
// Polls one Precog upcoming market approval status. Scheduling is external.
import {
  DirectoryDraftStateStore,
  createForecastOS,
} from "./forecastos_runtime.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillRoot = dirname(scriptDir);
const defaultStateDir = join(skillRoot, ".forecastos");
const stateDir = process.env.FORECASTOS_STATE_DIR ?? argValue("--state-dir") ?? defaultStateDir;
const workflowId = argValue("--workflow-id");
const marketId = argValue("--market-id");
const autoRedraft = hasArg("--auto-redraft");

if (!workflowId && !marketId) {
  fail("check_pending_market requires --workflow-id <workflow_id> or --market-id <upcoming_market_id>.");
}
if (autoRedraft && !workflowId) {
  fail("check_pending_market --auto-redraft requires --workflow-id so the replacement draft can link to workflow memory.");
}

const store = new DirectoryDraftStateStore(stateDir);
const runtime = createForecastOS({
  store,
  fetch: testFetchFromEnv() ?? globalThis.fetch,
});

if (workflowId) {
  const workflow = await store.getWorkflow(workflowId);
  if (!workflow) fail(`Workflow '${workflowId}' was not found in ${stateDir}.`);
  const result = await runtime.runSkillStep(
    {
      ...workflow,
      step: workflow.step === "await_precog_approval" ? workflow.step : "await_precog_approval",
    },
    {},
  );
  const summary = {
    ...summarizeApproval(result.tool_result),
    workflow_id: workflowId,
    state: result.state,
    agent_message: result.agent_message,
  };
  if (autoRedraft && summary.rejected) {
    summary.auto_redraft = await runtime.autoRedraftFromRejection(
      result.state,
      result.tool_result,
    );
  }
  print({
    ...summary,
  });
} else {
  const result = await runtime.awaitPrecogApproval(
    { step: "await_precog_approval", market_id: marketId },
    {},
  );
  print(summarizeApproval(result));
}

function summarizeApproval(result = {}) {
  return {
    ok: true,
    status: result.ready_to_fund ? "approved" : result.rejected ? "rejected" : "pending",
    ready_to_fund: Boolean(result.ready_to_fund),
    rejected: Boolean(result.rejected),
    pending: !result.ready_to_fund && !result.rejected,
    continue_schedule: !result.ready_to_fund && !result.rejected,
    precog_status: result.precog_status ?? result.status ?? null,
    market_id: result.market_id ?? result.upcoming_market ?? null,
    validator_feedback: result.validator_feedback ?? [],
    precog_response: result.precog_response ?? null,
  };
}

function testFetchFromEnv() {
  const fixture = process.env.FORECASTOS_TEST_PRECOG_RESPONSE;
  if (!fixture) return null;
  return async () => ({
    ok: true,
    status: 200,
    async text() {
      return fixture;
    },
  });
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
