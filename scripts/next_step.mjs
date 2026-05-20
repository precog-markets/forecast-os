#!/usr/bin/env node
// Reads one workflow and reports the next valid ForecastOS operator action.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const stateDir = process.env.FORECASTOS_STATE_DIR ?? argValue("--state-dir") ?? ".forecastos";
const workflowId = argValue("--workflow-id");

if (!workflowId) {
  fail("next_step requires --workflow-id <workflow_id>.");
}

const workflow = await readWorkflow(workflowId);
const step = normalizeStep(workflow.step);
const guidance = guidanceFor(step, workflow);

print({
  workflow_id: workflow.workflow_id ?? workflowId,
  current_step: workflow.step ?? "unknown",
  next_action: guidance.next_action,
  needs_human_input: guidance.needs_human_input,
  required_fields: guidance.required_fields,
  suggested_command: guidance.suggested_command,
  notes: guidance.notes,
});

function guidanceFor(step, workflow) {
  const workflowId = workflow.workflow_id ?? "<workflow_id>";

  const commands = {
    runSkillStep: "node scripts/forecastos_action.mjs run_skill_step --input <json-file>",
    createMarket: "node scripts/forecastos_action.mjs create_market --input <json-file>",
    awaitPrecog:
      "node scripts/forecastos_action.mjs await_precog_approval --input <json-file>",
    prepareFundingIntent: "node scripts/forecastos_action.mjs prepare_funding_intent --input <json-file>",
    fundMarket: "node scripts/forecastos_action.mjs fund_market --input <json-file>",
    consumePrediction:
      "node scripts/forecastos_action.mjs consume_prediction --input <json-file>",
    renderReview: `node scripts/render_review.mjs --workflow-id ${workflowId}`,
  };

  if (step === "intake" || step === "draft") {
    return {
      next_action: "run_skill_step",
      needs_human_input: false,
      required_fields: ["prompt", "requested_outcomes"],
      suggested_command: commands.runSkillStep,
      notes: ["Advance the workflow into drafting/evaluation. Markets should remain multi_outcome."],
    };
  }

  if (step === "needs_info") {
    return {
      next_action: "collect_missing_info",
      needs_human_input: true,
      required_fields: workflow.missing_fields ?? ["missing market facts"],
      suggested_command: commands.runSkillStep,
      notes: ["Ask the human for missing fields, then rerun run_skill_step."],
    };
  }

  if (step === "await_approval") {
    return {
      next_action: "collect_approval",
      needs_human_input: true,
      required_fields: ["approved_by", "approval response: yes/approved/looks good"],
      suggested_command: commands.renderReview,
      notes: [
        "Show the friendly review message and wait for a simple approval before create_market.",
      ],
    };
  }

  if (step === "create_market") {
    return {
      next_action: "create_market",
      needs_human_input: false,
      required_fields: [
        "approved:true",
        "approved_by",
        "approved_draft_hash from workflow state",
        "image_url",
        "creator_address",
        "creator_signature",
      ],
      suggested_command: commands.createMarket,
      notes: [
        "The draft is approved. To publish it, ask for a market image URL and wallet approval from the creator wallet.",
        "ForecastOS uses Base from config and uses Base USDC unless the operator explicitly provides another collateral_address.",
        "Precog requires a valid image_url; local ForecastOS drafts do not invent one.",
      ],
    };
  }

  if (step === "await_precog_approval") {
    return {
      next_action: "await_precog_approval",
      needs_human_input: false,
      required_fields: [
        "market_id",

      ],
      suggested_command: commands.awaitPrecog,
      notes: ["Funding is valid only after Precog returns status VALIDATED."],
    };
  }

  if (step === "fund") {
    return {
      next_action: "prepare_funding_intent",
      needs_human_input: true,
      required_fields: ["amount", "wallet_provider: bankr|privy|turnkey|manual", "funding_asset or collateral_symbol"],
      suggested_command: commands.prepareFundingIntent,
      notes: [
        "Generate a wallet-agnostic funding intent; Bankr, Privy, Turnkey, or a manual wallet resolves it.",
        "Use Precog display units for amount, for example amount 1 for 1 MATE; do not send wei/base units or token symbols.",
        "Do not ask for chain_id; ForecastOS assumes Base chain_id 8453 from .forecastos/config.json.",
        "After Bankr, Privy, Turnkey, or a manual wallet resolves tx_hash, funder_address, and funder_signature, call fund_market.",
      ],
    };
  }

  if (step === "consume_prediction") {
    return {
      next_action: "consume_prediction",
      needs_human_input: false,
      required_fields: [
        "market_id",

        "deployed_market_id or deployable upcoming market status",
        ".forecastos/config.json precog.deployed_master_address before deployed market fetch",
      ],
      suggested_command: commands.consumePrediction,
      notes: [
        "Checks the upcoming market deployment first, then fetches the deployed market from Precog /api/v1/markets/.",
        "Workflow stays in consume_prediction until Precog returns a deployed market.",
      ],
    };
  }

  if (step === "done") {
    return {
      next_action: "none",
      needs_human_input: false,
      required_fields: [],
      suggested_command: null,
      notes: ["Workflow is complete."],
    };
  }

  return {
    next_action: "inspect_state",
    needs_human_input: false,
    required_fields: [],
    suggested_command: "node scripts/inspect_state.mjs",
    notes: [`Unknown workflow step '${workflow.step ?? "unknown"}'. Inspect state before acting.`],
  };
}

function normalizeStep(step) {
  if (step === "funded") return "fund";
  return step ?? "unknown";
}

async function readWorkflow(id) {
  const path = join(stateDir, "workflows", "all", `${id}.json`);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      fail(`ForecastOS workflow '${id}' was not found in ${stateDir}.`);
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
