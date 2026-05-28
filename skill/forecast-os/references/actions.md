# Bundled CLI / Runtime Action Bridge

Use the action bridge for normal ForecastOS execution. The skill includes a bundled runtime at `scripts/forecastos_runtime.mjs`, so no external SDK or MCP server is required for drafting, workflow state, Precog create/fund submission, or prediction consumption.

Before executing an action, inspect persistent workflow memory with:

```txt
node scripts/next_step.mjs --workflow-id <workflow_id>
node scripts/render_review.mjs --workflow-id <workflow_id>
```

```txt
node scripts/forecastos_action.mjs <action> --input <json-file>
```

When a wallet adapter returns signed fields, pass the adapter output as a file
instead of threading signatures through shell variables:

```txt
node scripts/forecastos_action.mjs run_skill_step \
  --input <create-market-step-json> \
  --wallet-output <wallet-adapter-output-json>
```

`--adapter-output` is accepted as an alias. For `run_skill_step`, the adapter's
`event` object is merged into the action event. For direct `create_market`, the
adapter's `event` fields are merged into the create input. For `fund_market`,
the adapter's `funding_request` is merged into the funding request.

Optional state directory override:

```txt
FORECASTOS_STATE_DIR=.forecastos
```

`FORECASTOS_STATE_DIR` controls where `.forecastos` memory is written. The bundled scripts and local runtime are the execution path for normal Precog create/fund/status/prediction flows. Creation defaults to Precog: `prepare_create_intent` and `create_market` are Precog creation steps, not provider-neutral publishing steps.

## Precog Config

Live Precog calls read config from `.forecastos/config.json`, with optional local overrides from `.forecastos/config.local.json`:

```json
{
  "precog": {
    "api_root": "https://tracker.precog.market/",
    "open_api_key": "0b326e17-65ff-4b1b-9f26-babffda92a16",
    "deployed_master_address": "0x1eB90323aE74E5FBc3241c1D074cFd0b117d7e8E",
    "chain_id": 8453,
    "signature_actions": {
      "create_market": "CREATE_UPCOMING_MARKET",
      "fund_market": "FUND_UPCOMING_MARKET"
    }
  }
}
```

The shipped `config.json` contains public defaults so users can run the skill without setup. ForecastOS reads `precog.chain_id` from config and should not ask the user for chain selection. ForecastOS also defaults to Base USDC from `precog.default_collateral_address`; only use a create-action `collateral_address` when the operator explicitly asks for another collateral. `precog.signature_actions` must match the Precog backend action strings used in EIP-712 authorization. `api_root` lives in config and should not be hardcoded in runtime files. `config.local.json` is ignored and may override any `precog` field for local testing. `deployed_master_address` is config-only and is the EIP-712 verifying contract. MCP must not expose config files.

## Supported Actions

- `draft_market`
- `run_skill_step`
- `prepare_create_intent`
- `create_market`
- `await_precog_approval`
- `prepare_funding_intent`
- `fund_market`
- `consume_prediction`

See `references/tool-schemas.md` for the JSON input shapes to pass through `--input`.

## Approval Rules

- Chat-facing draft approval can be a simple `yes`, `approved`, or `looks good`.
- `prepare_create_intent` creates the wallet-agnostic Precog `CREATE_UPCOMING_MARKET` intent after approval.
- `create_market` submits to the configured Precog API root and requires `approved: true` plus a matching `approved_draft_hash` from workflow state and wallet/action-tool resolved creator fields. Legacy hash-bearing `approval_text` remains supported.
- `create_market` requires `image_url`; the Precog endpoint rejects create payloads without it.
- `create_market` uses Base USDC from config by default. `collateral_address` is optional and only for explicit non-default collateral.
- After a successful `create_market`, ForecastOS generates a launchpad share/check URL in the form `https://core.precog.markets/launchpad/{chainId}/{marketId}/{slug}`. The URL is built locally from config `precog.chain_id`, the normalized upcoming market id, and a question-derived slug; do not rely on a backend-provided `url` field.
- `prepare_funding_intent` creates a wallet-agnostic intent for configured wallet/action tooling.
- `fund_market` requires `approved: true` from an operator after a wallet resolves the intent.
- The bundled runtime may submit approved signed payloads to Precog after trusted tooling resolves them.
- The bundled runtime asks which wallet or wallet/action tool should sign the Precog create/fund payload. For creation, offer [Privy](https://www.privy.io/ai), another EOA-compatible wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/); [Base MCP](https://mcp.base.org) smart-account/WebAuthn signatures are not accepted by the current Precog create endpoint unless the signer returns a 65-byte EOA signature. For funding, [Base MCP](https://mcp.base.org) may be used after a prepared unsigned calldata envelope exists. It does not ask users for raw address/signature fields in normal chat, approve tokens, sign messages, fetch nonces, sign/send transactions, transfer funds, or custody wallets.

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
  "collateral_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "chain_id": 8453,
  "creator_address": "<resolved_by_wallet_tool>",
  "creator_signature": "<resolved_by_wallet_tool>",
  "creator_email": "optional@email.com"
}
```

Creation payload hygiene:

- `question` is normalized to end with `?`.
- `start_timestamp` defaults to the current UTC time unless explicitly provided. `end_timestamp` is derived from the draft close time unless an explicit `end_timestamp` override is provided. Do not use the resolution time as `end_timestamp`.
- `image_url` must be an `http` or `https` URL.
- `image_url` should ideally point to a square image because market UIs may render thumbnail/card crops. Prefer trusted, relevant official/social images over strict aspect ratio, and do not block creation when only a good non-square image is available.
- `outcomes` is sent to Precog as one comma-delimited string, for example `"Yes,No,Other"`, and must contain at least two non-empty labels. ForecastOS drafts may keep outcomes as arrays internally.
- `chain_id` is sourced from config `precog.chain_id` and sent in the create payload.
- `chain_id` is never requested from the user. `collateral_address` defaults to config Base USDC unless explicitly overridden.
- `start_timestamp` must be before `end_timestamp`.
- ForecastOS draft categories such as `agent_launch`, `strategy`, and `other` are mapped to Precog category `AI`. Other draft categories pass through unchanged. Omit an action-level `category` unless the operator intentionally overrides the draft category.

Normal chat Precog creation flow after approval:

1. Call `prepare_create_intent` to generate the wallet-agnostic Precog create payload and EIP-712 typed-data template.
2. Let the selected wallet/action tool resolve `creator_address` and `creator_signature`.
3. Call `run_skill_step` with the current `create_market` workflow state and `--wallet-output <wallet-adapter-output-json>`. This submits the Precog upcoming-market request and advances `.forecastos` to `await_precog_approval`.

After creation, report the created market title and generated `https://core.precog.markets/launchpad/{chainId}/{marketId}/{slug}` link to the user so they can share or check the market.

[Base MCP](https://mcp.base.org) creation caveat: current Base Account signatures are smart-account/WebAuthn signatures, and the Precog create endpoint currently validates EOA-style 65-byte EIP-712 signatures. Do not submit Base MCP smart-account signatures for creation; use [Privy](https://www.privy.io/ai), another EOA-compatible wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/) unless Base MCP returns a 65-byte EOA signature.

Direct `create_market` is still available as a low-level action, but it only returns the create result and does not advance stored workflow state by itself.

For concrete wallet providers, use the matching top-level adapter under `adapters/wallets/<provider>/` after `prepare_create_intent`. Wallet adapters do not choose the market venue; they only resolve signing/action fields for Precog payloads. See `references/wallet-adapters.md` and `adapters/wallets/contract.md`.

Funding should start with `prepare_funding_intent`. The intent contains `upcoming_market`, config-sourced `chain_id`, display-unit `amount`, funding asset context, wallet policy prerequisites, token-approval guidance, an EIP-712 typed-data template, and the fields the wallet must return. A configured wallet/action tool resolves allowance, token approval if needed, transaction signing/sending, and the final `tx_hash`, `funder_address`, and `funder_signature`.

For user-facing explanations of funding economics, read `references/precog-liquidity.md`. In short: winning outcome traders are paid first, remaining funds become the profit pool, and the profit pool is split 90% to LPs, 5% to the market creator, and 5% to the protocol. Current creator boost behavior means the protocol's 5% currently also goes to market creators through the creator boost program. Funding still requires explicit approval and must not be presented as guaranteed profit.

After wallet resolution, `fund_market` uses `POST /api/v1/fund-upcoming-market/` with:

```json
{
  "upcoming_market": 123,
  "amount": "1",
  "tx_hash": "0xTransactionHash",
  "funder_address": "<resolved_by_wallet_tool>",
  "funder_signature": "<resolved_by_wallet_tool>"
}
```

Funding `amount` is the Precog API amount in collateral display units. Send a plain positive decimal string like `"1"`, `"10"`, or `"100.5"`. Do not send wei/base units, commas, exponent notation, token symbols, or strings like `"1 MATE"`; keep the asset symbol as context only.

The wallet/action tooling owns address selection, nonce lookup, EIP-712 signing, and transaction execution. For creation, the wallet policy must allow EIP-712 typed-data signatures for `CREATE_UPCOMING_MARKET`. For funding, the wallet policy must allow EIP-712 signatures for the configured funding action plus transaction signing/sending, and the wallet/action tool must approve collateral token allowance if needed. ForecastOS only provides the typed-data shape the tooling must resolve:

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
- Wallet intent resolvers: Configured wallet/action tooling or an external wallet flow to create the transaction and signature.
- Prediction adapter: deployed market read API, probability/source API, and response schema.
