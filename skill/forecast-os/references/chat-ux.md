# Chat UX

Use this file before writing user-facing ForecastOS draft, approval, wallet handoff, or failure messages.

## Default Style

- Write for an end user, not an operator log.
- Show a compact market summary, not raw JSON.
- Hide workflow IDs, draft IDs, hashes, file paths, quality scores, and API payloads unless the user asks for debugging details.
- Always end with the next action the user can take.
- Use UTC labels for close and resolution times.
- Mention the configured token in draft summaries, for example `Token: USDC`.

## Operator Vs User Voice

- Default: short summary plus one clear next-step question.
- Debug mode (user asks for operator detail): you may cite `workflow_id`, `state_dir`, or the first blocking issue from stderr.
- Never paste full CLI stderr JSON in normal chat.

## Draft Summary Shape

```txt
Draft ready.

Market: <title>
Question: <question>
Outcomes: <outcome A> / <outcome B> / <outcome C>
Close: <UTC time>
Resolve: <UTC time>
Chain: <Base (8453) or Arbitrum (42161) when selected>
Token: <symbol>
Source: <source of truth>

Reply yes to approve, or tell me what to change.
```

If information is missing, ask natural questions:

```txt
I need two details before this can be approved:
- With collateral from which chain? USDC on Base or USDC on Arbitrum?
- What official source should resolve the result?
```

Do not say:

```txt
missing_fields: ["source_of_truth", "resolution_time"]
```

## Approval And Wallet Handoff

After `yes` approval, confirm chain and collateral in plain language, then ask for a signing path:

```txt
Approved on Arbitrum USDC. What wallet or action tool would you like me to use to publish this to Precog?

Options include Privy or the Precog launchpad. If no wallet/action tool is available here, you can launch it manually at https://core.precog.markets/launchpad/.
```

Use `event.approved: true` in the bridge input. Do not use a nested `event.approval` object.

After create-intent preparation succeeds:

```txt
Create intent is ready. I'll sign this with <wallet> next, then submit it to Precog.
```

After successful creation:

```txt
Your market is live on Precog: <title>

Share/check link: https://core.precog.markets/launchpad/<chainId>/<marketId>/<slug>

I'll keep checking approval status hourly until Precog validates or rejects it.
```

Do not ask users to paste raw `creator_address`, `creator_signature`, `funder_address`, or `funder_signature` in normal chat. Those are resolved outputs from trusted wallet/action tooling.

## Post-Approval Failure Messages

Keep failures actionable. Prefer re-running the bridge over editing files by hand.

**Missing or invalid local config**

```txt
ForecastOS can't read a complete config for this skill install. Copy skill/forecast-os/.forecastos/config.json into the active skill's .forecastos directory, or set FORECASTOS_REPO_ROOT to the ForecastOS repo root. I won't invent a partial config file.
```

**Blocked draft at create time**

```txt
This draft still has unresolved validation issues, so I can't prepare the create intent yet. Tell me what to change, or I'll re-draft with explicit chain_id and the missing fields. I won't edit .forecastos files manually.
```

**Fallback outcome mismatch**

```txt
The resolution criteria names a fallback outcome that isn't in the outcomes list—for example Invalid / ambiguous. I can add that outcome or rewrite the Fallback line. Which do you prefer?
```

**Privy adapter not found**

```txt
Privy signing needs the repo-root adapter through scripts/resolve-privy-create.mjs. Set FORECASTOS_REPO_ROOT to the ForecastOS repo root and retry. I won't search for adapters/wallets under the skill install directory.
```

**Wrong approval input shape**

```txt
Approval didn't advance because the bridge needs event.approved: true with the full state object from the prior run_skill_step result. I'll retry with the correct approval payload.
```

**Wallet signature mismatch**

```txt
Precog accepted the draft shape, but creation failed because the wallet signature did not match the creator account. Please retry with your wallet/action tool so it signs the current Precog EIP-712 create intent.
```

Do not dump raw API responses unless the user asks for operator detail.

## Blocked Drafts And CLI Mistakes

If `draft_market` or `run_skill_step` returns a blocked draft, ask the user for
the missing source, close time, resolution time, or chain and rerun with complete input.
Do not hand-write `.forecastos/drafts/*` or `.forecastos/workflows/*`.

Never `sed`-edit, Python-write, or manually patch `.forecastos/*`. Never hand-write partial `config.json`.

Inspect persisted state with `node scripts/inspect_state.mjs` (ESM CLI). Do not use `require(...)` on skill scripts.

If the bridge appears to "reset to intake", verify the command used
`--input <json-file>` or positional shorthand `<action> <json-file>`. An action
run without input produces an empty draft or fresh workflow.

Prefer `chain_id` on draft and approval input. `requested_chain_id` is accepted by the runtime but discouraged.

## Anti-Patterns

Do not say these in normal chat:

```txt
The repo is out of date — pull latest main.
```

When the issue is usually local config or `.forecastos` state, not git sync.

```txt
prepare_create_intent failed. I'll patch .forecastos/drafts/*.json and retry.
```

```txt
{"action":"prepare_create_intent","status":"error", ... entire stderr ...}
```

## Good And Bad Examples

Good draft:

```txt
Draft ready.

Market: Which team wins Worlds 2026?
Outcomes: BLG / T1 / Gen.G / Other
Close: 2026-11-13T23:59:00.000Z UTC
Resolve: 2026-11-15T12:00:00.000Z UTC
Token: USDC
Source: Riot Games and LoL Esports official results.

Reply yes to approve, or tell me what to change.
```

Good post-approval:

```txt
Approved on Arbitrum USDC. Pick a signing path: Privy or Precog launchpad.
```

Bad draft output:

```json
{
  "draft_id": "draft_...",
  "quality": 91,
  "market": { "...": "..." }
}
```

Bad post-approval recovery:

```txt
prepare_create_intent failed. I'll patch .forecastos/drafts/*.json and retry.
```
