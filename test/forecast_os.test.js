import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  DirectoryDraftStateStore,
  createForecastOS,
} from "../scripts/forecastos_runtime.mjs";

const execFileAsync = promisify(execFile);
const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("forecastos_action creates and advances files in .forecastos", async () => {
  const rootDir = join(skillRoot, "test-output");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(rootDir, { recursive: true });

  const inputPath = join(rootDir, "input.json");
  await writeFile(
    inputPath,
    JSON.stringify(
      {
        state: {
          step: "intake",
          prompt: "Create a market on which launchpad wins June 2026 agent launches",
        },
        event: {
          input: {
            prompt: "Create a market on which launchpad wins June 2026 agent launches",
            requested_outcomes: ["Clawpump", "Liquid", "Virtuals", "Other"],
            source_hints: ["Public launchpad dashboards"],
            requested_close_time: "2026-06-30T23:59:59Z",
            requested_resolution_time: "2026-07-03T00:00:00Z",
          },
        },
      },
      null,
      2,
    ),
  );

  const drafted = await runActionBridge("run_skill_step", inputPath, stateDir);
  const draftId = drafted.result.state.draft_id;
  const workflowId = drafted.result.state.workflow_id;

  assert.equal(drafted.status, "ok");
  assert.equal(drafted.runtime, "bundled");
  assert.equal(drafted.result.state.step, "await_approval");
  assert.equal(
    (await readJson(join(stateDir, "drafts", `${draftId}.json`))).market.market_type,
    "multi_outcome",
  );
  assert.equal(
    (await readJson(join(stateDir, "workflows", "all", `${workflowId}.json`))).step,
    "await_approval",
  );
  assert.equal(
    (
      await readJson(
        join(stateDir, "workflows", "await_approval", `${workflowId}.json`),
      )
    ).workflow_id,
    workflowId,
  );

  const approvalInputPath = join(rootDir, "approval.json");
  await writeFile(
    approvalInputPath,
    JSON.stringify(
      {
        state: drafted.result.state,
        event: {
          approved: true,
          approved_by: "operator",
          approval_text: drafted.result.state.approval_text,
        },
      },
      null,
      2,
    ),
  );

  const approved = await runActionBridge(
    "run_skill_step",
    approvalInputPath,
    stateDir,
  );

  assert.equal(approved.status, "ok");
  assert.equal(approved.result.state.step, "create_market");
  assert.equal(
    (await readJson(join(stateDir, "workflows", "all", `${workflowId}.json`))).step,
    "create_market",
  );
  assert.equal(
    (
      await readJson(join(stateDir, "workflows", "create_market", `${workflowId}.json`))
    ).workflow_id,
    workflowId,
  );
  await assert.rejects(
    readFile(join(stateDir, "workflows", "await_approval", `${workflowId}.json`), "utf8"),
  );
});

test("bundled runtime builds Precog create and fund requests from local config", async () => {
  const rootDir = join(skillRoot, "api-test-output");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: "https://tracker.precog.market/",
        open_api_key: "test-open-api-key",
      },
    }),
  );

  const requests = [];
  const forecastos = createForecastOS({
    store: new DirectoryDraftStateStore(stateDir),
    fetch: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      const body = url.endsWith("/create-upcoming-market/")
        ? { upcoming_market: 123, status: "PENDING" }
        : { upcoming_market: 123, status: "FUNDED", funding_amount: 100.0 };
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(body);
        },
      };
    },
    now: () => new Date("2026-06-01T12:00:00Z"),
  });
  const draft = await forecastos.draftMarket({
    prompt: "Which launchpad gets the most new agents in June 2026?",
    requested_outcomes: ["Clawpump", "Liquid", "Virtuals", "Other"],
    source_hints: ["Public launchpad dashboards"],
    requested_close_time: "2026-06-30T23:59:59Z",
    requested_resolution_time: "2026-07-03T00:00:00Z",
  });

  const created = await forecastos.createMarket({
    draft_id: draft.draft_id,
    approved: true,
    approved_by: "operator",
    approval_text: draft.approval_text,
    collateral_address: "0xCollateral",
    chain_id: 8453,
    creator_address: "0xCreator",
    creator_signature: "0xCreatorSignature",
  });
  const funded = await forecastos.fundMarket(
    { step: "fund", market_id: created.market_id, precog_approval: { status: "PENDING" } },
    {
      approved: true,
      funding_request: {
        amount: "100000000",
        tx_hash: "0xTransactionHash",
        funder_address: "0xFunder",
        funder_signature: "0xFunderSignature",
      },
    },
  );

  assert.equal(created.market_id, 123);
  assert.equal(funded.precog_status, "FUNDED");
  assert.equal(requests[0].url, "https://tracker.precog.market/api/v1/create-upcoming-market/");
  assert.equal(requests[1].url, "https://tracker.precog.market/api/v1/fund-upcoming-market/");
  assert.equal(requests[0].options.headers["x-api-key"], "test-open-api-key");
  assert.equal(requests[1].body.upcoming_market, 123);
});

async function runActionBridge(action, inputPath, stateDir) {
  const scriptPath = join(skillRoot, "scripts", "forecastos_action.mjs");
  const { stdout } = await execFileAsync(
    process.execPath,
    [scriptPath, action, "--input", inputPath],
    {
      env: {
        ...process.env,
        FORECASTOS_STATE_DIR: stateDir,
      },
    },
  );
  return JSON.parse(stdout);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
