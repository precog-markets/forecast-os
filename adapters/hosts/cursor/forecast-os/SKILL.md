---
name: forecast-os
description: "Use ForecastOS whenever a Cursor user asks to draft, launch, publish, check, fund, or reason about a multi-outcome Precog prediction market on Base. Make sure to use this skill for prediction-market workflows, market creation requests, pending Precog approval checks, ForecastOS action-bridge tasks, and future-event probability questions that should be grounded in market context."
---

# ForecastOS

Use ForecastOS as a bounded prediction-market workflow in Cursor. ForecastOS
drafts and advances human-approved multi-outcome Precog markets on Base. This
Cursor skill loads instructions and runs local scripts; wallet/action providers
remain under `adapters/wallets/*`.

## Core Workflow

1. Draft a multi-outcome market and show a concise review.
2. Ask the user to approve the draft or request edits.
3. After approval, prepare the Precog create intent.
4. Let the selected wallet/action adapter resolve signing fields.
5. Submit the approved create payload through the action bridge.
6. Return the created market title and launchpad share/check link, then
   schedule the returned `pending_check` command hourly.
7. Check pending Precog approval hourly with `--auto-redraft` until `VALIDATED`
   or a terminal rejection. If rejected, create a linked replacement draft from
   validator feedback for user approval; do not auto-submit it.
8. Fund only after `VALIDATED` and a separate explicit approval.
9. Consume prediction data only after the upcoming market is `DEPLOYED`.

## Rules

- Use `scripts/forecastos-action.mjs` from this Cursor skill when the canonical
  runtime path may vary.
- Keep ForecastOS MCP read-only. Do not add MCP tools that create markets, fund,
  sign, approve tokens, send transactions, or mutate workflow memory.
- Do not ask users to paste private keys, seed phrases, raw signatures, nonces,
  or custody credentials in chat.
- Keep questions at 65 characters or fewer and outcome labels at 32 characters
  or fewer.
- Do not put commas inside outcome labels.
- Write resolution criteria that name the source of truth, winning-outcome rule,
  resolution time, and fallback handling.

## Examples

Draft a market:

```txt
Create a prediction market about which AI launcher has the most new agents in June.
```

Publish after approval:

```txt
Approved. Prepare the create intent and tell me which wallet adapter should sign it.
```

Check pending approval:

```txt
Check whether workflow abc123 has been approved by Precog yet.
```

Fund after validation:

```txt
The market is validated. Prepare a funding intent for 10 USDC.
```

## Read Next

- Read `references/cursor-workflow.md` for Cursor install, runtime path, and
  action-bridge guidance.
- Run `scripts/check-cursor-setup.mjs` when you need a read-only local setup
  check.
