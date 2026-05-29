# Claude Host Adapter

This adapter makes ForecastOS available to Claude Code as:

- a Claude-compatible skill package under `forecast-os/`
- optional read-only ForecastOS MCP context through `.mcp.json`

It does not add wallet signing, token approval, transaction submission, or
mutating MCP tools. Live ForecastOS execution remains in
`skill/forecast-os/scripts/forecastos_action.mjs`; wallet/action providers stay
under `adapters/wallets/`.

## Build MCP

```txt
cd mcp/forecast-os-mcp-server
npm install
npm run build
```

## Project-Scoped MCP

Claude Code project-scoped MCP config uses `.mcp.json` with `mcpServers`. Copy
`adapters/hosts/claude/.mcp.json` to the project root that Claude Code opens.

If the copied file is not at the ForecastOS repo root, set `FORECASTOS_REPO_ROOT`
to the absolute ForecastOS repo path before starting Claude Code.

Claude Code prompts for approval before using project-scoped MCP servers from
`.mcp.json`.

## CLI Setup

From the ForecastOS repo root, the same server can be added through Claude Code:

```txt
claude mcp add-json forecastos '{"command":"node","args":["mcp/forecast-os-mcp-server/dist/stdio.js"],"env":{"FORECASTOS_STATE_DIR":"skill/forecast-os/.forecastos"}}' --scope project
```

## Claude Skill Package

The Claude-compatible skill export is:

```txt
adapters/hosts/claude/forecast-os/
```

Use that folder as the Claude skill package when the runtime supports skills.
MCP is optional read-only context; the skill still explains the action bridge
path for draft, approval, create, pending checks, funding, and prediction
consumption.

This host package is not a standalone ForecastOS runtime. It requires the full
ForecastOS repo/runtime, or an installed equivalent that provides
`skill/forecast-os/scripts/forecastos_action.mjs`, bundled config, and the
selected wallet/action adapters.
