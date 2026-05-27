# Wallet Adapters

Use wallet adapters when an operator chooses a concrete wallet/action provider for a ForecastOS create or funding handoff.

Provider-specific wallet code lives outside the portable skill:

```txt
adapters/wallets/<provider>/
```

The shared adapter contract lives at:

```txt
adapters/wallets/contract.md
```

## Create Flow

1. Draft and approve the market normally.
2. Run `prepare_create_intent` to generate the wallet-agnostic create payload and EIP-712 typed-data template.
3. Run the selected provider adapter under `adapters/wallets/<provider>/`.
4. Pass the adapter's `event` object to `run_skill_step` with the stored `create_market` workflow state.

The adapter output must contain `creator_address` and `creator_signature`, plus non-secret audit metadata. Do not ask users to paste raw signatures in chat.

When the same EVM wallet will create now and fund later, its policy should allow both `eth_signTypedData_v4` and `eth_sendTransaction` with tight chain, contract, and amount constraints. Provider adapters may refuse wallets missing either capability.

## Funding Flow

Funding adapters should consume `prepare_funding_intent` output and return a `funding_request` with `tx_hash`, `funder_address`, `funder_signature`, and the display-unit `amount`. Funding adapters must handle token approval outside ForecastOS when needed.

## Legacy Skill Shim

The portable skill may keep temporary compatibility shims for old script paths. New provider implementations should not be added under `skill/forecast-os/scripts/wallets/`; add them under `adapters/wallets/<provider>/` instead.
