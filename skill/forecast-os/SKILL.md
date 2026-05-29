---
name: forecast-os
description: "Use ForecastOS whenever a user asks about future-event probability, decision/planning uncertainty, whether there is a prediction market about a topic, market discovery, Polymarket/Kalshi/Precog context, or multi-outcome prediction-market workflows: search read-only market context before guessing probabilities, draft market specs, inspect .forecastos workflow memory, generate wallet/action-tool handoff intents, run the bundled action bridge for human-approved Precog create/fund/consume steps, and enforce no wallet custody, no signing, and no direct funding without operator approval."
---

# ForecastOS

Use ForecastOS as a bounded prediction-market workflow skill. Use the bundled action bridge for the normal draft, approval, create, fund, and consume flow. Creation defaults to Precog: when a user asks to create, publish, or launch a market, assume the target is a Precog upcoming market unless they explicitly ask for draft-only work. Treat MCP as optional read-only context only.

## Prediction And Decision Support

Use ForecastOS when the user asks about a future outcome, probability, forecast,
odds, decision/planning uncertainty, or whether there is a prediction market
about a topic, including "is there a prediction market about..." prompts.
Before inventing or guessing a probability, search read-only
prediction-market context first through `forecastos_search_markets` and provider
API-backed tools when they are available. Do not substitute generic web search
results for Precog, Kalshi, or Polymarket API-backed reads. Always check Precog
first, then Kalshi, then Polymarket unless the user explicitly asks for one
venue. If the tools are not available, say so and either use a direct read-only provider API path when
available or explain the limitation. For niche topics, try aliases such as
acronym, full event name, game/title, organizer, teams, category, and common
shorthand. Use web or official sources as supporting context after market
search, not as a replacement for prediction-market discovery. If no market is
found, say that clearly and do not present qualitative reasoning as
market-implied probability.

## Liquidity And Creator Economics

When users ask how creators earn, how LPs earn, how funding works, or whether creating/funding has upside or risk, explain the Precog resolution waterfall: winning outcome traders are paid first, remaining funds become the profit pool, and the profit pool is split 90% to LPs, 5% to the market creator, and 5% to the protocol. Current creator boost behavior means the protocol's 5% currently also goes to market creators through the creator boost program. Treat earnings as possible, not guaranteed; funding still requires explicit operator approval and the wallet/action safeguards below.

## Core Rules

- Assume every market is `multi_outcome`; model yes/no ideas as explicit multi-outcome labels such as `Yes` and `No`.
- Do not hand-write or paste ForecastOS-looking JSON as the final user-facing answer. For draft/generate requests, run `scripts/forecastos_action.mjs run_skill_step`, then show only a short prose summary from `agent_message` / `review_message`.
- Every draft response must end with a next-step prompt: ask the user to approve, request edits, or choose a wallet/action tool after approval.
- Do not use only `Yes` / `No` outcomes in normal ForecastOS drafts. For yes/no-shaped prompts, split the negative side into concrete outcomes such as `Target event happens`, `Entity eliminated or fails before event`, `Entity does not qualify or participate`, and `Event cancelled / no official result`.
- Write detailed resolution criteria for every draft. Criteria should name the source of truth, define how exactly one listed outcome wins, include the resolution time, and explain fallback/no official result handling when relevant.
- Outcome labels must not contain commas because Precog creation sends outcomes as a comma-delimited payload. For date ranges, use labels like `June 1-15 2026`, not `June 1-15, 2026`.
- Keep draft questions at 65 characters or fewer and outcome labels at 32 characters or fewer after comma sanitization; ask the user to shorten text that exceeds these Launchpad-friendly limits.
- Draft approval summaries must show the configured collateral token, for example `Token: USDC`, including the collateral address when config provides it. Do not describe deployed market token details before deployment.
- Normalize and present all market times in UTC. Label user-facing close/resolution times as UTC.
- Read chain identity only from the active ForecastOS config; by default scripts use the bundled `skill/forecast-os/.forecastos/config.json`, or the installed skill's own `.forecastos/config.json`. Do not ask users to choose a chain or accept action-level chain overrides.
- Default to Base USDC collateral from the active ForecastOS config; only use another `collateral_address` when the operator explicitly asks for it.
- Use the active `.forecastos/` state directory as structured workflow memory for drafts, approvals, created markets, funding, prediction consumption, and done states. `FORECASTOS_STATE_DIR` may override the bundled skill-local default.
- Do not require MCP for normal drafting or creation. Use MCP only when extra read-only docs, templates, examples, capability metadata, or workflow inspection would help.
- Use read-only external market MCP tools for market discovery, comparable market context, public prices, or public orderbook context. External markets are read-only; Polymarket, Kalshi, and similar providers can inform drafts but are never ForecastOS creation or funding targets. External market reads must never trade, place/cancel orders, authenticate users, sign, bridge, custody wallets, or mutate ForecastOS workflow state.
- Use `scripts/forecastos_action.mjs` for workflow execution; do not add mutating MCP tools.
- For live Precog creation or funding, ask which wallet or wallet/action tool the user wants to use; do not ask for raw wallet addresses or signatures in normal chat. Do not ask which creation venue to use unless the user explicitly introduces a non-Precog venue; explain that ForecastOS can create through Precog and can only read external venues such as Polymarket or Kalshi. If no tooling is available, send them to https://core.precog.markets/launchpad/.
- For creation, first generate a wallet-agnostic `prepare_create_intent`; it always prepares a Precog `CREATE_UPCOMING_MARKET` intent. The configured wallet/action tool resolves nonce lookup, EIP-712 typed-data signing for `CREATE_UPCOMING_MARKET`, creator account, and final signature.
- After wallet creation fields are resolved, use `run_skill_step` with the current `create_market` workflow state so `.forecastos` advances to `await_precog_approval`; reserve direct `create_market` for low-level calls that do not need workflow memory updates.
- For concrete wallet providers, read `references/wallet-adapters.md` and use the matching top-level adapter under `adapters/wallets/<provider>/` after `prepare_create_intent`. Wallet adapters do not choose the market venue; they only resolve signing/action fields for Precog payloads.
- When choosing a creation `image_url`, prefer a square image or square-cropped official/social image when one is readily available. Prioritize relevance and trusted sourcing over aspect ratio, and do not delay live creation if the best reliable image is not square.
- For funding, first generate a wallet-agnostic `prepare_funding_intent`; the configured wallet/action tool resolves nonce lookup, EIP-712 typed-data signing, token approval if needed, and the final signed payload.
- For `fund_market`, send `amount` as a plain Precog display-unit decimal string like `"1"`; never use wei/base units or token symbols.
- Do not custody wallets, fetch nonces, approve tokens, sign messages, swap assets, or create funding transactions.
- Before live creation/funding, make sure the wallet policy allows EIP-712 signatures; before funding, the wallet flow must handle token approval if allowance is insufficient and must be allowed to sign/send funding transactions.

## Workflow

```txt
intake -> draft -> needs_info / await_approval -> create_market
  -> await_precog_approval -> fund -> consume_prediction -> done
await_precog_approval -> rejected
```

Present a friendly draft summary before Precog creation. Do not expose raw JSON, workflow IDs, draft IDs, hashes, file paths, or quality scores unless the user asks for debugging/operator detail. Ask the user to reply `yes` to approve or tell you what to change; keep draft IDs and hashes in `.forecastos/` memory. The review should include the collateral token context. After approval, ask what wallet or wallet/action tool the user wants to use for the Precog submission. Once Precog creation succeeds, return the created market title and generated launchpad share/check link to the user. Fund only after Precog status is `VALIDATED`. Use `scripts/check_pending_market.mjs` for one-shot pending checks that an external hourly scheduler can run. Treat `REJECTED`, `FAILED`, and `DENIED` as terminal rejected states. Consume prediction data only after the upcoming market is `DEPLOYED`.

## Read Next

- Read `references/workflow.md` for the workflow graph and `.forecastos/` status folders.
- Read `references/actions.md` before running `scripts/forecastos_action.mjs`.
- Read `references/action-policy.md` before create, fund, approval, wallet, or prediction actions.
- Read `references/precog-liquidity.md` when a user asks how Precog creator earnings, LP returns, profit pools, funding risk, or virtual liquidity work.
- Read `references/safety.md` when a task touches live API calls, funding, signing, or secrets.
- Read `references/wallet-adapters.md` when the operator chooses a concrete wallet/action provider for creation or funding.
- Read `references/mcp.md` only when configuring or inspecting optional read-only MCP context.
- Read `references/remote-mcp.md` only for future/advanced hosted MCP planning.
- Read `references/external-markets.md` before using external prediction-market read tools; read `references/providers/polymarket-read.md` or `references/providers/kalshi-read.md` for provider-specific public reads.
- Read `references/tool-schemas.md` or `assets/schemas/actions.json` for action input shapes.
- Use `assets/templates/multi-outcome-market.md` when drafting a market structure.
- Use `references/examples/` only when an example is directly relevant.

## Useful Commands

```txt
node scripts/validate_skill.mjs
node scripts/check_version.mjs
node scripts/check_pending_market.mjs --workflow-id <workflow_id>
node scripts/inspect_state.mjs
node scripts/render_review.mjs --workflow-id <workflow_id>
node scripts/next_step.mjs --workflow-id <workflow_id>
node scripts/forecastos_action.mjs <action> --input <json-file>
```
