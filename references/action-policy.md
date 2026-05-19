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
- live Bankr/LiFi calls

## Creation Policy

An agent may attempt `create_market` only when:

- a draft exists
- the draft has no blocking issues
- the human has provided explicit approval
- the approval text matches the current draft ID and hash
- the bundled ForecastOS runtime or a trusted replacement module is configured
- `.forecastos/config.json` includes `precog.open_api_key`
- operator-provided `creator_address` and `creator_signature` are present

If any condition is missing, ask for it before submitting to Precog.

## Funding Policy

An agent may attempt `fund_market` only when:

- market creation has completed or the workflow is at the funding step
- Precog approval state is present when required
- the operator explicitly approves funding
- `amount`, `tx_hash`, `funder_address`, and `funder_signature` are specified
- `.forecastos/config.json` includes `precog.open_api_key`

Bankr and LiFi remain useful for creating the funding transaction and signature outside ForecastOS. ForecastOS only submits the approved signed funding payload to Precog.

## Prediction Consumption Policy

An agent may attempt `consume_prediction` only when:

- the workflow has reached `consume_prediction`
- a market ID is present
- the prediction source/API is configured by the host project

If a live market data API is not configured, return a TODO/mock result rather than inventing probabilities.

## Wallet Policy

Do not request or store:

- private keys
- seed phrases
- raw signing credentials
- custody credentials

Use operator wallet references only, such as a label or account ID controlled outside this skill.

ForecastOS may store public addresses, transaction hashes, and signatures needed for Precog submission. It must not generate signatures or request signing secrets.
