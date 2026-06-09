---
name: forecast-os
description: "Use ForecastOS whenever a user asks about future-event probability, decision/planning uncertainty, whether there is a prediction market about a topic, market discovery, Polymarket/Kalshi/Precog context, or multi-outcome prediction-market workflows: search read-only market context before guessing probabilities, draft market specs, ask for Base/Arbitrum USDC collateral selection when missing, inspect .forecastos workflow memory, generate wallet/action-tool handoff intents, run the bundled action bridge for human-approved Precog create/fund/consume steps, and enforce no wallet custody, no signing, and no direct funding without operator approval."
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
- Show configured collateral in draft summaries, for example `Token: USDC`, and show `Chain: Base (8453)` or `Chain: Arbitrum (42161)` when selected.
- Read chain and collateral from active ForecastOS context. **Before the first draft**, confirm chain with the user (`With collateral from which chain?`) and offer `USDC on Base` or `USDC on Arbitrum` even when they mention a chain name in the initial prompt. The runtime blocks drafts until `chain_id` or chain-specific collateral is explicit. Pass the selected chain through draft/approval/create events; do not hand-write `.forecastos/workflows/*` files or bypass `publish_approved_market`.
- Use `.forecastos/` as structured workflow memory. `FORECASTOS_STATE_DIR` may override the default state directory.
- Do not require MCP for normal drafting or creation. Use `scripts/forecastos_action.mjs` for workflow execution; do not add mutating MCP tools.
- Do not custody wallets, fetch nonces, approve tokens, sign messages, swap assets, or create funding transactions.

## Live Precog Actions

Creation defaults to Precog unless the user explicitly asks for draft-only work or a non-Precog venue. After approval, ask which wallet/action tool the user wants to use. Do not ask for raw wallet addresses or signatures in normal chat.

Use `prepare_create_intent` before live creation. It prepares the Precog `CREATE_UPCOMING_MARKET` typed-data handoff; wallet/action tooling resolves nonce lookup, creator account, signature, and final payload. In normal chat, publish with `publish_approved_market --input <workflow-id-json> --wallet-output <wallet-output-json>` after wallet resolution so ForecastOS loads the persisted `create_market` workflow. Do not hand-write `.forecastos/workflows/*` files.

Wallet adapters do not choose the market venue; they only resolve signing/action fields for Precog payloads.
Provider-specific wallet adapter details live in `adapters/wallets/<provider>` in the full ForecastOS repo.

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
node scripts/forecastos_action.mjs <action> <json-file>
node scripts/resolve-privy-create.mjs --input <create-intent.json> --wallet-id <privy-wallet-id>
```

The Arbitrum Warcraft example runner under `scripts/examples/arbitrum-warcraft-2026/` is for operator/CI reference only. Do not use it as the default path for live user create requests.

Set `FORECASTOS_REPO_ROOT` when this skill is copied into Hermes or another host outside the ForecastOS monorepo. Privy signing resolves the repo-root adapter through `scripts/resolve-privy-create.mjs`.

## Pitfalls

- Always pass JSON input with `--input <json-file>` or positional shorthand `<action> <json-file>`. A bare file path without `--input` used to be ignored; positional shorthand is supported now, but empty input still fails fast.
- Confirm Base vs Arbitrum with the user before drafting. Do not assume config default Base (`8453`) or jump to example scripts when the user asks to create a market.
- If `draft_market` or `run_skill_step` returns a blocked draft, ask the user for the missing fields and rerun with complete input. Do not hand-write `.forecastos/drafts/*` or `.forecastos/workflows/*`.
- For Arbitrum creation, pass `chain_id: 42161` and Arbitrum USDC through draft/approval/create events. Privy supports Arbitrum; Base MCP is Base-only.
- A copied skill install is not the full ForecastOS repo. For Privy, run `scripts/resolve-privy-create.mjs`; do not search for `adapters/wallets/` under the skill directory. Set `FORECASTOS_REPO_ROOT` to the repo root when copied outside the monorepo.
