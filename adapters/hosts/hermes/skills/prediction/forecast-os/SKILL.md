---
name: forecast-os
description: Draft, create, check, fund, and consume human-approved multi-outcome Precog prediction markets on Base or Arbitrum through the ForecastOS action bridge. Use this skill whenever a Hermes user asks about ForecastOS, prediction-market creation, pending Precog approval, market funding, or future-event probabilities that should be grounded in market context.
version: 0.1.0
author: ForecastOS
license: UNLICENSED
metadata:
  hermes:
    tags: [Prediction Markets, ForecastOS, Precog, Base, Arbitrum, Finance]
    category: prediction
---

# ForecastOS

ForecastOS is a bounded workflow for multi-outcome Precog prediction markets on
Base and Arbitrum. Use this Hermes skill as the primary integration path: it
loads as a normal Hermes skill and calls the existing ForecastOS Node action
bridge through terminal commands. The optional Hermes plugin wrapper is only for
users who explicitly want a plugin-provided tool.

## When to Use

Use this skill when the user wants to draft, create, check, fund, or consume a
ForecastOS/Precog market, asks whether a prediction market exists, or asks for
future-event probability context that should be grounded in prediction markets.

## Quick Reference

| Task | Command |
| --- | --- |
| Check local setup | `node ${HERMES_SKILL_DIR}/scripts/check-hermes-setup.mjs` |
| Draft/review workflow | `node ${HERMES_SKILL_DIR}/scripts/forecastos-action.mjs run_skill_step --input <json-file>` |
| Draft/review (shorthand) | `node ${HERMES_SKILL_DIR}/scripts/forecastos-action.mjs run_skill_step <json-file>` |
| Prepare create intent | `node ${HERMES_SKILL_DIR}/scripts/prepare-create-intent.mjs --input <json-file>` |
| Resolve Privy create signature | `node ${HERMES_SKILL_DIR}/scripts/resolve-privy-create.mjs --input <prepare-create-intent-json> --wallet-id <privy-wallet-id>` |
| Submit wallet-resolved create | `node ${HERMES_SKILL_DIR}/scripts/forecastos-action.mjs publish_approved_market --workflow-id <workflow_id> --wallet-output <wallet-output-json>` |
| Hourly pending check | `node <forecastos-repo>/skill/forecast-os/scripts/check_pending_market.mjs --workflow-id <workflow-id> --auto-redraft` |
| Version check | `node <forecastos-repo>/skill/forecast-os/scripts/check_version.mjs` |

Set `FORECASTOS_REPO_ROOT` when this Hermes skill is copied away from the
ForecastOS repo. Set `FORECASTOS_NODE_BIN` only when Hermes cannot run `node`
from PATH.
After every ForecastOS repo update, reinstall/symlink this Hermes skill export
or keep `FORECASTOS_REPO_ROOT` pointed at the current repo root.

## Procedure

0. **Confirm chain first.** Ask `With collateral from which chain?` and offer
   `USDC on Base` or `USDC on Arbitrum` before the first `run_skill_step`, even
   if the user mentioned a chain name in the initial prompt. Pass `chain_id` and
   matching collateral on the draft input after the user confirms.
1. Run the setup check when path or runtime availability is uncertain.
2. Draft multi-outcome markets through `run_skill_step --input <json-file>`,
   then show the concise review message (including `Chain:` when selected) and
   ask the user to approve or edit.
3. Keep questions at 65 characters or fewer and outcome labels at 32 characters
   or fewer. Do not put commas inside outcome labels.
4. If the draft is blocked on chain or other fields, ask for the missing details
   and rerun with complete input. Do not assume config default Base (`8453`).
5. After approval, advance the persisted workflow with another
   `run_skill_step --input <json-file>` call using the returned `state` object.
   At `create_market`, ForecastOS prepares the wallet create intent automatically
   when signature fields are missing.
6. **Privy signing checklist** when the user picks Privy:
   - Run `node ${HERMES_SKILL_DIR}/scripts/check-hermes-setup.mjs` if Privy
     adapter resolution has not been verified this session.
   - Run **exactly**:
     `node ${HERMES_SKILL_DIR}/scripts/resolve-privy-create.mjs --input <create-intent.json> --wallet-id <id>`
   - **Do not** search or expect `adapters/wallets/` under the skill install
     directory. Wallet adapters live in the ForecastOS repo root.
   - Confirm Privy app credentials are loaded in the shell (do not assume unset
     from empty shell expansion; do not paste secrets in chat).
   - Use one wallet id consistently for this create flow.
   - Read `chain_id` from the create intent; verify the wallet policy ALLOWs
     `eth_signTypedData_v4` for that chain (see Privy adapter README).
   - On `FORECASTOS_REPO_ROOT_REQUIRED`, ask the operator to set
     `FORECASTOS_REPO_ROOT` to the ForecastOS repo root and rerun setup check.
   - On `PRIVY_POLICY_DENIED` or `PRIVY_POLICY_CHAIN_MISMATCH`, read `guidance`,
     `rule_template`, and `patch_command` from stderr. After operator approval,
     run `node ${HERMES_SKILL_DIR}/scripts/patch-privy-chain-policy.mjs
     --wallet-id <id> --chain-id <8453|42161> --confirm`. Do not invent dashboard
     JSON or fake nested `"chainId"` / `"allow"` policy shapes. Use the Privy
     adapter README rule format only. After patching, re-run
     `resolve-privy-create.mjs` on the persisted create intent and
     `publish_approved_market`; do not reuse Base MCP wallet output.
7. Submit with `publish_approved_market --workflow-id <workflow_id>
   --wallet-output <adapter-output-json>`.
8. Return the created market title and generated launchpad share/check link
   after successful creation, then schedule the returned `pending_check` command
   hourly through Hermes, cron, or another host scheduler.
9. For pending markets, run the one-shot pending check hourly with
   `--auto-redraft` until `VALIDATED` or a terminal rejection. If rejected,
   ForecastOS creates a linked replacement draft for user approval; do not
   auto-submit it.
10. Fund only after Precog status is `VALIDATED` and a separate explicit funding
    approval exists.

## Post-Approval Create

After the user approves, pass the **full `state` object** from the prior
`run_skill_step` result. Use `chain_id` (not `requested_chain_id`).

Approval step (`step: await_approval`):

```json
{
  "state": { "...full state from prior run_skill_step..." },
  "event": {
    "approved": true,
    "image_url": "https://example.com/image.png",
    "chain_id": 42161
  }
}
```

Create-intent step (`step: create_market` — preferred over standalone
`prepare-create-intent.mjs`):

```json
{
  "state": { "...persisted workflow at create_market..." },
  "event": { "image_url": "https://example.com/image.png" }
}
```

Inspect persisted state with `node scripts/inspect_state.mjs` (ESM CLI). Never
use `require(...)` on skill scripts.

For copied installs, keep workflow state in `${HERMES_SKILL_DIR}/.forecastos`.
Set `FORECASTOS_REPO_ROOT` for Privy adapter resolution only. If config is
missing, run the setup check and copy shipped config — do not invent partial
`config.json` or `sed`-edit `.forecastos/*`.

## Testing / CI Only

Do **not** run the example runner for live user create requests:

```txt
node <forecastos-repo>/skill/forecast-os/scripts/examples/arbitrum-warcraft-2026/run_example.mjs
```

Use normal `run_skill_step` for operator flows. The example runner is for
operator/CI reference and encodes a fixed Arbitrum Warcraft fixture.

## Pitfalls

- Always pass JSON with `--input <json-file>` or positional shorthand
  `<action> <json-file>`. Empty input fails fast with usage guidance.
- Confirm Base vs Arbitrum before drafting. Do not jump to the Arbitrum example
  runner when a user asks to create a market.
- Do not hand-write `.forecastos/drafts/*` or `.forecastos/workflows/*`. Use the
  `draft_id`, `draft_hash`, and `workflow_id` returned by ForecastOS.
- Never `sed`-edit or Python-write `.forecastos/*`. Never hand-write partial
  `config.json`. Use `node scripts/inspect_state.mjs` to read state.
- Use `chain_id` on draft/approval input, not `requested_chain_id`.
- If a draft is blocked, ask for missing fields and rerun with complete input.
  Do not bypass the bridge by writing draft files manually.
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
- Privy supports Base (`8453`) and Arbitrum (`42161`). Base MCP is Base-only.
  Before Base Privy signing, run `check-hermes-setup.mjs` and confirm
  `supports_base: true` or patch with `patch-privy-chain-policy.mjs --confirm`.
- A copied Hermes skill is not the full ForecastOS repo. Privy signing resolves
  through `scripts/resolve-privy-create.mjs` and the repo-root adapter at
  `adapters/wallets/privy/resolve_create.mjs`. Set `FORECASTOS_REPO_ROOT` when
  the skill is installed outside the monorepo. Do not grep for adapters under
  the skill install path.
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
