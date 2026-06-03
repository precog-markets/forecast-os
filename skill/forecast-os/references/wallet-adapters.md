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
calldata envelope or ordered transaction batch into Base MCP `send_calls`. It must
not invent funding calldata; a Precog funding transaction builder or another
trusted resolver must provide the unsigned call data first. After `send_calls`
returns a transaction hash, fetch the wallet's post-transaction pending nonce
and sign `FUND_UPCOMING_MARKET` before submitting `fund_market` to Precog. Base
Account smart-wallet signatures are verified through EIP-1271, with ERC-6492
relevant before deployment; ForecastOS accepts those Base MCP signature shapes
for creation and funding when signed over canonical Precog typed data.

For creation, [Base MCP](https://mcp.base.org) prepares a typed-data signing request. Base Account
smart-wallet/WebAuthn signatures are valid when they are verified through
EIP-1271/ERC-6492 and signed over the canonical `CREATE_UPCOMING_MARKET` typed
data with the current pending nonce.

The shared adapter contract lives at:

```txt
adapters/wallets/contract.md
```

## Adapter Contract

Wallet adapters consume ForecastOS intent JSON and return resolved wallet/action output JSON. They must not draft markets, choose venues, modify `.forecastos/` directly, or submit Precog API calls unless explicitly documented as a separate trusted action bridge step.

### Create Adapter Input

Input is the output of `prepare_create_intent` plus any provider configuration the operator has already approved:

```json
{
  "intent_type": "forecastos.create_market",
  "eip712_typed_data_template": {
    "domain": { "name": "Precog Markets", "version": "1" },
    "primaryType": "PrecogMarketAuthorization",
    "message": {
      "action": "CREATE_UPCOMING_MARKET",
      "account": "<creator_address>",
      "nonce": "<next_pending_nonce>"
    }
  },
  "precog_payload_template": {
    "question": "...",
    "outcomes": "A,B,C",
    "chain_id": 8453,
    "creator_address": "<wallet_address>",
    "creator_signature": "<wallet_signature>"
  }
}
```

### Create Adapter Output

Output must be safe to merge into `publish_approved_market` or `run_skill_step`:

```json
{
  "event": {
    "creator_address": "0xChecksumAddress",
    "creator_signature": "0xSignature",
    "wallet_provider": "provider-name",
    "wallet_audit": {
      "provider": "provider-name",
      "nonce": 123,
      "signature_method": "eip712_typed_data"
    }
  }
}
```

The adapter must make `creator_address` identical to the EIP-712 `message.account` used for signing.

### Funding Adapter Input

Input is the output of `prepare_funding_intent`. The adapter may also require an unsigned funding transaction envelope prepared by a trusted transaction builder.

### Funding Adapter Output

Output must be safe to pass as `funding_request`:

```json
{
  "funding_request": {
    "amount": "1",
    "tx_hash": "0xTransactionHash",
    "funder_address": "0xChecksumAddress",
    "funder_signature": "0xSignature",
    "wallet_provider": "provider-name",
    "wallet_audit": {
      "provider": "provider-name",
      "nonce": 124,
      "token_approval_performed": true
    }
  }
}
```

`amount` must stay in Precog display units such as `"1"` or `"100.5"`. Do not return wei/base units or token symbols.

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

The adapter output must contain `creator_address` and `creator_signature`, plus non-secret audit metadata. The adapter must checksum the EVM address before signing so `creator_address` and the EIP-712 `message.account` are identical EIP-55 strings. Do not ask users to paste raw signatures in chat.

When the same EVM wallet will create now and fund later, its policy should allow both `eth_signTypedData_v4` and `eth_sendTransaction` with tight chain, contract, and amount constraints. Provider adapters may refuse wallets missing either capability.

Bankr create follows the shared adapter contract. Keep endpoint details in
`adapters/wallets/bankr/README.md`.

Privy create must go through the canonical Privy adapter. Do not reconstruct the
Privy wallet RPC request in host-specific code. The adapter sends
`method: "eth_signTypedData_v4"`, omits `caip2`, keeps `params` to exactly
`{ "typed_data": ... }`, and converts ForecastOS `primaryType` to Privy's
`primary_type`. If Privy returns a strict schema error, treat it as an adapter
regression. If it returns `PRIVY_POLICY_DENIED` or “RPC request denied due to
policy violation,” ask the operator to update the selected wallet policy to
allow `eth_signTypedData_v4`; include `eth_sendTransaction` too if the wallet
will later fund the market.

## Funding Flow

Funding adapters should consume `prepare_funding_intent` output and return a `funding_request` with `tx_hash`, `funder_address`, `funder_signature`, and the display-unit `amount`. Funding adapters must handle token approval outside ForecastOS when needed.

Base MCP funding intentionally accepts any hex EIP-712 signature returned by Base
Account, including smart-wallet/WebAuthn signatures. Run the prepared funding
`send_calls` first, then sign `FUND_UPCOMING_MARKET` with the post-transaction
pending nonce before submitting `fund_market` to Precog.

Bankr funding follows the shared adapter contract and must not invent funding
calldata. Keep endpoint details in `adapters/wallets/bankr/README.md`.

## Legacy Skill Shim

The portable skill may keep temporary compatibility shims for old script paths. New provider implementations should not be added under `skill/forecast-os/scripts/wallets/`; add them under `adapters/wallets/<provider>/` instead.
