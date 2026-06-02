---
name: forecast-os
description: Draft, create, check, fund, and consume human-approved multi-outcome Precog prediction markets on Base through the ForecastOS action bridge. Use this skill whenever a Hermes user asks about ForecastOS, prediction-market creation, pending Precog approval, market funding, or future-event probabilities that should be grounded in market context.
version: 0.1.0
author: ForecastOS
license: UNLICENSED
metadata:
  hermes:
    tags: [Prediction Markets, ForecastOS, Precog, Base, Finance]
    category: prediction
---

# ForecastOS

ForecastOS is a bounded workflow for multi-outcome Precog prediction markets on
Base. Use this Hermes skill as the primary integration path: it loads as a
normal Hermes skill and calls the existing ForecastOS Node action bridge through
terminal commands. The optional Hermes plugin wrapper is only for users who
explicitly want a plugin-provided tool.

## When to Use

Use this skill when the user wants to draft, create, check, fund, or consume a
ForecastOS/Precog market, asks whether a prediction market exists, or asks for
future-event probability context that should be grounded in prediction markets.

## Quick Reference

| Task | Command |
| --- | --- |
| Check local setup | `node ${HERMES_SKILL_DIR}/scripts/check-hermes-setup.mjs` |
| Draft/review workflow | `node ${HERMES_SKILL_DIR}/scripts/forecastos-action.mjs run_skill_step --input <json-file>` |
| Prepare create intent | `node ${HERMES_SKILL_DIR}/scripts/prepare-create-intent.mjs --input <json-file>` |
| Resolve Privy create signature | `node ${HERMES_SKILL_DIR}/scripts/resolve-privy-create.mjs --input <prepare-create-intent-json>` |
| Submit wallet-resolved create | `node ${HERMES_SKILL_DIR}/scripts/forecastos-action.mjs publish_approved_market --input <workflow-id-json> --wallet-output <wallet-output-json>` |
| Hourly pending check | `node <forecastos-repo>/skill/forecast-os/scripts/check_pending_market.mjs --workflow-id <workflow-id> --auto-redraft` |
| Version check | `node <forecastos-repo>/skill/forecast-os/scripts/check_version.mjs` |

Set `FORECASTOS_REPO_ROOT` when this Hermes skill is copied away from the
ForecastOS repo. Set `FORECASTOS_NODE_BIN` only when Hermes cannot run `node`
from PATH.
After every ForecastOS repo update, reinstall/symlink this Hermes skill export
or keep `FORECASTOS_REPO_ROOT` pointed at the current repo root.

## Procedure

1. Run the setup check when path or runtime availability is uncertain.
2. Draft multi-outcome markets through `run_skill_step`, then show the concise
   review message and ask the user to approve or edit.
3. Keep questions at 65 characters or fewer and outcome labels at 32 characters
   or fewer. Do not put commas inside outcome labels.
4. Show collateral token context during approval, for example `Token: USDC`.
5. After approval, prepare the Precog create intent with
   `prepare-create-intent.mjs` and ask which trusted wallet/action adapter
   should resolve signing fields.
6. For Privy, run `resolve-privy-create.mjs` on the prepared create intent, then
   submit the stored `create_market` workflow step with
   `publish_approved_market --wallet-output`. Pass the existing workflow id so
   the bridge loads persisted workflow state. Do not call direct `create_market` first.
7. Return the created market title and generated launchpad share/check link
   after successful creation, then schedule the returned `pending_check` command
   hourly through Hermes, cron, or another host scheduler.
8. For pending markets, run the one-shot pending check hourly with
   `--auto-redraft` until `VALIDATED` or a terminal rejection. If rejected,
   ForecastOS creates a linked replacement draft for user approval; do not
   auto-submit it.
9. Fund only after Precog status is `VALIDATED` and a separate explicit funding
   approval exists.

## Pitfalls

- Do not ask users to paste private keys, seed phrases, raw signatures, or raw
  custody credentials in chat.
- Do not use Hermes skills or MCP to sign, custody wallets, fetch nonces,
  approve tokens, send transactions, or bypass ForecastOS approval rules.
- Do not create Polymarket or Kalshi markets through ForecastOS; those providers
  are read-only context sources.
- Do not use the plugin wrapper as the default integration path. Normal Hermes
  discovery works best with this skill package.
- Do not use `preview_market`; use `draft_market` or `run_skill_step`.
- Do not call direct `create_market` as the normal publish path. It lacks the
  wallet-resolved fields unless a wallet adapter has already returned them.
- File inputs are preferred. The action wrapper also supports `--input -` for
  heredocs when the terminal session needs stdin.

## Verification

Run:

```txt
node ${HERMES_SKILL_DIR}/scripts/check-hermes-setup.mjs
```

Then verify Hermes can discover the skill in a fresh session:

```txt
hermes skills list
hermes chat --toolsets skills -q "/forecast-os help me draft a multi-outcome market"
```

The first live ForecastOS step should produce a human-readable draft review, not
raw workflow JSON.
