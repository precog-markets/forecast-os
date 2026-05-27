# ForecastOS Wallet Adapter Contract

Wallet adapters resolve ForecastOS wallet-agnostic intents into the signed fields needed by the action bridge. They live outside the portable skill under `adapters/wallets/<provider>/`.

## Boundaries

- Adapters may select configured wallets, fetch nonces, request wallet signatures, and return signed fields.
- Adapters must not print secrets, private keys, seed phrases, raw credential values, or unlimited approvals.
- Adapters must return only non-secret audit metadata: provider, wallet id/address, chain id, nonce, method, and policy ids.
- ForecastOS remains the workflow owner: adapters do not mutate `.forecastos` state directly.

## Create Intent Output

Create adapters consume the result of `prepare_create_intent` and return:

```json
{
  "event": {
    "image_url": "https://example.com/image.png",
    "category": "AI",
    "creator_address": "0x...",
    "creator_signature": "0x...",
    "wallet_provider": "provider-name",
    "wallet_audit": {
      "provider": "provider-name",
      "wallet_id": "wallet-ref",
      "wallet_address": "0x...",
      "policy_ids": ["policy-ref"],
      "chain_id": 8453,
      "nonce": 0,
      "method": "eth_signTypedData_v4"
    }
  },
  "next_action": "run_skill_step"
}
```

Pass `event` back to `scripts/forecastos_action.mjs run_skill_step` with the stored `create_market` workflow state. This lets ForecastOS submit the create request and advance to `await_precog_approval`.

## Funding Intent Output

Funding adapters are not implemented yet, but they should consume `prepare_funding_intent` output and return:

```json
{
  "funding_request": {
    "upcoming_market": 123,
    "amount": "1",
    "tx_hash": "0x...",
    "funder_address": "0x...",
    "funder_signature": "0x..."
  },
  "wallet_audit": {
    "provider": "provider-name",
    "wallet_id": "wallet-ref",
    "wallet_address": "0x...",
    "policy_ids": ["policy-ref"],
    "chain_id": 8453,
    "nonce": 0,
    "method": "eth_signTypedData_v4"
  },
  "next_action": "fund_market"
}
```

Funding adapters must handle collateral allowance and token approval outside ForecastOS when needed, then return the signed fields for an operator-approved `fund_market` action.
