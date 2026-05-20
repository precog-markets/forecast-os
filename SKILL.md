---
name: forecast-os
description: "Use ForecastOS for multi-outcome prediction-market workflows across Codex, Claude Code, and OpenClaw: drafting market specs, inspecting .forecastos workflow memory, using read-only MCP context, generating wallet-agnostic funding intents for Bankr/Privy/Turnkey/manual wallets, running the bundled action bridge for human-approved Precog create/fund/consume steps, and enforcing no wallet custody, no signing, and no direct funding without operator approval."
---

# ForecastOS

Use ForecastOS as a bounded prediction-market workflow skill. Keep MCP read-only, use scripts for deterministic execution, and require human/operator approval before live creation or funding.

## Core Rules

- Assume every market is `multi_outcome`; model yes/no ideas as explicit multi-outcome labels such as `Yes` and `No`.
- Normalize and present all market times in UTC. Label user-facing close/resolution times as UTC.
- Read chain identity only from `.forecastos/config.json`; do not ask users to choose a chain or accept action-level chain overrides.
- Default to Base USDC collateral from `.forecastos/config.json`; only use another `collateral_address` when the operator explicitly asks for it.
- Use `.forecastos/` as structured workflow memory for drafts, approvals, created markets, funding, prediction consumption, and done states.
- Use `mcp/` only for read-only docs, templates, examples, drafts, and workflow inspection.
- Use `scripts/forecastos_action.mjs` for workflow execution; do not add mutating MCP tools.
- For funding, first generate a wallet-agnostic `prepare_funding_intent`; Bankr, Privy, Turnkey, or a manual wallet resolves it into `tx_hash`, `funder_address`, and `funder_signature`.
- For `fund_market`, send `amount` as a plain Precog display-unit decimal string like `"1"`; never use wei/base units or token symbols.
- Do not custody wallets, fetch nonces, sign messages, swap assets, or create funding transactions.
- Treat Bankr, Privy, and Turnkey as external wallet resolvers unless a trusted adapter is explicitly configured.

## Workflow

```txt
intake -> draft -> needs_info / await_approval -> create_market
  -> await_precog_approval -> fund -> consume_prediction -> done
```

Present a friendly draft summary before creation. Ask the user to reply `yes` to approve; keep draft IDs and hashes in `.forecastos/` memory, not in the main user-facing response. Fund only after Precog status is `VALIDATED`. Consume prediction data only after the upcoming market is `DEPLOYED`.

## Read Next

- Read `references/workflow.md` for the workflow graph and `.forecastos/` status folders.
- Read `references/actions.md` before running `scripts/forecastos_action.mjs`.
- Read `references/action-policy.md` before create, fund, approval, wallet, or prediction actions.
- Read `references/safety.md` when a task touches live API calls, funding, signing, or secrets.
- Read `references/mcp.md` when configuring or inspecting the read-only MCP server.
- Read `references/tool-schemas.md` or `assets/schemas/actions.json` for action input shapes.
- Use `assets/templates/multi-outcome-market.md` when drafting a market structure.
- Use `references/examples/` only when an example is directly relevant.

## Useful Commands

```txt
node scripts/validate_skill.mjs
node scripts/inspect_state.mjs
node scripts/render_review.mjs --workflow-id <workflow_id>
node scripts/next_step.mjs --workflow-id <workflow_id>
node scripts/forecastos_action.mjs <action> --input <json-file>
node mcp/server.js
```
