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
- RPC access for the active create chain:
  - Base (`8453`) via `FORECASTOS_BASE_RPC_URL`, `BASE_RPC_URL`, `--rpc-url`, or the default `https://mainnet.base.org`
  - Arbitrum (`42161`) via `FORECASTOS_ARBITRUM_RPC_URL`, `ARBITRUM_RPC_URL`, `--rpc-url`, or the default `https://arb1.arbitrum.io/rpc`

## Policy Shape

For now, ForecastOS expects the selected [Privy](https://www.privy.io/ai) wallet to be usable for create and later funding. Attach constrained `ALLOW` rules for:

- `eth_signTypedData_v4` for Precog authorization signatures.
- `eth_sendTransaction` for future funding, token approval, trade submit, and share redeem (`marketRedeemShares`) transactions.

Keep transaction-send rules constrained to the active ForecastOS chain, currently Base (`8453`) or Arbitrum (`42161`), and prefer contract/amount constraints for USDC and Precog funding paths when those addresses are known. Avoid broad `method: "*"` policies unless the wallet is otherwise tightly governed.

Privy does **not** support `in` for typed-data `chainId` conditions. Use **one ALLOW rule per chain** on the same policy:

```json
{
  "name": "Allow EIP-712 typed data signing on Arbitrum",
  "method": "eth_signTypedData_v4",
  "action": "ALLOW",
  "conditions": [
    {
      "field_source": "ethereum_typed_data_domain",
      "field": "chainId",
      "operator": "eq",
      "value": "42161"
    }
  ]
}
```

Duplicate the rule with `"value": "8453"` for Base. The adapter preflights policy rules before signing and fails early with `PRIVY_POLICY_CHAIN_MISMATCH` when the target chain is missing.

## Patch Missing Chain

After operator approval, add a missing typed-data ALLOW rule with:

```txt
node adapters/wallets/privy/patch_forecastos_chain_policy.mjs \
  --wallet-id <privy-wallet-id> \
  --chain-id 8453 \
  --confirm
```

Copied skill / Hermes installs can use:

```txt
node scripts/patch-privy-chain-policy.mjs --wallet-id <id> --chain-id 8453 --confirm
```

The script requires `--confirm` and uses Privy's `POST /v1/policies/{policy_id}/rules` API with the ForecastOS rule shape above. Re-run `resolve_create.mjs` after patching; do not reuse wallet output from a different provider.

## Output

The adapter returns the standard create adapter shape from `adapters/wallets/contract.md`. Pass the adapter output file directly to `scripts/forecastos_action.mjs publish_approved_market` with the persisted `create_market` workflow id:

```txt
node skill/forecast-os/scripts/forecastos_action.mjs publish_approved_market \
  --input <workflow-id-json> \
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

A `PRIVY_POLICY_CHAIN_MISMATCH` error means the wallet policy has typed-data ALLOW rules, but none match the create intent chain. Read `chain_id`, `allowed_chain_ids`, and `guidance` from stderr; add or patch a chain-specific ALLOW rule instead of retrying other wallets.

A `PRIVY_POLICY_DENIED` error means Privy accepted the RPC shape but the selected
wallet policy blocked `eth_signTypedData_v4` at execution time (often after a preflight miss or a DENY rule). Read `chain_id` and `guidance` from stderr; update the wallet policy before retrying. If the same wallet will fund later, include
`eth_sendTransaction` in the policy too.
