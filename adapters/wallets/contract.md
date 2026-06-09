# ForecastOS Wallet Adapter Contract

Wallet adapters resolve ForecastOS wallet-agnostic intents into the signed fields needed by the action bridge. They live outside the portable skill under `adapters/wallets/<provider>/`.

ForecastOS core supports Base (`8453`) and Arbitrum (`42161`) through config.
Each provider adapter must explicitly document supported chains and fail fast on
unsupported chain IDs.
If chain/collateral is missing in user input, core ForecastOS UX asks first and
offers `USDC on Base` or `USDC on Arbitrum` before adapter selection.

## Boundaries

- Adapters may select configured wallets, fetch nonces, request wallet signatures, and return signed fields.
- Adapters must not print secrets, private keys, seed phrases, raw credential values, or unlimited approvals.
- Adapters must return only non-secret audit metadata: provider, wallet id/address, chain id, nonce, method, and policy ids.
- ForecastOS remains the workflow owner: adapters do not mutate `.forecastos` state directly.
- EVM wallet policies should allow both typed-data signing and transaction sending when the same wallet is expected to create now and fund later. Prefer constrained `ALLOW` rules for `eth_signTypedData_v4` and `eth_sendTransaction` over broad `*` rules.

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
      "method": "eth_signTypedData_v4",
      "signature_compatibility": "provider-specific"
    }
  },
  "next_action": "publish_approved_market"
}
```

Pass the adapter output file to `scripts/forecastos_action.mjs publish_approved_market` with the persisted `workflow_id`. This lets ForecastOS load the stored `create_market` workflow, submit the create request, and advance to `await_precog_approval`. Provider methods vary: Privy may use `eth_signTypedData_v4`, while Base MCP uses `sign` and may return Base Account smart-wallet signatures marked with `signature_compatibility`.

## Funding Intent Output

Funding adapters consume `prepare_funding_intent` output and return:

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
