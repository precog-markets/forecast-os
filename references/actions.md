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

Live Precog calls read config from `.forecastos/config.json`, with optional local overrides from `.forecastos/config.local.json`:

```json
{
  "precog": {
    "open_api_key": "0b326e17-65ff-4b1b-9f26-babffda92a16",
    "deployed_master_address": "0x1eB90323aE74E5FBc3241c1D074cFd0b117d7e8E"
  }
}
```

The shipped `config.json` contains public defaults so users can run the skill without setup. `api_root` is intentionally omitted and comes from the bundled runtime default unless `config.local.json` overrides it. `config.local.json` is ignored and may override any `precog` field for local testing. `deployed_master_address` is config-only and must not be overridden by action input. MCP must not expose config files.

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

Approval status uses `GET /api/v1/upcoming-markets/` with query params:

```txt
chain_id=<chain_id>&deployed_master_address=<deployed_master_address>&id=<upcoming_market>
```

Precog lifecycle is:

```txt
CREATED -> VALIDATED -> FUNDED -> DEPLOYED
```

Funding is allowed only after `await_precog_approval` sees status `VALIDATED`. `CREATED` means the market exists but is not approved for funding yet.

Prediction consumption first confirms deployment through `GET /api/v1/upcoming-markets/`. ForecastOS always sends `deployed_master_address` from `.forecastos/config.json`. If the upcoming market is not `DEPLOYED`, or if it lacks `deployed_market_id`, the workflow stays at `consume_prediction`.

After deployment, ForecastOS reads the deployed market with `GET /api/v1/markets/` and query params:

```txt
chain_id=<chain_id>&master_address=<config.deployed_master_address>&master_market_id=<deployed_market_id>
```

The stored `prediction_result` includes the full market object plus a compact `signal` with parsed `outcomes` and `outcomes_prices`. ForecastOS never invents missing probabilities.

## Replace Points

- Precog approval adapter: approval status source and polling/subscription behavior.
- Funding transaction adapter: Bankr, LiFi, manual operator flow, or another provider to create the transaction and signature.
- Prediction adapter: deployed market read API, probability/source API, and response schema.
