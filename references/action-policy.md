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

If any condition is missing, ask for the missing condition or return the TODO/unavailable result.

## Funding Policy

An agent may attempt `fund_market` only when:

- market creation has completed or the workflow is at the funding step
- Precog approval state is present when required
- the operator explicitly approves funding
- provider, amount, and asset are specified
- a trusted funding adapter is configured by the host project

Bankr and LiFi are provider hints in this package, not live built-in integrations.

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
