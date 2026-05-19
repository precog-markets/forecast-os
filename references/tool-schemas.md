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

Times should be UTC ISO strings with `Z`. If a timezone-less time is provided, the bundled runtime treats it as UTC and records a warning.

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
  "approved_draft_hash": "hash-from-workflow-state",
  "image_url": "https://example.com/image.png",
  "category": "AI",
  "collateral_address": "0xCollateral",
  "chain_id": 8453,
  "creator_address": "0xCreatorAddress",
  "creator_signature": "0xSignature",
  "creator_email": "optional@email.com"
}
```

For normal chat flows, the user can approve by replying `yes`; the workflow stores `approved_draft_hash` internally. Legacy `approval_text` is still accepted when it contains the draft id and hash.

`creator_signature` must be provided by the operator wallet layer. It signs:

```txt
precog.markets|<creator_address_lowercase>|<chain_id>|<next_pending_nonce>
```

`image_url` is required for the live Precog create endpoint. If `category` is omitted, ForecastOS maps local draft categories to a Precog-compatible category.

## await_precog_approval

```json
{
  "state": {
    "workflow_id": "workflow-id",
    "step": "await_precog_approval",
    "market_id": 123,
    "chain_id": 8453
  },
  "event": {}
}
```

This checks `GET /api/v1/upcoming-markets/` using `chain_id`, `id`, and `precog.deployed_master_address` from `.forecastos/config.json`. The deployed master address is config-only. Funding is allowed only when Precog returns `status: "VALIDATED"`.

## fund_market

Funding requires explicit operator approval. Bankr/LiFi can create the funding transaction outside ForecastOS; ForecastOS submits the resulting signed payload to Precog.

```json
{
  "approved": true,
  "state": {
    "workflow_id": "workflow-id",
    "step": "fund",
    "market_id": "market-id",
    "precog_approval": {}
  },
  "upcoming_market": 123,
  "amount": "100000000",
  "tx_hash": "0xTransactionHash",
  "funder_address": "0xFunderAddress",
  "funder_signature": "0xSignature"
}
```

`funder_signature` signs:

```txt
precog.markets|<funder_address_lowercase>|<market_chain_id>|<next_pending_nonce>
```

## consume_prediction

```json
{
  "state": {
    "workflow_id": "workflow-id",
    "step": "consume_prediction",
    "market_id": 123,
    "upcoming_market": 123,
    "chain_id": 8453,
    "deployed_market_id": 1,
    "funding_result": {}
  },
  "event": {
    "prediction_request": {
      "source": "precog",
      "chain_id": 8453,
      "master_market_id": 1
    }
  }
}
```

If `deployed_market_id` is missing, ForecastOS checks `GET /api/v1/upcoming-markets/` first. Once the upcoming market is `DEPLOYED`, it fetches `GET /api/v1/markets/` with `chain_id`, `master_market_id`, and `master_address` from `.forecastos/config.json`.

The result stores the raw market plus parsed `outcomes` and `outcomes_prices` in `prediction_result.signal`. Empty or errored responses keep the workflow in `consume_prediction`.
