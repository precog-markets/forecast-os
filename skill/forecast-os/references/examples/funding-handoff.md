# Funding Handoff Example

Prompt:

```txt
The market draft is approved. Generate a ForecastOS funding intent and resolve it through Bankr, Privy, Turnkey, or a manual wallet.
```

Expected behavior:

- Inspect workflow state first.
- Confirm market creation/Precog approval has happened or explain what is missing.
- Require explicit operator approval for funding.
- Use Bankr/Privy/Turnkey/manual flow outside ForecastOS to produce the transaction hash and wallet signature from the funding intent.
- Submit only the approved signed funding payload through `fund_market`.
- Do not request private keys, seed phrases, or raw custody credentials.
