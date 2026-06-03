# [Privy](https://www.privy.io/ai) Wallet Adapter

Resolves ForecastOS create intents with a [Privy](https://www.privy.io/ai) Ethereum wallet.

## Create

```txt
node adapters/wallets/privy/resolve_create.mjs --input <prepare-create-intent-json> --wallet-id <privy-wallet-id>
```

Use `--wallet-address <address>` instead of `--wallet-id` when the operator prefers address selection. If multiple typed-data-capable wallets match and no selector is provided, the adapter fails with a sanitized wallet list.

## Requirements

- `PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- A [Privy](https://www.privy.io/ai) Ethereum wallet policy allowing both `eth_signTypedData_v4` and `eth_sendTransaction`
- Base RPC via `FORECASTOS_BASE_RPC_URL`, `BASE_RPC_URL`, `--rpc-url`, or the default `https://mainnet.base.org`

## Policy Shape

For now, ForecastOS expects the selected [Privy](https://www.privy.io/ai) wallet to be usable for create and later funding. Attach constrained `ALLOW` rules for:

- `eth_signTypedData_v4` for Precog authorization signatures.
- `eth_sendTransaction` for future funding, token approval, and submit transactions.

Keep the transaction-send rule Base-only (`chain_id = 8453`) and prefer contract/amount constraints for USDC and Precog funding paths when those addresses are known. Avoid broad `method: "*"` policies unless the wallet is otherwise tightly governed.

## Output

The adapter returns the standard create adapter shape from `adapters/wallets/contract.md`. Pass the adapter output file directly to `scripts/forecastos_action.mjs run_skill_step` with the stored `create_market` workflow state:

```txt
node skill/forecast-os/scripts/forecastos_action.mjs run_skill_step \
  --input <create-market-step-json> \
  --wallet-output <privy-resolve-create-output-json>
```

Prefer `--wallet-output` over shell variables so the signature cannot be dropped
by accidentally using an unexported environment value.

The adapter converts ForecastOS canonical EIP-712 `primaryType` into Privy's required `primary_type` and does not include `caip2` in the Privy signing request.

The Privy wallet RPC request is intentionally strict:

```json
{
  "method": "eth_signTypedData_v4",
  "params": {
    "typed_data": {
      "types": {},
      "primary_type": "PrecogMarketAuthorization",
      "domain": {},
      "message": {}
    }
  }
}
```

Do not send `primaryType` to Privy, do not add extra keys inside `params`, and do not add `caip2` unless Privy changes this endpoint contract.

## Troubleshooting

On failure, the adapter writes sanitized JSON to stderr. A
`PRIVY_API_REQUEST_FAILED` error with `status: 403` means the runtime credentials
cannot access the Privy API path shown in `endpoint`; confirm the local host has
the intended `PRIVY_APP_ID` and `PRIVY_APP_SECRET` configured without printing
their values in chat. A `PRIVY_WALLET_SELECTION_REQUIRED` error with
`wallet_diagnostics` means Privy was reachable but no selected wallet exposed
both required policy methods. Check `checked_wallets`, `allow_methods`, and
`policy_read_failures` to confirm the wallet id and attached policy.

A `PRIVY_POLICY_DENIED` error means Privy accepted the RPC shape but the selected
wallet policy blocked `eth_signTypedData_v4`. Ask the operator to update that
wallet policy before retrying; if the same wallet will fund later, include
`eth_sendTransaction` in the policy too.
