# Funding Handoff Example

Prompt:

```txt
The market draft is approved. Generate a ForecastOS funding intent and resolve it through [Privy](https://www.privy.io/ai), [Base MCP](https://mcp.base.org), another configured wallet/action tool, or the Precog creation area.
```

Expected behavior:

- Inspect workflow state first.
- Confirm market creation/Precog approval has happened or explain what is missing.
- Require explicit operator approval for funding.
- Use [Privy](https://www.privy.io/ai), [Base MCP](https://mcp.base.org), another configured wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/) outside ForecastOS to produce the transaction hash and wallet signature from the funding intent.
- Submit only the approved signed funding payload through `fund_market`.
- Do not request private keys, seed phrases, or raw custody credentials.
