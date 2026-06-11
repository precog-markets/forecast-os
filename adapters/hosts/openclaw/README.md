# OpenClaw MCP Adapter

Build the bundled MCP server first:

```txt
cd mcp/forecast-os-mcp-server
npm install
npm run build
```

Use the same command and args pattern from this adapter folder:

```json
{
  "command": "node",
  "args": ["../../../mcp/forecast-os-mcp-server/dist/stdio.js"],
  "env": {
    "FORECASTOS_STATE_DIR": "../../../skill/forecast-os/.forecastos"
  }
}
```

MCP is optional read-only context. ForecastOS workflow execution remains in `skill/forecast-os/scripts/forecastos_action.mjs`.

For operator-approved buy/sell on deployed Precog markets, use the generic trading
scripts in `adapters/actions/precog/` (not OpenClaw-specific).
