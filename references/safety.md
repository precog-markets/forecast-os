# Safety

ForecastOS is allowed to help agents reason about prediction-market workflows. It should not silently spend money, sign transactions, or mutate live markets.

## Guardrails

- Keep MCP read-only.
- Do not expose MCP tools that create, draft, fund, sign, swap, or run workflow steps.
- Require explicit human approval before market creation.
- Require explicit operator approval before funding.
- Reject stale approval when draft IDs or hashes do not match.
- Treat Precog creation/approval, Bankr/LiFi funding, and prediction consumption as TODO/mock unless a trusted host adapter is configured.
- Never ask for seed phrases, private keys, raw signing secrets, or custody credentials.

## Human-Facing Behavior

When a user asks for live creation or funding and adapters are missing, say that the workflow is ready but the external action is not wired yet. Return the TODO/replacement point instead of pretending success.
