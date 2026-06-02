# Bankr ForecastOS Workflow

This package is the Bankr-facing skill export. The full ForecastOS source repo
contains the runtime and wallet adapters; this skill tells a Bankr-capable agent
how to use those pieces safely.

Use this folder with the ForecastOS repo/runtime or an installed equivalent that
provides the action bridge, bundled config, and `adapters/wallets/bankr/`.

## Create Flow

1. Generate and approve a ForecastOS draft.
2. Generate `prepare_create_intent`.
3. Resolve the intent through `adapters/wallets/bankr/resolve_create.mjs`.
4. Pass the returned `event` to `run_skill_step` for the current create state.
5. Return the generated `https://core.precog.markets/launchpad/{chainId}/{marketId}/{slug}` link and schedule the returned `pending_check` command hourly.

The Bankr create adapter calls `GET /wallet/me` and `POST /wallet/sign` with
`signatureType: "eth_signTypedData_v4"`. The current Precog create endpoint
requires an EOA-style 65-byte EIP-712 signature.

## Pending Checks

Run a one-shot pending check for each market waiting on Precog approval.
Schedule `check_pending_market.mjs --auto-redraft` hourly outside ForecastOS.
Treat `VALIDATED` as ready to fund and `REJECTED`, `FAILED`, or `DENIED` as
terminal. On rejection, preserve validator feedback and create a linked
replacement draft for user approval; do not auto-submit a replacement market.

## Funding Flow

1. Confirm Precog status is `VALIDATED`.
2. Ask for explicit user approval to fund.
3. Generate `prepare_funding_intent`.
4. Obtain a trusted unsigned funding transaction envelope or transaction batch.
5. Resolve through `adapters/wallets/bankr/resolve_funding.mjs`.
6. Submit the returned `funding_request` with `fund_market`.

The Bankr funding adapter calls `POST /wallet/sign` for the ForecastOS funding
authorization and `POST /wallet/submit` for each prepared transaction in order.
The final transaction hash is used as the Precog `tx_hash`.

## Safety

- Bankr is the wallet/action provider, not the market venue.
- ForecastOS drafts, approves, creates, funds, polls, and consumes Precog state.
- Never ask for raw signing credentials in chat.
- Never ask Bankr to invent funding calldata.
- Keep funding amounts as display-unit decimals such as `"1"` or `"10.5"`.
