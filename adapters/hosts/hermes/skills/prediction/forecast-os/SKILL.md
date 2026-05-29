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
| Draft/review workflow | `node <forecastos-repo>/skill/forecast-os/scripts/forecastos_action.mjs run_skill_step --input <json-file>` |
| One-shot pending check | `node <forecastos-repo>/skill/forecast-os/scripts/check_pending_market.mjs --workflow-id <workflow-id>` |
| Version check | `node <forecastos-repo>/skill/forecast-os/scripts/check_version.mjs` |

Set `FORECASTOS_REPO_ROOT` when this Hermes skill is copied away from the
ForecastOS repo. Set `FORECASTOS_NODE_BIN` only when Hermes cannot run `node`
from PATH.

## Procedure

1. Run the setup check when path or runtime availability is uncertain.
2. Draft multi-outcome markets through `run_skill_step`, then show the concise
   review message and ask the user to approve or edit.
3. Keep questions at 65 characters or fewer and outcome labels at 32 characters
   or fewer. Do not put commas inside outcome labels.
4. Show collateral token context during approval, for example `Token: USDC`.
5. After approval, prepare the Precog create intent and ask which trusted
   wallet/action adapter should resolve signing fields.
6. Submit live creation or funding only through the ForecastOS action bridge
   after explicit user approval and trusted wallet/action output.
7. Return the created market title and generated launchpad share/check link
   after successful creation.
8. For pending markets, run the one-shot pending check hourly through an
   external scheduler until `VALIDATED` or a terminal rejection.
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
