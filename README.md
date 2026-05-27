# ForecastOS

ForecastOS is an agent kit for human-approved multi-outcome prediction-market workflows. It gives AI agents a compact skill for drafting and advancing market workflows, plus an optional read-only MCP server for shared context, templates, schemas, examples, and Precog capability metadata.

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

To install it for Codex, copy or sync that folder to:

```txt
C:\Users\<you>\.codex\skills\forecast-os
```

After installing or updating the skill, restart Codex so it reloads skill metadata.

The skill also works without MCP. Agents can use `SKILL.md`, `references/`, `scripts/`, `assets/`, and `.forecastos/config.json` directly from the skill folder.

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

Agents should present short, friendly review summaries to users, ask for explicit approval before live actions, and avoid exposing raw workflow JSON unless the user asks for operator/debug detail.
