# ForecastOS MCP

The bundled ForecastOS MCP server lives at:

```txt
mcp/forecast-os-mcp-server
```

Build it from the repo root with:

```txt
cd mcp/forecast-os-mcp-server
npm install
npm run build
```

Host adapter examples live in:

```txt
adapters/
```

MCP is optional and read-only. ForecastOS workflow execution remains in `skill/forecast-os/scripts/forecastos_action.mjs`.