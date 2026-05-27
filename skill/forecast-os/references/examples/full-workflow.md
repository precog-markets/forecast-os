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
3. Present title, question, outcomes, resolution criteria, close time, resolution time, source, and only the warnings/blockers that matter.
4. Do not paste raw JSON, draft IDs, workflow IDs, hashes, file paths, or quality scores unless the user asks for technical detail.
5. End with a clear next step: "Reply yes to approve, or tell me what you want changed."
6. Wait for explicit human approval.
7. Attempt Precog creation only through the bundled CLI/runtime action bridge.
8. If Precog is not configured, return a clear config error.
9. Move to Precog approval, funding, and deployed-market consumption only when the workflow state allows it.

## Funding Handoff

Funding is not automatic. The agent should ask what wallet or wallet/action tool should resolve funding. That tool returns the low-level fields needed by the action bridge:

- amount, as a plain display-unit string such as `"1"`
- asset
- tx_hash
- funder_address
- funder_signature
- explicit operator approval

ForecastOS does not create the funding transaction or signature. It submits the approved signed payload to Precog after status is `VALIDATED`.
