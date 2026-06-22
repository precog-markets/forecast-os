# ForecastOS

ForecastOS is an agent kit for multi-outcome prediction-market workflows. It gives AI agents a compact skill for drafting and advancing market workflows, **trading outcome shares on deployed Precog markets**, and redeeming winning shares after resolution, plus an optional read-only MCP server for shared context, templates, schemas, examples, and Precog capability metadata.

The skill is the agent behavior contract. MCP is context infrastructure. Live execution stays in the ForecastOS action bridge and trusted wallet/action tooling.

## Repository Layout

```txt
forecast-os/
  skill/forecast-os/          # Installable skill artifact
  mcp/forecast-os-mcp-server/ # Optional read-only MCP server package
  adapters/                   # Host and wallet adapter examples
```

## Install The Skill

The portable skill lives in:

```txt
skill/forecast-os
```

To install from this repo into an agent host, copy or symlink the skill folder
into that host's skills directory. For Codex, the default user skills directory
is shown below.

macOS / Linux:

```txt
mkdir -p ~/.codex/skills
ln -s /path/to/forecast-os/skill/forecast-os ~/.codex/skills/forecast-os
```

Windows PowerShell:

```txt
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills"
New-Item -ItemType SymbolicLink `
  -Path "$env:USERPROFILE\.codex\skills\forecast-os" `
  -Target "C:\path\to\forecast-os\skill\forecast-os"
```

For a fixed install instead of live repo development, first generate the
detached skill version from the canonical root `VERSION`, then copy
`skill/forecast-os` to the same destination:

```txt
node skill/forecast-os/scripts/sync_version.mjs
```

After installing or updating the skill, reload or restart whichever agent host
will discover the skill so it refreshes skill metadata.

The skill also works without MCP. Agents can use `SKILL.md`, `references/`, `scripts/`, `assets/`, and `.forecastos/config.json` directly from the skill folder.

## Trade On Deployed Markets

With the ForecastOS skill installed, agents can help operators **buy, sell, and redeem** outcome shares on **already deployed** Precog markets on Base (and quote on Sepolia). Trading is operator-approved and wallet-mediated — the skill does not custody keys or sign transactions itself.

**What the skill covers**

- Discover open or resolved markets (read-only Precog API / MCP context)
- Quote buy/sell prices before any onchain step
- Prepare unsigned transactions for operator confirmation
- Hand off to a wallet adapter (Bankr, Privy, or Base MCP) for signing and submit
- Check positions and redeem winning shares 1:1 for market collateral after resolution

**Where the code lives**

| Layer | Path | Role |
|-------|------|------|
| Skill guide | `skill/forecast-os/references/precog-trading.md` | Agent flow and safety rules |
| Quote / prepare | `adapters/actions/precog/` | Read-only quotes; unsigned buy/sell/redeem calldata |
| Wallet submit | `adapters/wallets/{bankr,privy,base-mcp}/resolve_trade.mjs` | Sign and broadcast after approval |

**Typical buy flow**

```txt
cd adapters/actions/precog && npm install

node adapters/actions/precog/list_markets.mjs --chain-id 8453 --status OPEN
node adapters/actions/precog/quote.mjs --market <api-id> --outcome-label "..." --shares 2 --buy --chain-id 8453
# operator confirms
node adapters/actions/precog/prepare_buy.mjs --market <api-id> ... --wallet-address <0x...> --network mainnet > trade.json
node adapters/wallets/bankr/resolve_trade.mjs --input trade.json --api-key <bk_...>
```

**Redeem after resolution** (no quote step): `redeem_status.mjs` → `prepare_redeem.mjs` → `resolve_trade.mjs`. See `adapters/actions/precog/README.md` for sell, positions, and redeem commands.

MCP stays read-only for trading — use the skill plus `adapters/actions/precog/` and wallet adapters for live trades. One trade or redeem per explicit operator confirmation.

## Chain Support

ForecastOS chain selection is configuration-driven through `precog.chain_id` in
`skill/forecast-os/.forecastos/config.json` (or an override config). ForecastOS
core supports:

- Base (`8453`)
- Arbitrum (`42161`)

When chain/collateral is missing from user input, agents should ask clearly:
`With collateral from which chain?` and offer defaults:

- USDC on Base
- USDC on Arbitrum

If the user already specifies chain/collateral, agents should respect that
selection.

## Optional MCP Setup

The bundled MCP server is read-only and lives in:

```txt
mcp/forecast-os-mcp-server
```

Build it from the repo root:

```txt
cd mcp/forecast-os-mcp-server
npm install
npm run build
```

Codex can use:

```txt
adapters/hosts/codex/mcp.json
```

Claude, OpenClaw, and other MCP-capable runtimes can use the same command/args pattern shown in their adapter folders. Adapter paths are relative to the adapter folder.

## Safety Boundaries

ForecastOS MCP must remain read-only. It must not create markets, fund markets, sign messages, approve tokens, send transactions, swap assets, custody wallets, or mutate `.forecastos` workflow state.

Stateful workflow execution belongs in:

```txt
skill/forecast-os/scripts/forecastos_action.mjs
```

Wallet-specific signing, nonce lookup, token approval, and transaction submission belong in trusted wallet/action tooling after explicit operator approval.

## Development Checks

Validate the skill:

```txt
cd skill/forecast-os
node scripts/validate_skill.mjs
node --test test/forecast_os.test.js
```

Validate the MCP package:

```txt
cd mcp/forecast-os-mcp-server
npm run sync:resources
npm run check
```

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`:

```txt
npm.cmd run check
```

## Resource Sync

MCP resources are copied from the skill artifact at release time. After changing skill docs, templates, schemas, examples, or public config defaults, refresh MCP resources:

```txt
cd mcp/forecast-os-mcp-server
npm run sync:resources
```

The MCP package should be able to run from its own copied `resources/` directory. Runtime and Docker builds should not depend on reading the skill folder directly.

## Normal Workflow

```txt
intake -> draft -> needs_info / await_approval -> create_market
  -> await_precog_approval -> fund -> consume_prediction -> done
```

On deployed markets (separate from the create/fund workflow above), operators can quote, buy, sell, check positions, and redeem winning shares via the skill and `adapters/actions/precog/` — see **Trade On Deployed Markets**.

Agents should present short, friendly review summaries to users, ask for explicit approval before live actions, and avoid exposing raw workflow JSON unless the user asks for operator/debug detail.
