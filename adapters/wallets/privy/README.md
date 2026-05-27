# Privy Wallet Adapter

Resolves ForecastOS create intents with a Privy Ethereum wallet.

## Create

```txt
node adapters/wallets/privy/resolve_create.mjs --input <prepare-create-intent-json> --wallet-id <privy-wallet-id>
```

Use `--wallet-address <address>` instead of `--wallet-id` when the operator prefers address selection. If multiple typed-data-capable wallets match and no selector is provided, the adapter fails with a sanitized wallet list.

## Requirements

- `PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- A Privy Ethereum wallet policy allowing `eth_signTypedData_v4`
- Base RPC via `FORECASTOS_BASE_RPC_URL`, `BASE_RPC_URL`, `--rpc-url`, or the default `https://mainnet.base.org`

## Output

The adapter returns the standard create adapter shape from `adapters/wallets/contract.md`. Pass its `event` object to `scripts/forecastos_action.mjs run_skill_step` with the stored `create_market` workflow state.

The adapter converts ForecastOS canonical EIP-712 `primaryType` into Privy's required `primary_type` and does not include `caip2` in the Privy signing request.
