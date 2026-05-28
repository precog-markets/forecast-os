# [Base MCP](https://mcp.base.org) Wallet Adapter

This adapter describes how a ForecastOS host, such as Codex, can use [Base MCP](https://mcp.base.org) as
the wallet/action layer while preserving ForecastOS workflow boundaries.

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

The first run returns the [Base MCP](https://mcp.base.org) `sign` and `send_calls` payloads. Run it again
with `--funder-signature` and `--tx-hash` after [Base MCP](https://mcp.base.org) completes to produce
the standard ForecastOS `fund_market` adapter output.

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
- ForecastOS MCP remains read-only. Do not add mutating MCP tools for Base
  compatibility.

## Current Readiness

Creation can be prepared as a [Base MCP](https://mcp.base.org) signing request, but the current Precog
create endpoint requires an EOA-style 65-byte EIP-712 signature. Base Account
smart-account/WebAuthn signatures are not accepted for Precog creation yet.
Use `resolve_create.mjs` to generate the [Base MCP](https://mcp.base.org) signing request and to fail
early if the returned signature is not compatible:

```txt
prepare_create_intent -> resolve_create.mjs -> Base MCP sign -> resolve_create.mjs --creator-signature ...
```

If `resolve_create.mjs` returns `BASE_MCP_CREATE_SIGNATURE_UNSUPPORTED`, use
[Privy](https://www.privy.io/ai), another EOA-compatible wallet/action tool, or the Precog creation area
instead of submitting the smart-account signature to ForecastOS.

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
`{ chain: "base", calls }` shape. It does not invent funding calldata.
