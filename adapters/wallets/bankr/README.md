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

It returns an `event` object for the ForecastOS publish step.
This Bankr adapter currently accepts only EOA-style 65-byte EIP-712 signatures
from Bankr Wallet API responses. That is a Bankr adapter constraint, not a
generic Precog or ForecastOS rule; other adapters such as Base MCP may return
smart-account/WebAuthn signature envelopes.

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
