# Action Policy

ForecastOS actions are bounded by human approval and adapter configuration. Creation defaults to Precog: create/publish/launch requests target a Precog upcoming market unless the user explicitly asks for draft-only work.

## MCP Boundary

MCP is read-only. Do not add MCP tools for:

- drafting markets
- creating markets
- running workflow steps
- funding
- wallet actions
- signing
- swaps
- live Precog mutation
- live wallet/action tool calls

## Creation Policy

An agent may attempt `create_market` only when:

- a draft exists
- the draft has no blocking issues
- the human has provided explicit approval, such as `yes`, `approved`, or `looks good`
- the stored approved draft hash matches the current draft hash
- the bundled ForecastOS runtime is available
- `.forecastos/config.json` includes `precog.open_api_key`
- `image_url` is present
- `creator_address` and `creator_signature` have been resolved by trusted wallet/action tooling, when submitting through the action bridge
- the wallet policy allows EOA-compatible EIP-712 typed-data signing
- collateral uses config Base USDC unless the operator explicitly provides another `collateral_address`

`create_market` always submits to the configured Precog API root. Polymarket, Kalshi, and similar external market providers are read-only context providers; they cannot receive ForecastOS creation or funding actions. Wallet adapters do not choose the market venue; they only resolve signing/action fields for Precog payloads.

If any condition is missing, ask in human language. In normal chat, do not ask the user to paste raw wallet addresses or signatures; ask what wallet/action tool should be used for the Precog submission. For creation, offer concrete options such as [Bankr](https://bankr.bot), [Privy](https://www.privy.io/ai), another EOA-compatible wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/). Do not offer [Base MCP](https://mcp.base.org) for creation unless it returns a 65-byte EOA signature; current Base Account smart-account/WebAuthn signatures are not accepted by the Precog create endpoint.

## Funding Policy

An agent may attempt `fund_market` only when:

- market creation has completed or the workflow is at the funding step
- Precog approval state is present with status `VALIDATED`
- the operator explicitly approves funding
- `amount` is specified
- `tx_hash`, `funder_address`, and `funder_signature` have been resolved by trusted wallet/action tooling, when submitting through the action bridge
- the wallet policy allows EIP-712 signing and transaction signing/sending
- collateral token approval has been handled by the wallet flow if allowance was insufficient
- `.forecastos/config.json` includes `precog.open_api_key`

Configured wallet/action tooling resolves a ForecastOS funding intent into token approval if needed, the funding transaction hash, and EIP-712 signature outside ForecastOS. ForecastOS only submits the approved signed funding payload to Precog. Bankr and Base MCP provider-specific signing/submission details live in their adapter docs; the generic policy is that adapters must use trusted prepared transaction payloads and must not invent funding calldata. The submitted `amount` must be a plain display-unit amount string such as `"1"`; do not submit wei/base-unit conversions, token symbols, commas, or exponent notation.

Do not fund when Precog status is only `CREATED`. Funding becomes valid at `VALIDATED`.

Explaining Precog liquidity is informational and does not relax funding policy. LPs supply market liquidity and carry liquidity risk; LP positions are locked until market resolution. The post-payout profit pool is split 90% to LPs, 5% to the market creator, and 5% to the protocol, with the protocol's 5% currently also going to market creators through the creator boost program. Never frame creator or LP earnings as guaranteed profit.

## Prediction Consumption Policy

An agent may attempt `consume_prediction` only when:

- the workflow has reached `consume_prediction`
- a market ID is present
- `precog.chain_id` comes from `.forecastos/config.json`
- `precog.deployed_master_address` is present in `.forecastos/config.json` before fetching the deployed market from `/api/v1/markets/`
- `deployed_market_id` is present in state or discoverable from Precog upcoming-market status

ForecastOS first checks the upcoming market. It may fetch the deployed market only after Precog reports `DEPLOYED` with `deployed_market_id`. It sends config `precog.chain_id` and `id` to upcoming-market queries, and uses config `deployed_master_address` only for deployed-market queries. Empty responses, invalid filters, or API-key failures must keep the workflow in `consume_prediction`.

Never invent prices or probabilities. Store only the values returned by Precog.

## Wallet Policy

Do not request or store:

- private keys
- seed phrases
- raw signing credentials
- custody credentials

Use operator wallet references only, such as a label or account ID controlled outside this skill.

ForecastOS may store public addresses, transaction hashes, and signatures returned by trusted wallet/action tooling for Precog submission. It must not ask users for raw signatures in normal chat, generate signatures, fetch nonces, approve tokens, sign/send transactions, or request signing secrets. Offer concrete wallet/action options such as [Privy](https://www.privy.io/ai), [Base MCP](https://mcp.base.org), another configured wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/).
