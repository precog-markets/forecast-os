# Read-Only MCP

The ForecastOS MCP server is optional read-only context and inspection infrastructure. It is intentionally not the action surface, and the ForecastOS skill must still work when MCP is ignored or not built.

In the full ForecastOS repo, MCP is bundled at `mcp/forecast-os-mcp-server` and host-specific config examples live under `adapters/hosts/`. The skill remains the agent onboarding layer; MCP remains read-only; execution stays in `scripts/forecastos_action.mjs`, a future ForecastOS SDK/API, or trusted wallet/action tooling.

## Local Config

From an adapter folder such as `adapters/hosts/codex`, use:

```json
{
  "servers": {
    "forecastos": {
      "command": "node",
      "args": ["../../../mcp/forecast-os-mcp-server/dist/stdio.js"],
      "env": {
        "FORECASTOS_STATE_DIR": "../../../skill/forecast-os/.forecastos"
      }
    }
  }
}
```

Build the bundled MCP server before local MCP use:

```txt
cd mcp/forecast-os-mcp-server
npm install
npm run build
```

Codex can use `adapters/hosts/codex/mcp.json`. Claude, OpenClaw, and other MCP-capable agents should use the same command and args pattern from their adapter folder.

## Resources

- `forecastos://docs/skill`
- `forecastos://docs/architecture`
- `forecastos://docs/workflow`
- `forecastos://docs/safety`
- `forecastos://docs/memory`
- `forecastos://docs/mcp`
- `forecastos://docs/install`
- `forecastos://docs/actions`
- `forecastos://docs/action-policy`
- `forecastos://docs/tool-schemas`
- `forecastos://docs/remote-mcp`
- `forecastos://docs/external-markets`
- `forecastos://docs/providers/polymarket-read`
- `forecastos://docs/providers/kalshi-read`
- `forecastos://templates/multi-outcome-market`
- `forecastos://schemas/actions`
- `forecastos://examples/agent-launch`
- `forecastos://examples/funding-handoff`
- `forecastos://examples/full-workflow`
- `forecastos://precog/capabilities`
- `forecastos://precog/config-defaults`
- `forecastos://providers/polymarket/capabilities`
- `forecastos://providers/kalshi/capabilities`

## Tools

- `forecastos_list_resources`
- `forecastos_get_resource`
- `forecastos_get_schema`
- `forecastos_get_template`
- `forecastos_validate_market_shape`
- `forecastos_explain_next_step`
- `forecastos_get_precog_capabilities`
- `forecastos_get_config_defaults`
- `forecastos_search_markets`
- `forecastos_get_market`
- `forecastos_get_market_prices`
- `forecastos_get_market_orderbook`

These are read-only inspection tools. If an agent needs to execute, route through `scripts/forecastos_action.mjs`.

## Boundaries

Remote hosted MCP can later provide shared current docs, templates, schemas, examples, Precog capability metadata, and read-only market inspection. It is not required for V1. Do not add mutating MCP tools for market creation, funding, signing, token approval, swaps, wallet actions, or workflow mutation.
