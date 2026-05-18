import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

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
