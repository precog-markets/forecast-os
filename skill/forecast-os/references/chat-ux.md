# Chat UX

Use this file before writing user-facing ForecastOS draft, approval, wallet handoff, or failure messages.

## Default Style

- Write for an end user, not an operator log.
- Show a compact market summary, not raw JSON.
- Hide workflow IDs, draft IDs, hashes, file paths, quality scores, and API payloads unless the user asks for debugging details.
- Always end with the next action the user can take.
- Use UTC labels for close and resolution times.
- Mention the configured token in draft summaries, for example `Token: USDC`.

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

After `yes` approval:

```txt
Approved. What wallet or action tool would you like me to use to publish this to Precog?

If no wallet/action tool is available here, you can launch it manually at https://core.precog.markets/launchpad/.
```

Do not ask users to paste raw `creator_address`, `creator_signature`, `funder_address`, or `funder_signature` in normal chat. Those are resolved outputs from trusted wallet/action tooling.

## Failure Messages

Keep failures actionable:

```txt
Precog accepted the draft shape, but creation failed because the wallet signature did not match the creator account. Please retry with your wallet/action tool so it signs the current Precog EIP-712 create intent.
```

Do not dump raw API responses unless the user asks for operator detail.

## Blocked Drafts And CLI Mistakes

If `draft_market` or `run_skill_step` returns a blocked draft, ask the user for
the missing source, close time, or resolution time and rerun with complete input.
Do not hand-write `.forecastos/drafts/*` or `.forecastos/workflows/*`.

If the bridge appears to "reset to intake", verify the command used
`--input <json-file>` or positional shorthand `<action> <json-file>`. An action
run without input produces an empty draft or fresh workflow.

## Good And Bad Examples

Good:

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

Bad:

```json
{
  "draft_id": "draft_...",
  "quality": 91,
  "market": { "...": "..." }
}
```
