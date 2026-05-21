# Action Input Shapes

These shapes are for `scripts/forecastos_action.mjs` and bundled runtime calls. They are not MCP tools. The machine-readable schema lives at `assets/schemas/actions.json`.

## draft_market

Always prefer `preferred_market_type: "multi_outcome"` and provide explicit `requested_outcomes` when known. Do not ask the user for chain selection; ForecastOS reads `precog.chain_id` from `.forecastos/config.json`. Do not ask for collateral in the normal flow; ForecastOS defaults to Base USDC unless the operator explicitly requests another collateral.

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
  "creator_address": "<resolved_by_wallet_tool>",
  "creator_signature": "<resolved_by_wallet_tool>",
  "creator_email": "optional@email.com"
}
```

For normal chat flows, the user can approve by replying `yes`; the workflow stores `approved_draft_hash` internally. Legacy `approval_text` is still accepted when it contains the draft id and hash.

`creator_address` and `creator_signature` are resolved outputs from trusted wallet/action tooling, not fields to request directly from the user in normal chat. Ask which wallet or wallet/action tool the user wants to use; if none is available, send them to https://core.precog.markets/launchpad/. ForecastOS does not include signing helpers. Before creation, the wallet policy must allow EIP-712 typed-data signatures. The wallet signs EIP-712 typed data using `message.action = config.precog.signature_actions.create_market`, `message.account = creator_address`, config chain ID, config verifying contract, and the wallet-resolved pending nonce.

`image_url` is required for the live Precog create endpoint. If `category` is omitted, ForecastOS maps local draft categories to a Precog-compatible category. Collateral defaults to config Base USDC; include `collateral_address` only as an advanced override for non-default collateral.

## await_precog_approval

```json
{
  "state": {
    "workflow_id": "workflow-id",
    "step": "await_precog_approval",
    "market_id": 123,
  },
  "event": {}
}
```

This checks `GET /api/v1/upcoming-markets/` using config `precog.chain_id` and `id`. Funding is allowed only when Precog returns `status: "VALIDATED"`.

## prepare_funding_intent

Use this before wallet-specific funding. ForecastOS returns a wallet-agnostic intent that Codex, Claude Code, or OpenClaw can hand to A configured wallet/action tool flow.

```json
{
  "state": {
    "step": "fund",
    "market_id": 123,
    "precog_approval": { "status": "VALIDATED" }
  },
  "provider": "configured-wallet-tool",
  "amount": "1",
  "funding_asset": "MATE"
}
```

The wallet/action tool checks collateral allowance, approves the token if needed, signs/sends the funding transaction, and returns `tx_hash`, `funder_address`, and `funder_signature`. Then call `fund_market` with those resolved fields. If no wallet/action tool is configured, direct the user to https://core.precog.markets/launchpad/.
## fund_market

Funding requires explicit operator approval. A configured wallet/action tool can approve tokens if needed and create the funding transaction outside ForecastOS; ForecastOS submits the resulting signed payload to Precog. `amount` must be a plain display-unit decimal string for the Precog API, such as `"1"` for `1 MATE`; never convert it to wei/base units and never include the token symbol in the amount string.

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
  "amount": "1",
  "tx_hash": "0xTransactionHash",
  "funder_address": "<resolved_by_wallet_tool>",
  "funder_signature": "<resolved_by_wallet_tool>"
}
```

`funder_signature` signs EIP-712 typed data using `message.action = config.precog.signature_actions.fund_market`, `message.account = funder_address`, config chain ID, config verifying contract, and the wallet-resolved pending nonce. The wallet policy must allow EIP-712 signing and transaction signing/sending before funding.

## consume_prediction

```json
{
  "state": {
    "workflow_id": "workflow-id",
    "step": "consume_prediction",
    "market_id": 123,
    "upcoming_market": 123,
    "deployed_market_id": 1,
    "funding_result": {}
  },
  "event": {
    "prediction_request": {
      "source": "precog",
      "master_market_id": 1
    }
  }
}
```

If `deployed_market_id` is missing, ForecastOS checks `GET /api/v1/upcoming-markets/` first using only `chain_id` and `id`. Once the upcoming market is `DEPLOYED`, it fetches `GET /api/v1/markets/` with config `precog.chain_id`, `master_market_id`, and `master_address` from `.forecastos/config.json`.

The result stores the raw market plus parsed `outcomes` and `outcomes_prices` in `prediction_result.signal`. Empty or errored responses keep the workflow in `consume_prediction`.
