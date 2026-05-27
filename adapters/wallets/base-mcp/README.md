# Base MCP Wallet Adapter

This adapter describes how a ForecastOS host, such as Codex, can use Base MCP as
the wallet/action layer while preserving ForecastOS workflow boundaries.

Base custom plugins are markdown specs that teach an assistant how to combine
protocol-specific calls with Base MCP wallet tools. In ForecastOS terms, that
makes Base MCP complementary to host adapters:

```txt
Codex / Claude / Hermes / OpenClaw host adapter
  -> ForecastOS skill and optional read-only ForecastOS MCP
  -> Base MCP wallet adapter for wallet detection, signing, and send_calls
```

## Files

```txt
adapters/wallets/base-mcp/plugins/forecast-os.md
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

The first run returns the Base MCP `sign` and `send_calls` payloads. Run it again
with `--funder-signature` and `--tx-hash` after Base MCP completes to produce
the standard ForecastOS `fund_market` adapter output.

## Compatibility Model

- ForecastOS remains the workflow owner: draft, approval, create, funding
  submission, status polling, and prediction consumption still run through
  `skill/forecast-os/scripts/forecastos_action.mjs` or a future equivalent
  ForecastOS API/SDK.
- The host adapter remains responsible for making ForecastOS available in the
  user runtime. For example, Codex can use `adapters/hosts/codex/mcp.json`.
- Base MCP is the wallet/action adapter: complete `get_wallets` onboarding
  before wallet-dependent actions, use EIP-712 signing for Precog
  authorization when available, and use `send_calls` only for ordered unsigned
  EVM transaction batches.
- ForecastOS MCP remains read-only. Do not add mutating MCP tools for Base
  compatibility.

## Current Readiness

Creation can be described today as a Base MCP wallet flow if the host exposes a
Base MCP signing tool compatible with ForecastOS EIP-712 typed data:

```txt
prepare_create_intent -> Base MCP sign -> run_skill_step/create_market
```

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

This adapter validates and maps that prepared calldata into Base MCP's canonical
`{ chain: "base", calls }` shape. It does not invent funding calldata.
