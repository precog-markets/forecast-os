# Funding Handoff Example

Prompt:

```txt
The market draft is approved. Fund it through Bankr or LiFi.
```

Expected behavior:

- Inspect workflow state first.
- Confirm market creation/Precog approval has happened or explain what is missing.
- Require explicit operator approval for funding.
- Use Bankr/LiFi/manual flow outside ForecastOS to produce the transaction hash and wallet signature.
- Submit only the approved signed funding payload through `fund_market`.
- Do not request private keys, seed phrases, or raw custody credentials.
