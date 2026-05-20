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

`FORECASTOS_STATE_DIR` controls where `.forecastos` memory is written. `FORECASTOS_SDK_MODULE` is optional and should only point to a trusted replacement runtime when real Precog, Bankr, Privy, Turnkey, or prediction adapters are ready.

## Precog Config

Live Precog calls read config from `.forecastos/config.json`, with optional local overrides from `.forecastos/config.local.json`:

```json
{
  "precog": {
    "api_root": "https://tracker.precog.market/",
    "open_api_key": "0b326e17-65ff-4b1b-9f26-babffda92a16",
    "deployed_master_address": "0x1eB90323aE74E5FBc3241c1D074cFd0b117d7e8E",
    "chain_id": 8453
  }
}
```

The shipped `config.json` contains public defaults so users can run the skill without setup. ForecastOS reads `precog.chain_id` from config and should not ask the user for chain selection. ForecastOS also defaults to Base USDC from `precog.default_collateral_address`; only use a create-action `collateral_address` when the operator explicitly asks for another collateral. `precog.signature_actions` must match the Precog backend action strings used in EIP-712 authorization. `api_root` lives in config and should not be hardcoded in runtime files. `config.local.json` is ignored and may override any `precog` field for local testing. `deployed_master_address` is config-only and is the EIP-712 verifying contract. MCP must not expose config files.

## Supported Actions

- `draft_market`
- `run_skill_step`
- `create_market`
- `await_precog_approval`
- `prepare_funding_intent`
- `fund_market`
- `consume_prediction`

See `references/tool-schemas.md` for the JSON input shapes to pass through `--input`.

## Approval Rules

- Chat-facing draft approval can be a simple `yes`, `approved`, or `looks good`.
- `create_market` requires `approved: true` plus a matching `approved_draft_hash` from workflow state. Legacy hash-bearing `approval_text` remains supported.
- `create_market` requires `image_url`; the Precog endpoint rejects create payloads without it.
- `create_market` uses Base USDC from config by default. `collateral_address` is optional and only for explicit non-default collateral.
- `prepare_funding_intent`
- `prepare_funding_intent` creates a wallet-agnostic intent for Bankr, Privy, Turnkey, or manual wallets.
- `fund_market` requires `approved: true` from an operator after a wallet resolves the intent.
- The bundled runtime may submit approved signed payloads to Precog.
- The bundled runtime does not approve tokens, sign messages, fetch nonces, sign/send transactions, transfer funds, or custody wallets.

## Precog Endpoints

Create uses `POST /api/v1/create-upcoming-market/` with `x-api-key` and JSON:

```json
{
  "question": "...",
  "resolution_criteria": "...",
  "image_url": "https://example.com/image.png",
  "category": "crypto",
  "outcomes": "YES,NO",
  "start_timestamp": 1717000000,
  "end_timestamp": 1719700000,
  "creator_address": "0xCreatorAddress",
  "creator_signature": "0xSignature",
  "creator_email": "optional@email.com"
}
```

Creation payload hygiene:

- `question` is normalized to end with `?`.
- `start_timestamp` and `end_timestamp` are derived from UTC times.
- `image_url` must be an `http` or `https` URL.
- `outcomes` is sent to Precog as one comma-delimited string, for example `"Yes,No,Other"`, and must contain at least two non-empty labels. ForecastOS drafts may keep outcomes as arrays internally.
- `chain_id` is never requested from the user. `collateral_address` defaults to config Base USDC unless explicitly overridden.
- `start_timestamp` must be before `end_timestamp`.
- ForecastOS draft categories such as `agent_launch`, `strategy`, and `other` are mapped to Precog category `AI` unless the action input provides an explicit Precog category.

Funding should start with `prepare_funding_intent`. The intent contains `upcoming_market`, config-sourced `chain_id`, display-unit `amount`, funding asset context, wallet policy prerequisites, token-approval guidance, an EIP-712 typed-data template, and the fields the wallet must return. Bankr, Privy, Turnkey, or a manual wallet resolves allowance, token approval if needed, transaction signing/sending, and the final `tx_hash`, `funder_address`, and `funder_signature`.

After wallet resolution, `fund_market` uses `POST /api/v1/fund-upcoming-market/` with:

```json
{
  "upcoming_market": 123,
  "amount": "1",
  "tx_hash": "0xTransactionHash",
  "funder_address": "0xFunderAddress",
  "funder_signature": "0xSignature"
}
```

Funding `amount` is the Precog API amount in collateral display units. Send a plain positive decimal string like `"1"`, `"10"`, or `"100.5"`. Do not send wei/base units, commas, exponent notation, token symbols, or strings like `"1 MATE"`; keep the asset symbol as context only.

The wallet layer owns nonce lookup and EIP-712 signing. For creation, the wallet policy must allow EIP-712 typed-data signatures. For funding, the wallet policy must allow EIP-712 signatures plus transaction signing/sending, and the wallet flow must approve collateral token allowance if needed. ForecastOS only provides the typed-data shape the wallet must resolve:

```json
{
  "types": {
    "EIP712Domain": [
      { "name": "name", "type": "string" },
      { "name": "version", "type": "string" },
      { "name": "chainId", "type": "uint256" },
      { "name": "verifyingContract", "type": "address" }
    ],
    "PrecogMarketAuthorization": [
      { "name": "action", "type": "string" },
      { "name": "account", "type": "address" },
      { "name": "chainId", "type": "uint256" },
      { "name": "nonce", "type": "uint256" }
    ]
  },
  "primaryType": "PrecogMarketAuthorization",
  "domain": {
    "name": "Precog Markets",
    "version": "1",
    "chainId": "<config.precog.chain_id>",
    "verifyingContract": "<config.precog.deployed_master_address>"
  },
  "message": {
    "action": "<config.precog.signature_actions.create_market or fund_market>",
    "account": "<wallet_address>",
    "chainId": "<config.precog.chain_id>",
    "nonce": "<next_pending_nonce>"
  }
}
```

Approval status uses `GET /api/v1/upcoming-markets/` with query params:

```txt
chain_id=<config.precog.chain_id>&id=<upcoming_market>
```

Precog lifecycle is:

```txt
CREATED -> VALIDATED -> FUNDED -> DEPLOYED
```

Funding is allowed only after `await_precog_approval` sees status `VALIDATED`. `CREATED` means the market exists but is not approved for funding yet.

Prediction consumption first confirms deployment through `GET /api/v1/upcoming-markets/` using only `chain_id` and `id`. If the upcoming market is not `DEPLOYED`, or if it lacks `deployed_market_id`, the workflow stays at `consume_prediction`. ForecastOS uses `deployed_master_address` from `.forecastos/config.json` only when fetching the deployed market from `/api/v1/markets/`.

After deployment, ForecastOS reads the deployed market with `GET /api/v1/markets/` and query params:

```txt
chain_id=<config.precog.chain_id>&master_address=<config.deployed_master_address>&master_market_id=<deployed_market_id>
```

The stored `prediction_result` includes the full market object plus a compact `signal` with parsed `outcomes` and `outcomes_prices`. ForecastOS never invents missing probabilities.

## Replace Points

- Precog approval adapter: approval status source and polling/subscription behavior.
- Wallet intent resolvers: Bankr, Privy, Turnkey, manual operator flow, or another provider to create the transaction and signature.
- Prediction adapter: deployed market read API, probability/source API, and response schema.
