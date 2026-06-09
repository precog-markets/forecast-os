# [Base MCP](https://mcp.base.org) Wallet Adapter

This adapter describes how a ForecastOS host, such as Codex, can use [Base MCP](https://mcp.base.org) as
the wallet/action layer while preserving ForecastOS workflow boundaries.

ForecastOS core supports Base (`8453`) and Arbitrum (`42161`) through config.
This adapter is intentionally Base-only.
When chain/collateral is missing, ForecastOS should ask first (`USDC on Base`
or `USDC on Arbitrum`) before selecting the wallet adapter.

Base custom plugins are markdown specs that teach an assistant how to combine
protocol-specific calls with [Base MCP](https://mcp.base.org) wallet tools. In ForecastOS terms, that
makes [Base MCP](https://mcp.base.org) complementary to host adapters:

```txt
Codex / Claude / Hermes / OpenClaw host adapter
  -> ForecastOS skill and optional read-only ForecastOS MCP
  -> Base MCP wallet adapter for wallet detection, signing, and send_calls
```

## Files

```txt
adapters/wallets/base-mcp/plugins/forecast-os.md
adapters/wallets/base-mcp/resolve_create.mjs
adapters/wallets/base-mcp/resolve_funding.mjs
```

Use that markdown file as the Base custom plugin spec when a host supports Base
MCP plugin instructions.

Use `resolve_funding.mjs` after `prepare_funding_intent` and after a Precog
funding transaction builder returns unsigned calldata:

```txt
node adapters/wallets/base-mcp/resolve_funding.mjs \
  --input <prepare-funding-intent-json> \
  --prepare-response <unsigned-calldata-json> \
  --wallet-address <base-mcp-wallet-address> \
  --nonce <pending-nonce>
```

The first run returns only the [Base MCP](https://mcp.base.org) `send_calls` payload. After Base MCP
returns `tx_hash`, fetch the wallet's new pending nonce and run the resolver again
with `--tx-hash` and `--nonce` to request the funding signature. Run it a final
time with `--funder-signature` to produce the standard ForecastOS `fund_market`
adapter output.

## Compatibility Model

- ForecastOS remains the workflow owner: draft, approval, create, funding
  submission, status polling, and prediction consumption still run through
  `skill/forecast-os/scripts/forecastos_action.mjs` or a future equivalent
  ForecastOS API/SDK.
- The host adapter remains responsible for making ForecastOS available in the
  user runtime. For example, Codex can use `adapters/hosts/codex/mcp.json`.
- [Base MCP](https://mcp.base.org) is the wallet/action adapter: complete `get_wallets` onboarding
  before wallet-dependent actions, use EIP-712 signing for Precog
  authorization when available, and use `send_calls` only for ordered unsigned
  EVM transaction batches.
- Base Account signatures may be smart-wallet signatures verified through
  EIP-1271, with ERC-6492 relevant before deployment. ForecastOS accepts those
  signature shapes for Precog creation and funding when the wallet signs the
  canonical Precog typed data with the correct current pending nonce.
- ForecastOS MCP remains read-only. Do not add mutating MCP tools for Base
  compatibility.

## Current Readiness

Creation is prepared as a [Base MCP](https://mcp.base.org) signing request. Base Account
smart-account/WebAuthn signatures are valid when Base MCP signs the canonical
Precog `CREATE_UPCOMING_MARKET` typed data with the current pending nonce.
Use `resolve_create.mjs` to generate the [Base MCP](https://mcp.base.org) signing request:

```txt
prepare_create_intent -> resolve_create.mjs -> Base MCP sign -> resolve_create.mjs --creator-signature ...
```

If Precog later rejects the submitted signature, compare the resolver typed data,
wallet account, nonce, and chain/domain fields against the non-secret diagnostic
attached to the ForecastOS error.

If the active ForecastOS chain is Arbitrum (`42161`), use a different configured
wallet/action adapter; Base MCP mappings in this folder are only for Base.

Funding is `send_calls`-compatible when the selected funding resolver returns an
unsigned calldata envelope or ordered transaction batch:

```json
{
  "chain": "base",
  "calls": [
    { "to": "0x...", "value": "0x0", "data": "0x..." }
  ]
}
```

This adapter validates and maps that prepared calldata into [Base MCP](https://mcp.base.org)'s canonical
`{ chain: "base", calls }` shape. It does not invent funding calldata. After Base MCP returns a transaction hash, fetch the wallet's post-transaction
pending nonce, request the funding signature, and submit both values to Precog.
The resolver accepts any hex Base Account signature because Precog verifies Base
Account signatures through EIP-1271/ERC-6492.
