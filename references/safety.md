# Safety

ForecastOS is allowed to help agents reason about prediction-market workflows and submit approved signed payloads to Precog. It should not silently spend money, sign transactions, or mutate live markets without explicit approval.

## Guardrails

- Keep MCP read-only.
- Do not expose MCP tools that create, draft, fund, sign, swap, or run workflow steps.
- Require explicit human approval before market creation.
- Require explicit operator approval before funding.
- Check Precog approval status before funding; only `VALIDATED` can move to funding.
- Check upcoming-market deployment before consuming predictions; only `DEPLOYED` can move to the deployed market lookup.
- Reject stale approval when draft IDs or hashes do not match.
- Submit Precog create/fund requests only through `forecastos_action.mjs` after approval and signed fields are present.
- Treat Bankr, Privy, and Turnkey transaction creation as external to ForecastOS unless a trusted adapter is configured. ForecastOS should generate funding intent only; wallets resolve token decimals, transaction execution, nonce lookup, and signatures.
- Never invent market prices or probabilities when Precog returns no deployed market data.
- Never ask for seed phrases, private keys, raw signing secrets, or custody credentials.

## Human-Facing Behavior

When a user asks for live creation or funding, use the shipped `.forecastos/config.json` public defaults unless `.forecastos/config.local.json` overrides them. Still verify approval text and operator-provided signatures before submission. If signed fields are missing, ask for those fields instead of pretending success.

If an upcoming market is still `CREATED`, report that it is waiting for Precog validation and do not fund.

If an upcoming market is funded but not yet `DEPLOYED`, report that ForecastOS is waiting for deployment before reading predictions.
