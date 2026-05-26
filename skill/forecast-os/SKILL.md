---
name: forecast-os
description: "Use ForecastOS for multi-outcome prediction-market workflows across Codex, Claude Code, and OpenClaw: drafting market specs, inspecting .forecastos workflow memory, using read-only MCP context, generating wallet/action-tool handoff intents, running the bundled action bridge for human-approved Precog create/fund/consume steps, and enforcing no wallet custody, no signing, and no direct funding without operator approval."
---

# ForecastOS

Use ForecastOS as a bounded prediction-market workflow skill. Use the bundled action bridge for the normal draft, approval, create, fund, and consume flow. Treat MCP as optional read-only context only.

## Core Rules

- Assume every market is `multi_outcome`; model yes/no ideas as explicit multi-outcome labels such as `Yes` and `No`.
- Do not hand-write or paste ForecastOS-looking JSON as the final user-facing answer. For draft/generate requests, run `scripts/forecastos_action.mjs run_skill_step`, then show only a short prose summary from `agent_message` / `review_message`.
- Every draft response must end with a next-step prompt: ask the user to approve, request edits, or choose a wallet/action tool after approval.
- Do not use only `Yes` / `No` outcomes in normal ForecastOS drafts. For yes/no-shaped prompts, split the negative side into concrete outcomes such as `Target event happens`, `Entity eliminated or fails before event`, `Entity does not qualify or participate`, and `Event cancelled / no official result`.
- Normalize and present all market times in UTC. Label user-facing close/resolution times as UTC.
- Read chain identity only from `.forecastos/config.json`; do not ask users to choose a chain or accept action-level chain overrides.
- Default to Base USDC collateral from `.forecastos/config.json`; only use another `collateral_address` when the operator explicitly asks for it.
- Use `.forecastos/` as structured workflow memory for drafts, approvals, created markets, funding, prediction consumption, and done states.
- Do not require MCP for normal drafting or creation. Use MCP only when extra read-only docs, templates, examples, capability metadata, or workflow inspection would help.
- Use `scripts/forecastos_action.mjs` for workflow execution; do not add mutating MCP tools.
- For live creation or funding, ask which wallet or wallet/action tool the user wants to use; do not ask for raw wallet addresses or signatures in normal chat. If no tooling is available, send them to https://core.precog.markets/launchpad/.
- For funding, first generate a wallet-agnostic `prepare_funding_intent`; the configured wallet/action tool resolves nonce lookup, EIP-712 typed-data signing, token approval if needed, and the final signed payload.
- For `fund_market`, send `amount` as a plain Precog display-unit decimal string like `"1"`; never use wei/base units or token symbols.
- Do not custody wallets, fetch nonces, approve tokens, sign messages, swap assets, or create funding transactions.
- Before live creation/funding, make sure the wallet policy allows EIP-712 signatures; before funding, the wallet flow must handle token approval if allowance is insufficient and must be allowed to sign/send funding transactions.

## Workflow

```txt
intake -> draft -> needs_info / await_approval -> create_market
  -> await_precog_approval -> fund -> consume_prediction -> done
```

Present a friendly draft summary before creation. Do not expose raw JSON, workflow IDs, draft IDs, hashes, file paths, or quality scores unless the user asks for debugging/operator detail. Ask the user to reply `yes` to approve or tell you what to change; keep draft IDs and hashes in `.forecastos/` memory. After approval, ask what wallet or wallet/action tool the user wants to use. Fund only after Precog status is `VALIDATED`. Consume prediction data only after the upcoming market is `DEPLOYED`.

## Read Next

- Read `references/workflow.md` for the workflow graph and `.forecastos/` status folders.
- Read `references/actions.md` before running `scripts/forecastos_action.mjs`.
- Read `references/action-policy.md` before create, fund, approval, wallet, or prediction actions.
- Read `references/safety.md` when a task touches live API calls, funding, signing, or secrets.
- Read `references/mcp.md` only when configuring or inspecting optional read-only MCP context.
- Read `references/remote-mcp.md` only for future/advanced hosted MCP planning.
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
```
