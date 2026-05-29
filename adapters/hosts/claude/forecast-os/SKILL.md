---
name: forecast-os
description: "Use ForecastOS whenever the user asks Claude to draft, launch, publish, check, fund, or reason about a multi-outcome Precog prediction market on Base. Make sure to use this skill for prediction-market workflows, market creation requests, pending Precog approval checks, ForecastOS action-bridge tasks, and questions about future-event probabilities that should be grounded in prediction-market context."
---

# ForecastOS

Use ForecastOS as a bounded prediction-market workflow for Claude. ForecastOS
drafts and advances human-approved multi-outcome Precog markets on Base. Treat
MCP as optional read-only context; live workflow execution stays in the
ForecastOS action bridge and trusted wallet/action tooling.

## Core Workflow

1. Draft a multi-outcome market and show a concise review.
2. Ask the user to approve the draft or request edits.
3. After approval, prepare the Precog create intent.
4. Let the selected wallet/action adapter resolve signing fields.
5. Submit the approved create payload through the action bridge.
6. Return the created market title and launchpad share/check link.
7. Check pending Precog approval until `VALIDATED` or a terminal rejection.
8. Fund only after `VALIDATED` and a separate explicit approval.
9. Consume prediction data only after the upcoming market is `DEPLOYED`.

## Rules

- Keep ForecastOS MCP read-only. Do not add MCP tools that create markets, fund,
  sign, approve tokens, send transactions, or mutate workflow memory.
- Use the local action bridge for execution:
  `skill/forecast-os/scripts/forecastos_action.mjs`.
- Keep wallet-provider details in `adapters/wallets/*`; Claude host files only
  explain how Claude loads ForecastOS and optional MCP context.
- Do not ask users to paste private keys, seed phrases, raw signatures, or raw
  custody credentials in chat.
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

- Read `references/claude-workflow.md` for Claude Code MCP setup and execution
  guidance.
- Run `scripts/check-claude-setup.mjs` when you need a read-only local setup
  check before using the action bridge or MCP.
