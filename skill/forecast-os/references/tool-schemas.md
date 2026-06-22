# Action Input Shapes

These shapes are for `scripts/forecastos_action.mjs` and bundled runtime calls. They are not MCP tools. The machine-readable schema lives at `assets/schemas/actions.json`.

## draft_market

When drafting:

- Always use `preferred_market_type: "multi_outcome"` and provide at least three explicit `requested_outcomes`.
- Do not use only `Yes` and `No`. For yes/no-shaped prompts, split the question into objective outcomes such as `Target event happens`, `Target misses the requested date`, and `No official result / event cancelled`; for release/date questions use buckets like `Released in 2027`, `Released before 2027`, `Released after 2027`, and `No official release / cancelled`.
- Outcome labels must not contain commas because Precog creation sends outcomes as a comma-delimited string; use date labels like `June 1-15 2026`, not `June 1-15, 2026`.
- Keep questions at 65 characters or fewer and outcome labels at 32 characters or fewer after comma sanitization.
- Provide detailed `resolution_criteria` when possible using labeled lines for `Source of truth`, `Winning outcome rule`, `Resolution timing`, and `Fallback`.
- Draft approval summaries display configured collateral token context such as `Token: USDC`, including the collateral address when available.
- Supported configured chains are Base (`8453`) and Arbitrum (`42161`). If chain/collateral is missing, ask explicitly (`With collateral from which chain?`) and offer defaults `USDC on Base` and `USDC on Arbitrum`. If already specified, respect the user's selected chain/collateral.
- For non-default collateral, include `chain_id`, `collateral_address`, and `collateral_symbol`. Aliases `requested_collateral_address` and `requested_collateral_symbol` are accepted on draft input.
- `draft_market` returns workflow-backed output: reuse the full `state` object from the result for approval (`state.workflow_id`, `state.draft_id`, `state.draft_hash`).

```json
{
  "prompt": "Create a market asking which launcher gets the most new agents next month.",
  "decision_context": "Launcher strategy planning",
  "preferred_category": "strategy",
  "preferred_market_type": "multi_outcome",
  "requested_outcomes": ["Clawpump", "Liquid", "Virtuals", "Other"],
  "source_hints": ["Official launcher dashboards"],
  "requested_close_time": "2026-06-01T00:00:00Z",
  "requested_resolution_time": "2026-07-01T00:00:00Z",
  "chain_id": 42161,
  "collateral_address": "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  "collateral_symbol": "USDT"
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

## prepare_create_intent

Use this after the draft is approved and the workflow is stored at `create_market`, before wallet-specific signing. ForecastOS returns a wallet-agnostic Precog `CREATE_UPCOMING_MARKET` intent with the Precog payload template and the typed-data template the configured wallet/action tool must resolve. Creation defaults to Precog; this action is not a generic external-provider publish intent. In normal chat, keep the persisted `workflow_id` and finish with `publish_approved_market`.

```json
{
  "draft_id": "draft-id",
  "approved_draft_hash": "hash-from-workflow-state",
  "image_url": "https://example.com/image.png",
  "category": "AI"
}
```

The returned typed data uses `message.action = CREATE_UPCOMING_MARKET`, config chain ID, and config verifying contract. The wallet/action tool resolves the current pending nonce, selected creator account, and final EIP-712 signature.

Supply a square `image_url` when one is readily available, especially for official/social images that are already square-cropped. The bundled runtime validates only that `image_url` is an HTTP(S) or `ipfs://` URL; it does not auto-convert IPFS URIs to gateway URLs and does not inspect dimensions, crop, resize, or reject non-square images.

For concrete wallet providers, pass this intent to the matching top-level adapter under `adapters/wallets/<provider>/`. Wallet adapters do not choose the market venue; they only resolve signing/action fields for Precog payloads. Adapters return event fields for `publish_approved_market`; see `references/wallet-adapters.md`.

## publish_approved_market

Use this after a wallet adapter resolves the stored `create_market` workflow. It loads the persisted workflow state by `workflow_id`, merges the adapter output from `--wallet-output`, submits the Precog upcoming-market request, and advances `.forecastos` to `await_precog_approval`. Do not hand-write `.forecastos/workflows/*` files.

```json
{
  "workflow_id": "workflow-id"
}
```

Run it with a wallet adapter output file:

```txt
node scripts/forecastos_action.mjs publish_approved_market --input <workflow-id-json> --wallet-output <wallet-adapter-output-json>
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

`creator_address` and `creator_signature` are resolved outputs from trusted wallet/action tooling, not fields to request directly from the user in normal chat. Ask which wallet or wallet/action tool the user wants to use; useful creation options include [Bankr](https://bankr.bot), [Privy](https://www.privy.io/ai), [Base MCP](https://mcp.base.org), another configured wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/). ForecastOS does not include signing helpers. Before creation, the wallet/action tool must be allowed to sign the canonical Precog typed-data payload. The wallet signs typed data using `message.action = CREATE_UPCOMING_MARKET`, `message.account = creator_address`, config chain ID, config verifying contract, and the wallet-resolved pending nonce; `creator_address` and `message.account` must both use the same EIP-55 checksum casing. Base Account smart-wallet signatures verified through EIP-1271/ERC-6492 are valid for this canonical typed data, even when the returned hex is longer than a compact EOA signature.

Normal chat flow should feed the resolved fields back through `publish_approved_market` with the persisted `workflow_id` and wallet adapter output file. Use raw `run_skill_step` only when the host already has the exact stored `create_market` state object in memory. Use the direct `create_market` action only as a low-level API call when workflow persistence is not needed.

`create_market` always submits to the configured Precog API root. `image_url` is required for the live Precog create endpoint. Prefer a square `image_url` when one is readily available, but keep non-square images valid when they are the most relevant trusted source. The bundled runtime validates only that `image_url` is an HTTP(S) or `ipfs://` URL; it does not auto-convert IPFS URIs to gateway URLs and does not inspect dimensions, crop, resize, or reject non-square images. If Precog rejects a native `ipfs://` value, operators can manually supply a gateway HTTPS URL instead. If `category` is omitted, ForecastOS maps local draft categories to a Precog-compatible category; non-AI draft categories pass through unchanged. Collateral defaults to the configured chain collateral; include `collateral_address` only as an advanced override for non-default collateral. ForecastOS sends config chain ID as create payload `chain_id`, not as a chat-facing chain choice. The create payload `end_timestamp` is the market close time, not the resolution time.

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

This checks `GET /api/v1/upcoming-markets/` using config `precog.chain_id` and `id`. Funding is allowed only when Precog returns `status: "VALIDATED"`. `CREATED`, `PENDING`, and unknown non-final statuses remain pending; `REJECTED`, `FAILED`, and `DENIED` are terminal rejected states. Use `scripts/check_pending_market.mjs --workflow-id <workflow_id> --auto-redraft` as the one-shot command for hourly external checks. The script returns `continue_schedule`; stop the host automation when it is false. With `--auto-redraft`, rejected markets preserve validator feedback and create a linked replacement draft for user approval without auto-submitting it.

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

The wallet/action tool checks collateral allowance, approves the token if needed, sends the funding transaction, then signs `FUND_UPCOMING_MARKET` with the post-transaction pending nonce and returns `tx_hash`, `funder_address`, and `funder_signature`. Then call `fund_market` with those resolved fields. Useful options include [Bankr](https://bankr.bot), [Privy](https://www.privy.io/ai), [Base MCP](https://mcp.base.org), another configured wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/). Bankr and Base MCP provider-specific signing/submission rules live in their adapter docs.

If the user asks what funding does economically, read `references/precog-liquidity.md`. LPs earn from 90% of the post-payout profit pool, plus trading fees when applicable, but LP positions are locked until market resolution and returns are not guaranteed.
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

`funder_signature` signs EIP-712 typed data using `message.action = config.precog.signature_actions.fund_market`, `message.account = funder_address`, config chain ID, config verifying contract, and the wallet-resolved pending nonce; `funder_address` and `message.account` must both use the same EIP-55 checksum casing. The wallet policy must allow EIP-712 signing and transaction signing/sending before funding. Base MCP creation and funding may return Base Account smart-wallet/WebAuthn hex signatures verified through EIP-1271/ERC-6492; do not reject those adapter outputs just because they are longer than a 65-byte EOA signature.

## prepare_claim_investment_intent

After market resolution. LP investors always; creators when the market had revenue.

```json
{
  "state": {
    "market_id": 428,
    "chain_id": 42161
  },
  "claimant_role": "lp"
}
```

Returns a wallet-agnostic intent with `CLAIM_UPCOMING_MARKET_INVESTMENT` typed-data template. Wallet resolves `investor_address` and `investor_signature`.

## claim_investment

```json
{
  "approved": true,
  "state": { "market_id": 428, "chain_id": 42161 },
  "market": 428,
  "investor_address": "<resolved_by_wallet_tool>",
  "investor_signature": "<resolved_by_wallet_tool>"
}
```

Uses `POST /api/v1/claim-upcoming-market-investment/` with body fields `network`, `market`, `investor_address`, `investor_signature`.

## prepare_claim_incentive_intent

After market resolution. **LP investors only**, on markets with an incentive program (bonus token from funding).

```json
{
  "state": {
    "market_id": 428,
    "chain_id": 42161
  }
}
```

Returns intent with `CLAIM_UPCOMING_MARKET_INCENTIVE` typed-data template.

## claim_incentive

```json
{
  "approved": true,
  "state": { "market_id": 428, "chain_id": 42161 },
  "market": 428,
  "investor_address": "<resolved_by_wallet_tool>",
  "investor_signature": "<resolved_by_wallet_tool>"
}
```

Uses `POST /api/v1/claim-upcoming-market-incentive/`. Success returns `claimed_incentive` and `claim_tx`.

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

If `deployed_market_id` is missing, ForecastOS checks `GET /api/v1/upcoming-markets/` first using only `chain_id` and `id`. Once the upcoming market is `DEPLOYED`, it fetches `GET /api/v1/markets/` with config `precog.chain_id`, `master_market_id`, and `master_address` from the active `.forecastos/config.json`.

The result stores the raw market plus parsed `outcomes` and `outcomes_prices` in `prediction_result.signal`. Empty or errored responses keep the workflow in `consume_prediction`.
