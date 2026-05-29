# Bankr Wallet Adapter

This adapter resolves ForecastOS wallet-agnostic Precog intents through the
Bankr Wallet API. ForecastOS remains the workflow owner; Bankr only supplies
wallet address, EIP-712 signatures, and raw transaction submission.

## Requirements

- A Bankr API key with Wallet API enabled.
- Write access for live creation/funding signing and transaction submission.
- User security settings that permit the intended Base transaction.
- Base chain support, currently `8453`.

## Create

```txt
node adapters/wallets/bankr/resolve_create.mjs \
  --input <prepare-create-intent-json> \
  --api-key <bk_...>
```

The adapter calls:

- `GET /wallet/me`
- `POST /wallet/sign` with `signatureType: "eth_signTypedData_v4"`

It returns an `event` object for `scripts/forecastos_action.mjs run_skill_step`.
Create signatures must be EOA-style 65-byte EIP-712 signatures because the
current Precog create endpoint requires that shape.

## Funding

```txt
node adapters/wallets/bankr/resolve_funding.mjs \
  --input <prepare-funding-intent-json> \
  --prepare-response <unsigned-calldata-json> \
  --api-key <bk_...>
```

The adapter calls:

- `GET /wallet/me`
- `POST /wallet/sign` for the ForecastOS funding authorization
- `POST /wallet/submit` once per prepared unsigned transaction

It does not invent funding calldata. A trusted Precog transaction builder or
wallet/action resolver must provide the unsigned transaction envelope first.
