#!/usr/bin/env node
// Builds a read-only human approval view from a ForecastOS draft or workflow.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const stateDir = process.env.FORECASTOS_STATE_DIR ?? argValue("--state-dir") ?? ".forecastos";
const draftIdArg = argValue("--draft-id");
const workflowIdArg = argValue("--workflow-id");

if (!draftIdArg && !workflowIdArg) {
  fail("render_review requires --draft-id <draft_id> or --workflow-id <workflow_id>.");
}

const workflow = workflowIdArg ? await readWorkflow(workflowIdArg) : null;
const draftId = draftIdArg ?? workflow?.draft_id ?? workflow?.draft?.draft_id;

if (!draftId) {
  fail(`Workflow '${workflowIdArg}' does not reference a draft_id.`);
}

const draft = await readDraft(draftId);
const market = draft.market ?? {};
const quality = draft.quality ?? {};

print({
  status: workflow?.step ?? draft.status ?? "draft",
  workflow_id: workflow?.workflow_id ?? workflowIdArg ?? null,
  draft_id: draft.draft_id ?? draftId,
  draft_hash: draft.draft_hash ?? null,
  market: market,
  quality: quality,
  missing_fields: draft.missing_fields ?? workflow?.missing_fields ?? [],
  approval_text: draft.approval_text ?? workflow?.approval_text ?? null,
  review_message: buildReviewMessage(draft, workflow),
});

function buildReviewMessage(draft, workflow) {
  const market = draft.market ?? {};
  const lines = [
    `ForecastOS review for draft ${draft.draft_id ?? "unknown"}`,
    workflow?.workflow_id ? `Workflow: ${workflow.workflow_id}` : null,
    market.title ? `Title: ${market.title}` : null,
    market.question ? `Question: ${market.question}` : null,
    Array.isArray(market.outcomes) ? `Outcomes: ${market.outcomes.join(" / ")}` : null,
    market.resolution_criteria ? `Resolution: ${market.resolution_criteria}` : null,
    market.close_time ? `Close time: ${market.close_time}` : null,
    market.resolution_time ? `Resolution time: ${market.resolution_time}` : null,
    market.source_of_truth ? `Source: ${market.source_of_truth}` : null,
    draft.approval_text ? `Approval text: ${draft.approval_text}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

async function readWorkflow(workflowId) {
  return readJson(join(stateDir, "workflows", "all", `${workflowId}.json`), "workflow", workflowId);
}

async function readDraft(draftId) {
  return readJson(join(stateDir, "drafts", `${draftId}.json`), "draft", draftId);
}

async function readJson(path, kind, id) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      fail(`ForecastOS ${kind} '${id}' was not found in ${stateDir}.`);
    }
    throw error;
  }
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
