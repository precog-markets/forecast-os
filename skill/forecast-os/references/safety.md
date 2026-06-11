# Safety

ForecastOS is allowed to help agents reason about prediction-market workflows and submit approved signed payloads to Precog. It should not silently spend money, approve tokens, sign transactions, or mutate live markets without explicit approval.

## Guardrails

- Keep MCP read-only.
- Do not expose MCP tools that create, draft, fund, sign, swap, or run workflow steps.
- Require explicit human approval before market creation.
- Require explicit operator approval before funding.
- Check Precog approval status before funding; only `VALIDATED` can move to funding.
- Check upcoming-market deployment before consuming predictions; only `DEPLOYED` can move to the deployed market lookup.
- Reject stale approval when draft IDs or hashes do not match.
- Submit Precog create/fund requests only through `forecastos_action.mjs` after approval and signed fields are present.
- Treat Wallet/action tool transaction creation as external to ForecastOS unless a trusted adapter is configured. ForecastOS should generate funding intent only; wallet/action tools resolve token decimals, token approval if needed, transaction execution, nonce lookup, wallet policy permissions, and EIP-712 signatures.
- Never invent market prices or probabilities when Precog returns no deployed market data.
- Never ask for seed phrases, private keys, raw signing secrets, or custody credentials.
- Precog share trading on deployed markets is external to ForecastOS core. Use `adapters/actions/precog/` only after operator approval; always quote before buy or sell. Do not add MCP tools that place trades.

## Human-Facing Behavior

When a user asks for live creation or funding, use the shipped `.forecastos/config.json` public defaults unless `.forecastos/config.local.json` overrides them. Still verify approval text, wallet policy readiness, token approval when needed, and operator-provided EIP-712 signatures before submission. If creation signed fields are missing, offer concrete options such as [Bankr](https://bankr.bot), [Privy](https://www.privy.io/ai), [Base MCP](https://mcp.base.org), another configured wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/) instead of asking for raw signatures in chat. Base MCP smart-account/WebAuthn signatures are valid when signed over the canonical Precog typed data and current pending nonce. Bankr and Base MCP provider-specific signing/submission rules live in their adapter docs.

If an upcoming market is still `CREATED`, report that it is waiting for Precog validation and do not fund.

If an upcoming market is funded but not yet `DEPLOYED`, report that ForecastOS is waiting for deployment before reading predictions.
