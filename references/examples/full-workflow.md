# Full Workflow Example

## User Prompt

```txt
Create a ForecastOS market for which launchpad gets the most new agents in June: Clawpump, Liquid, Virtuals, or Other.
```

## Draft Input

```json
{
  "prompt": "Create a ForecastOS market for which launchpad gets the most new agents in June: Clawpump, Liquid, Virtuals, or Other.",
  "preferred_category": "agent_launch",
  "preferred_market_type": "multi_outcome",
  "requested_outcomes": ["Clawpump", "Liquid", "Virtuals", "Other"],
  "source_hints": ["Official launchpad dashboards"],
  "requested_close_time": "2026-06-01T00:00:00Z",
  "requested_resolution_time": "2026-07-01T00:00:00Z"
}
```

## Expected Agent Behavior

1. Draft a multi-outcome market.
2. Ask for missing source details if the source of truth is not objective enough.
3. Present title, question, outcomes, resolution criteria, close time, resolution time, source, warnings, and approval text.
4. Wait for explicit human approval.
5. Attempt creation only through the bundled CLI/runtime action bridge.
6. If Precog is not configured, return a clear config error.
7. Move to Precog approval, funding, and deployed-market consumption only when the workflow state allows it.

## Funding Handoff

Funding is not automatic. The agent should ask for:

- provider: `manual`, `bankr`, or `lifi`
- amount
- asset
- tx_hash
- funder_address
- funder_signature
- explicit operator approval

ForecastOS does not create the funding transaction or signature. It submits the approved signed payload to Precog after status is `VALIDATED`.
