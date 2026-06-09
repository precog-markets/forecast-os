#!/usr/bin/env node
// Reads one workflow and reports the next valid ForecastOS operator action.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillRoot = dirname(scriptDir);
const defaultStateDir = join(skillRoot, ".forecastos");
const stateDir = process.env.FORECASTOS_STATE_DIR ?? argValue("--state-dir") ?? defaultStateDir;
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
    prepareCreateIntent: "node scripts/forecastos_action.mjs prepare_create_intent --input <json-file>",
    publishApprovedMarket: `node scripts/forecastos_action.mjs publish_approved_market --input <workflow-id-json> --wallet-output <wallet-adapter-output-json>`,
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
      notes: [
        "Ask natural questions from suggest_next_questions when available; do not expose schema field names in chat.",
        "After the user answers, rerun run_skill_step with the added details.",
      ],
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
      next_action: "prepare_create_intent",
      needs_human_input: true,
      required_fields: [
        "image_url",
        "wallet_or_action_tool availability",
      ],
      suggested_command: commands.prepareCreateIntent,
      notes: [
        "If chain/collateral is not already specified, ask clearly: With collateral from which chain? Offer defaults: USDC on Base or USDC on Arbitrum.",
        "The draft is approved. Ask: What wallet or wallet/action tool would you like to use to publish this? Options include Bankr, Privy, Base MCP (Base), another configured wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/).",
        "Do not ask the user for raw wallet address or signature fields in normal chat.",
        "If no wallet/action tool is configured, direct the user to the [Precog creation area](https://core.precog.markets/launchpad/) to create the market.",
        "Before creation, any wallet/action tool must be allowed to sign the canonical Precog typed-data payload for CREATE_UPCOMING_MARKET.",
        "Base MCP smart-account/WebAuthn signatures are valid when signed over the canonical Precog typed data and current pending nonce, even when the returned hex signature is an EIP-1271/ERC-6492 envelope rather than a compact EOA signature.",
        `After the wallet/action tool resolves creator_address and creator_signature, publish with: ${commands.publishApprovedMarket}. The bridge loads persisted create_market state and workflow memory advances.`,
        "Do not create or edit .forecastos/workflows/* files by hand. If workflow state is unclear, inspect the existing workflow rather than inventing a workflow_id.",
        "Use the direct create_market action only as a low-level API call when you intentionally do not need workflow state advancement.",
        "If the user already picked chain/collateral, respect it. Otherwise use configured defaults after asking the chain question.",
        "Precog requires a valid image_url; local ForecastOS drafts do not invent one.",
        "For concrete wallet providers, read references/wallet-adapters.md and use the matching top-level adapter under adapters/wallets/<provider>/ after prepare_create_intent.",
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
      required_fields: ["amount", "wallet_or_action_tool availability", "funding_asset or collateral_symbol"],
      suggested_command: commands.prepareFundingIntent,
      notes: [
        "If chain/collateral is not already specified, ask clearly: With collateral from which chain? Offer defaults: USDC on Base or USDC on Arbitrum.",
        "Generate a wallet-agnostic funding intent, then ask what wallet or wallet/action tool should resolve funding. Options include Bankr, Privy, Base MCP (Base), another configured wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/).",
        "Use Precog display units for amount, for example amount 1 for 1 MATE; do not send wei/base units or token symbols.",
        "When the user did not specify chain/collateral, ask first, then proceed with the selected chain or configured default.",
        "Before funding, make sure the wallet policy allows EIP-712 signing and transaction signing/sending.",
        "If the collateral token allowance is insufficient, the wallet/action tool must approve the token before funding.",
        "After the wallet/action tool resolves token approval if needed, sends the funding transaction, signs EIP-712 with the post-transaction pending nonce, and returns tx_hash, funder_address, and funder_signature, call fund_market.",
        "If no wallet/action tool is configured, do not ask for raw signatures in chat; direct the user to the [Precog creation area](https://core.precog.markets/launchpad/).",
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
        "active .forecastos/config.json precog.supported_chains[chain_id].deployed_master_address before deployed market fetch",
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
