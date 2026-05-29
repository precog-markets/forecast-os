---
name: forecast-os
description: "Use ForecastOS with Bankr when a user wants to draft, create, check, fund, or consume a multi-outcome Precog prediction market on Base using Bankr Wallet API signing/submission. Use for prediction-market workflows, Precog launchpad markets, pending approval checks, and Bankr-backed wallet handoffs."
---

# ForecastOS

Use ForecastOS for human-approved multi-outcome Precog prediction-market
workflows. Draft the market first, ask the user to approve the draft, then use
Bankr only as the wallet/action layer for EIP-712 signatures and transaction
submission.

## Core Rules

- Create Precog multi-outcome markets, not Polymarket/Kalshi markets.
- Keep questions at 65 characters or fewer and outcome labels at 32 characters
  or fewer.
- Do not put commas inside outcome labels; use `June 1-15 2026`, not
  `June 1-15, 2026`.
- Write detailed resolution criteria with source of truth, winning-outcome
  rule, resolution time, and fallback handling.
- Show collateral token context during approval, for example `Token: USDC`.
- Do not ask users to paste raw private keys, seed phrases, signatures, or
  transaction calldata in chat.
- Use Bankr Wallet API only after user approval and only for wallet signing or
  transaction submission.

## Workflow

1. Draft the market and show a concise review.
2. Ask the user to approve or request edits.
3. After approval, prepare a Precog create intent.
4. Use Bankr `/wallet/sign` with `eth_signTypedData_v4` to resolve the create
   signature.
5. Submit the approved Precog create payload.
6. Return the created market title and launchpad link.
7. Check pending Precog approval hourly until `VALIDATED`, `REJECTED`,
   `FAILED`, or `DENIED`.
8. Fund only after `VALIDATED` and a separate user approval.
9. For funding, use Bankr `/wallet/sign` for the ForecastOS funding
   authorization and `/wallet/submit` for prepared Base transactions.
10. Consume prediction data only after the upcoming market is `DEPLOYED`.

## Bankr Requirements

Use a Bankr API key with Wallet API enabled, write access for live
signing/submission, Base support, and user security settings that permit the
intended transaction. Prefer `/wallet/sign` and `/wallet/submit`; do not use
deprecated `/agent/sign` or `/agent/submit` flows.

Bankr must not invent market funding calldata. A trusted Precog transaction
builder or wallet/action resolver must provide the unsigned funding transaction
envelope before Bankr submits it.

## Examples

Draft a market:

```txt
Create a market about which team wins the 2026 final.
```

Publish through Bankr:

```txt
Approved. Publish this Precog market using Bankr.
```

Check pending approval:

```txt
Check whether the pending Precog market was approved.
```

Fund after validation:

```txt
Fund the validated market with 10 USDC using Bankr.
```

## Read Next

- Read `references/bankr-workflow.md` for command shapes and safety boundaries.
- Run `scripts/check-bankr-setup.mjs` when you need to confirm Bankr wallet API
  access without signing or submitting anything.
