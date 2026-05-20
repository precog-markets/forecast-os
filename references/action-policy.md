# Action Policy

ForecastOS actions are bounded by human approval and adapter configuration.

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
- live Bankr, Privy, or Turnkey calls

## Creation Policy

An agent may attempt `create_market` only when:

- a draft exists
- the draft has no blocking issues
- the human has provided explicit approval
- the approval text matches the current draft ID and hash
- the bundled ForecastOS runtime or a trusted replacement module is configured
- `.forecastos/config.json` includes `precog.open_api_key`
- operator-provided `creator_address`, `creator_signature`, and `image_url` are present
- collateral uses config Base USDC unless the operator explicitly provides another `collateral_address`

If any condition is missing, ask for it before submitting to Precog.

## Funding Policy

An agent may attempt `fund_market` only when:

- market creation has completed or the workflow is at the funding step
- Precog approval state is present with status `VALIDATED`
- the operator explicitly approves funding
- `amount`, `tx_hash`, `funder_address`, and `funder_signature` are specified
- `.forecastos/config.json` includes `precog.open_api_key`

Bankr, Privy, and Turnkey remain useful for resolving a ForecastOS funding intent into the transaction hash and EIP-712 signature outside ForecastOS. ForecastOS only submits the approved signed funding payload to Precog. The submitted `amount` must be a plain display-unit amount string such as `"1"`; do not submit wei/base-unit conversions, token symbols, commas, or exponent notation.

Do not fund when Precog status is only `CREATED`. Funding becomes valid at `VALIDATED`.

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

ForecastOS may store public addresses, transaction hashes, and signatures needed for Precog submission. It must not generate signatures, fetch nonces, or request signing secrets.
