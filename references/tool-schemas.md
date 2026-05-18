# Action Input Shapes

These shapes are for `scripts/forecastos_action.mjs` and bundled runtime calls. They are not MCP tools. The machine-readable schema lives at `assets/schemas/actions.json`.

## draft_market

Always prefer `preferred_market_type: "multi_outcome"` and provide explicit `requested_outcomes` when known.

```json
{
  "prompt": "Create a market asking which launcher gets the most new agents next month.",
  "decision_context": "Launcher strategy planning",
  "preferred_category": "strategy",
  "preferred_market_type": "multi_outcome",
  "requested_outcomes": ["Clawpump", "Liquid", "Virtuals", "Other"],
  "source_hints": ["Official launcher dashboards"],
  "requested_close_time": "2026-06-01T00:00:00Z",
  "requested_resolution_time": "2026-07-01T00:00:00Z"
}
```

## run_skill_step

```json
{
  "state": {
    "workflow_id": "workflow-id",
    "step": "intake",
    "prompt": "User prompt"
  },
  "event": {
    "draft_input": {
      "preferred_market_type": "multi_outcome",
      "requested_outcomes": ["Outcome A", "Outcome B", "Other"]
    }
  }
}
```

## create_market

```json
{
  "draft_id": "draft-id",
  "approved": true,
  "approved_by": "operator-id",
  "approval_text": "I approve ForecastOS draft draft-id at hash draft-hash.",
  "operator_wallet_reference": "optional operator-controlled wallet/account reference"
}
```

## await_precog_approval

```json
{
  "state": {
    "workflow_id": "workflow-id",
    "step": "await_precog_approval",
    "market_id": "market-id"
  },
  "event": {}
}
```

## fund_market

Funding requires explicit operator approval. Bankr/LiFi are adapter hints, not built-in live execution.

```json
{
  "approved": true,
  "state": {
    "workflow_id": "workflow-id",
    "step": "fund",
    "market_id": "market-id",
    "precog_approval": {}
  },
  "event": {
    "funding_request": {
      "provider": "manual",
      "amount": "100",
      "asset": "USDC"
    }
  }
}
```

## consume_prediction

```json
{
  "state": {
    "workflow_id": "workflow-id",
    "step": "consume_prediction",
    "market_id": "market-id",
    "funding_result": {}
  },
  "event": {
    "prediction_request": {
      "market_id": "market-id",
      "source": "precog"
    }
  }
}
```
