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

By default, bundled scripts read and write the skill-local `.forecastos` directory next to `SKILL.md`: `skill/forecast-os/.forecastos` in the repo, or the installed skill's own `.forecastos` directory in the active host. `FORECASTOS_STATE_DIR` controls where `.forecastos` memory and config are read/written when a custom location is needed; scripts with `--state-dir` also accept that explicit override. A repo-root `.forecastos/config.json` is not required unless an operator explicitly points `FORECASTOS_STATE_DIR` or `--state-dir` there. The bundled scripts and local runtime are the execution path for normal Precog create/fund/status/prediction flows. Creation defaults to Precog: `prepare_create_intent` and `create_market` are Precog creation steps, not provider-neutral publishing steps.

## Version And Scheduled Checks

The repo root `VERSION` is the canonical source. A skill-local `VERSION` is generated only for fixed-copy installs where the skill is detached from the repo; run `node scripts/sync_version.mjs` from the repo before copying if the install needs that artifact file. Run `node scripts/check_version.mjs` daily from the skill directory or repo to get JSON with current skill, repo, optional artifact, and version-drift fields. The script only reports; Codex automation, cron, or another scheduler owns the daily cadence.

For markets waiting on Precog approval, run `node scripts/check_pending_market.mjs --workflow-id <workflow_id>` hourly. The script polls once per invocation, keeps `CREATED`, `PENDING`, and unknown non-final statuses in `await_precog_approval`, advances `VALIDATED` to funding readiness, and records `REJECTED`, `FAILED`, or `DENIED` as terminal rejected/error states.

## Precog Config

Live Precog calls read config from the active state directory's `config.json`, with optional local overrides from `config.local.json`. In the repo, the bundled public config lives at `skill/forecast-os/.forecastos/config.json`:

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
- Draft approval summaries display the configured collateral token, for example `Token: USDC`, and include the collateral address when available. This is collateral context, not a claim about deployed market token details.
- `prepare_funding_intent` creates a wallet-agnostic intent for configured wallet/action tooling.
- `fund_market` requires `approved: true` from an operator after a wallet resolves the intent.
- The bundled runtime may submit approved signed payloads to Precog after trusted tooling resolves them.
- The bundled runtime asks which wallet or wallet/action tool should sign the Precog create/fund payload. For creation, offer [Bankr](https://bankr.bot), [Privy](https://www.privy.io/ai), another EOA-compatible wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/); [Base MCP](https://mcp.base.org) smart-account/WebAuthn signatures are not accepted by the current Precog create endpoint unless the signer returns a 65-byte EOA signature. For funding, [Bankr](https://bankr.bot), [Base MCP](https://mcp.base.org), or another configured wallet/action tool may be used after a prepared unsigned calldata envelope exists; Base Account smart-wallet signatures verified through EIP-1271/ERC-6492 are accepted for funding. It does not ask users for raw address/signature fields in normal chat, approve tokens, sign messages, fetch nonces, sign/send transactions, transfer funds, or custody wallets.

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
- `resolution_criteria` should be detailed enough to display directly in Launchpad: name the source of truth, state how exactly one listed outcome wins, include the resolution time, and describe fallback/no official result handling when relevant.
- `outcomes` is sent to Precog as one comma-delimited string, for example `"Yes,No,Other"`, and must contain at least two non-empty labels. ForecastOS drafts may keep outcomes as arrays internally.
- Outcome labels must not contain commas because the Precog create API treats commas as outcome separators. Use labels such as `June 1-15 2026`, not `June 1-15, 2026`.
- Questions must be 65 characters or fewer, and outcome labels must be 32 characters or fewer after comma sanitization. If a draft exceeds either Launchpad-friendly limit, shorten the question or labels before approval.
- `chain_id` is sourced from config `precog.chain_id` and sent in the create payload.
- `chain_id` is never requested from the user. `collateral_address` defaults to config Base USDC unless explicitly overridden.
- `start_timestamp` must be before `end_timestamp`.
- ForecastOS draft categories such as `agent_launch`, `strategy`, and `other` are mapped to Precog category `AI`. Other draft categories pass through unchanged. Omit an action-level `category` unless the operator intentionally overrides the draft category.

Normal chat Precog creation flow after approval:

1. Call `prepare_create_intent` to generate the wallet-agnostic Precog create payload and EIP-712 typed-data template.
2. Let the selected wallet/action tool resolve `creator_address` and `creator_signature`.
3. Call `run_skill_step` with the current `create_market` workflow state and `--wallet-output <wallet-adapter-output-json>`. This submits the Precog upcoming-market request and advances `.forecastos` to `await_precog_approval`.

[Base MCP](https://mcp.base.org) creation caveat: current Base Account signatures are smart-account/WebAuthn signatures, and the Precog create endpoint currently validates EOA-style 65-byte EIP-712 signatures. Do not submit Base MCP smart-account signatures for creation; use [Privy](https://www.privy.io/ai), another EOA-compatible wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/) unless Base MCP returns a 65-byte EOA signature.

After creation, report the created market title and generated `https://core.precog.markets/launchpad/{chainId}/{marketId}/{slug}` link to the user so they can share or check the market.

Direct `create_market` is still available as a low-level action, but it only returns the create result and does not advance stored workflow state by itself.

For concrete wallet providers, use the matching top-level adapter under `adapters/wallets/<provider>/` after `prepare_create_intent`. Wallet adapters do not choose the market venue; they only resolve signing/action fields for Precog payloads. Bankr support lives under `adapters/wallets/bankr/`; keep Bankr endpoint and setup details in the Bankr adapter docs. See `references/wallet-adapters.md` and `adapters/wallets/contract.md`.

Funding should start with `prepare_funding_intent`. The intent contains `upcoming_market`, config-sourced `chain_id`, display-unit `amount`, funding asset context, wallet policy prerequisites, token-approval guidance, an EIP-712 typed-data template, and the fields the wallet must return. A configured wallet/action tool resolves allowance, token approval if needed, transaction signing/sending, and the final `tx_hash`, `funder_address`, and `funder_signature`. Bankr and Base MCP details live in their provider adapter docs; provider adapters must not invent funding calldata.

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

Funding is allowed only after `await_precog_approval` sees status `VALIDATED`. `CREATED` and `PENDING` mean the market exists but is not approved for funding yet; check again later, typically hourly via `scripts/check_pending_market.mjs`. Treat `REJECTED`, `FAILED`, and `DENIED` as rejected terminal states and keep the raw Precog status in workflow memory.

Prediction consumption first confirms deployment through `GET /api/v1/upcoming-markets/` using only `chain_id` and `id`. If the upcoming market is not `DEPLOYED`, or if it lacks `deployed_market_id`, the workflow stays at `consume_prediction`. ForecastOS uses `deployed_master_address` from the active `.forecastos/config.json` only when fetching the deployed market from `/api/v1/markets/`.

After deployment, ForecastOS reads the deployed market with `GET /api/v1/markets/` and query params:

```txt
chain_id=<config.precog.chain_id>&master_address=<config.deployed_master_address>&master_market_id=<deployed_market_id>
```

The stored `prediction_result` includes the full market object plus a compact `signal` with parsed `outcomes` and `outcomes_prices`. ForecastOS never invents missing probabilities.

## Replace Points

- Precog approval adapter: approval status source and polling/subscription behavior.
- Wallet intent resolvers: Configured wallet/action tooling or an external wallet flow to create the transaction and signature.
- Prediction adapter: deployed market read API, probability/source API, and response schema.
