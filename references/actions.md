# Bundled CLI / Runtime Action Bridge

Use the action bridge for local ForecastOS execution. The skill includes a bundled runtime at `scripts/forecastos_runtime.mjs`, so no external SDK is required for drafting, workflow state, Precog create/fund submission, or prediction-consumption placeholders.

Before executing an action, inspect persistent workflow memory with:

```txt
node scripts/next_step.mjs --workflow-id <workflow_id>
node scripts/render_review.mjs --workflow-id <workflow_id>
```

```txt
node scripts/forecastos_action.mjs <action> --input <json-file>
```

Optional:

```txt
FORECASTOS_SDK_MODULE=<module-or-path>
FORECASTOS_STATE_DIR=.forecastos
```

`FORECASTOS_STATE_DIR` controls where `.forecastos` memory is written. `FORECASTOS_SDK_MODULE` is optional and should only point to a trusted replacement runtime when real Precog, Bankr/LiFi, or prediction adapters are ready.

## Precog Config

Live Precog calls read config from `.forecastos/config.json`:

```json
{
  "precog": {
    "api_root": "https://tracker.precog.market/",
    "open_api_key": "..."
  }
}
```

`api_root` defaults to `https://tracker.precog.market/` when omitted. `open_api_key` is required for `create_market` and `fund_market`. MCP must not expose this file.

## Supported Actions

- `draft_market`
- `run_skill_step`
- `create_market`
- `await_precog_approval`
- `fund_market`
- `consume_prediction`

See `references/tool-schemas.md` for the JSON input shapes to pass through `--input`.

## Approval Rules

- `create_market` requires `approved: true` and `approval_text`.
- `fund_market` requires `approved: true` from an operator.
- The bundled runtime may submit approved signed payloads to Precog.
- The bundled runtime does not sign messages, fetch nonces, transfer funds, or custody wallets.

## Precog Endpoints

Create uses `POST /api/v1/create-upcoming-market/` with `x-api-key` and JSON:

```json
{
  "question": "...",
  "resolution_criteria": "...",
  "image_url": "https://example.com/image.png",
  "category": "crypto",
  "outcomes": ["YES", "NO"],
  "start_timestamp": 1717000000,
  "end_timestamp": 1719700000,
  "collateral_address": "0x...",
  "chain_id": 8453,
  "creator_address": "0xCreatorAddress",
  "creator_signature": "0xSignature",
  "creator_email": "optional@email.com"
}
```

Fund uses `POST /api/v1/fund-upcoming-market/` with:

```json
{
  "upcoming_market": 123,
  "amount": "100000000",
  "tx_hash": "0xTransactionHash",
  "funder_address": "0xFunderAddress",
  "funder_signature": "0xSignature"
}
```

Signatures are EIP-191 `signMessage(...)`, not typed data. ForecastOS expects the operator/wallet layer to provide signatures for:

```txt
precog.markets|<address_lowercase>|<chain_id>|<next_pending_nonce>
```

## Replace Points

- Precog approval adapter: approval status source and polling/subscription behavior.
- Funding transaction adapter: Bankr, LiFi, manual operator flow, or another provider to create the transaction and signature.
- Prediction adapter: probability/source API and response schema.
