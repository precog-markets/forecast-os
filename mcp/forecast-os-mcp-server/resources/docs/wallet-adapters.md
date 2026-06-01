# Wallet Adapters

Use wallet adapters when an operator chooses a concrete wallet/action provider for a ForecastOS Precog create or funding handoff. Wallet adapters do not choose the market venue; they only resolve signing/action fields for Precog payloads.

Provider-specific wallet code lives outside the portable skill:

```txt
adapters/wallets/<provider>/
```

[Base MCP](https://mcp.base.org) integration is complementary to host
adapters such as Codex, Claude, Hermes, or OpenClaw. See:

```txt
adapters/wallets/base-mcp/
```

[Bankr](https://bankr.bot) integration is a concrete wallet/action provider for
ForecastOS create and funding handoffs. See:

```txt
adapters/wallets/bankr/
```

The [Base MCP](https://mcp.base.org) adapter includes a funding resolver that maps an explicit unsigned
calldata envelope or ordered transaction batch into Base MCP `send_calls`, then
returns the standard `fund_market` adapter output after [Base MCP](https://mcp.base.org) supplies the
transaction hash and EIP-712 funding signature. It must not invent funding
calldata; a Precog funding transaction builder or another trusted resolver must
provide the unsigned call data first. Base Account smart-wallet signatures are
verified through EIP-1271, with ERC-6492 relevant before deployment; ForecastOS
accepts those Base MCP signature shapes for funding.

For creation, [Base MCP](https://mcp.base.org) can prepare a typed-data signing request, but current
Base Account smart-account/WebAuthn signatures are not accepted by the Precog
create endpoint. Use [Base MCP](https://mcp.base.org) for creation only if the signer returns a 65-byte
EOA EIP-712 signature; otherwise use [Privy](https://www.privy.io/ai), another EOA-compatible wallet/action
tool, or the Precog creation area.

The shared adapter contract lives at:

```txt
adapters/wallets/contract.md
```

## Create Flow

1. Draft and approve the market normally.
2. Run `prepare_create_intent` to generate the wallet-agnostic Precog create payload and EIP-712 typed-data template.
3. Run the selected provider adapter under `adapters/wallets/<provider>/`.
4. Pass the adapter's `event` object to `run_skill_step` with the stored `create_market` workflow state.

Prefer passing the adapter output file directly to the action bridge:

```txt
node scripts/forecastos_action.mjs run_skill_step \
  --input <create-market-step-json> \
  --wallet-output <wallet-adapter-output-json>
```

This avoids shell environment mistakes where a signature is assigned to a local
variable but not exported to the command that builds the create input.

The adapter output must contain `creator_address` and `creator_signature`, plus non-secret audit metadata. Do not ask users to paste raw signatures in chat.

When the same EVM wallet will create now and fund later, its policy should allow both `eth_signTypedData_v4` and `eth_sendTransaction` with tight chain, contract, and amount constraints. Provider adapters may refuse wallets missing either capability.

Bankr create follows the shared adapter contract. Keep endpoint details in
`adapters/wallets/bankr/README.md`.

## Funding Flow

Funding adapters should consume `prepare_funding_intent` output and return a `funding_request` with `tx_hash`, `funder_address`, `funder_signature`, and the display-unit `amount`. Funding adapters must handle token approval outside ForecastOS when needed.

Base MCP funding intentionally accepts any hex EIP-712 signature returned by Base
Account, including non-65-byte smart-wallet/WebAuthn signatures. Do not apply
the creation-path EOA signature restriction to funding unless Precog funding
backend support changes.

Bankr funding follows the shared adapter contract and must not invent funding
calldata. Keep endpoint details in `adapters/wallets/bankr/README.md`.

## Legacy Skill Shim

The portable skill may keep temporary compatibility shims for old script paths. New provider implementations should not be added under `skill/forecast-os/scripts/wallets/`; add them under `adapters/wallets/<provider>/` instead.
