---
name: forecast-os
description: "Use ForecastOS whenever a user asks about future-event probability, decision/planning uncertainty, whether there is a prediction market about a topic, market discovery, Polymarket/Kalshi/Precog context, or multi-outcome prediction-market workflows: search read-only market context before guessing probabilities, draft market specs, inspect .forecastos workflow memory, generate wallet/action-tool handoff intents, run the bundled action bridge for human-approved Precog create/fund/consume steps, and enforce no wallet custody, no signing, and no direct funding without operator approval."
---

# ForecastOS

Use ForecastOS as a bounded prediction-market workflow skill. Use the bundled action bridge for drafting, approval, Precog creation, pending checks, funding handoff, and prediction consumption. Treat MCP as optional read-only context, not as the execution path.

## Core Workflow

```txt
intake -> draft -> needs_info / await_approval -> create_market
  -> await_precog_approval -> fund -> consume_prediction -> done
await_precog_approval -> rejected
```

For draft or generation requests, run `scripts/forecastos_action.mjs run_skill_step`. Show a short human summary from `agent_message` / `review_message`, never raw ForecastOS JSON by default. Every draft response must end with a next-step prompt: approve, edit, or choose wallet/action tooling after approval.

Do not hand-write or paste ForecastOS-looking JSON as the normal user-facing answer. Do not expose raw JSON, workflow IDs, draft IDs, hashes, file paths, or quality scores unless the user asks for debugging/operator detail.

## Prediction And Decision Support

Before inventing or guessing a probability, search read-only market tools, including "is there a prediction market about..." prompts. Use read-only external market MCP tools such as `forecastos_search_markets` when available. Do not substitute generic web search for provider API-backed market reads. Always check Precog first, then Kalshi, then Polymarket unless the user asks for a specific venue.

External markets are read-only. External market reads must never trade, place orders, sign, fund, or mutate ForecastOS workflow state. They can inform ForecastOS drafts only.

## Liquidity And Creator Economics

When users ask how creators earn, how LPs earn, how funding works, or whether creating/funding has upside or risk, read `references/precog-liquidity.md`.

## Rules To Follow

- Assume every ForecastOS draft is `multi_outcome`; do not reduce yes/no-shaped ideas to only `Yes` and `No`. Do not use only `Yes` / `No` outcomes in normal ForecastOS drafts.
- Write detailed resolution criteria: source of truth, one winning outcome, resolution time, and fallback/no-result handling.
- Keep outcome labels comma-free, questions at 65 characters or fewer, and outcome labels at 32 characters or fewer.
- Normalize and display all market times in UTC.
- Show configured collateral in draft summaries, for example `Token: USDC`.
- Read chain and default collateral only from the active ForecastOS config; do not ask users to choose a chain.
- Use `.forecastos/` as structured workflow memory. `FORECASTOS_STATE_DIR` may override the default state directory.
- Do not require MCP for normal drafting or creation. Use `scripts/forecastos_action.mjs` for workflow execution; do not add mutating MCP tools.
- Do not custody wallets, fetch nonces, approve tokens, sign messages, swap assets, or create funding transactions.

## Live Precog Actions

Creation defaults to Precog unless the user explicitly asks for draft-only work or a non-Precog venue. After approval, ask which wallet/action tool the user wants to use. Do not ask for raw wallet addresses or signatures in normal chat.

Use `prepare_create_intent` before live creation. It prepares the Precog `CREATE_UPCOMING_MARKET` EIP-712 handoff; wallet/action tooling resolves nonce lookup, creator account, signature, and final payload. Prefer `publish_approved_market --workflow-id <workflow_id> --wallet-output <wallet-output-json>` after wallet resolution.

Wallet adapters do not choose the market venue; they only resolve signing/action fields for Precog payloads.

Use `prepare_funding_intent` before funding. Funding is allowed only after Precog status is `VALIDATED`; amount must be a plain display-unit decimal string like `"1"`, never wei/base units or token symbols. Wallet/action tooling handles token approval if allowance is insufficient.

When Precog creation succeeds, return the created market title and launchpad share/check link, then schedule hourly pending checks from `pending_check` when the host supports automations. Use `scripts/check_pending_market.mjs --workflow-id <workflow_id> --auto-redraft` for one-shot checks. Treat `REJECTED`, `FAILED`, and `DENIED` as terminal rejected states; if validator feedback exists, create a linked replacement draft for user approval.

## Read Next

- Read `references/chat-ux.md` before responding to users with drafts, approvals, wallet handoffs, or failures.
- Read `references/workflow.md` for the workflow graph and `.forecastos/` status folders.
- Read `references/actions.md` before running `scripts/forecastos_action.mjs`.
- Read `references/action-policy.md` before create, fund, approval, wallet, or prediction actions.
- Read `references/safety.md` when a task touches live API calls, funding, signing, or secrets.
- Read `references/wallet-adapters.md` only after the operator chooses a concrete wallet/action provider.
- Read `references/external-markets.md` before using external prediction-market read tools.
- Read `references/precog-liquidity.md` when a user asks how creator earnings, LP returns, profit pools, funding risk, or virtual liquidity work.
- Read `references/mcp.md` only when configuring or inspecting optional read-only MCP context.
- Read `references/tool-schemas.md` or `assets/schemas/actions.json` for action input shapes.
- Use `assets/templates/multi-outcome-market.md` when drafting a market structure.

## Useful Commands

```txt
node scripts/validate_skill.mjs
node scripts/check_version.mjs
node scripts/check_pending_market.mjs --workflow-id <workflow_id> --auto-redraft
node scripts/inspect_state.mjs
node scripts/render_review.mjs --workflow-id <workflow_id>
node scripts/next_step.mjs --workflow-id <workflow_id>
node scripts/forecastos_action.mjs publish_approved_market --input <workflow-id-json> --wallet-output <wallet-output-json>
node scripts/forecastos_action.mjs <action> --input <json-file>
```
