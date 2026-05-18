# Read-Only MCP

The bundled MCP server is a context and inspection surface. It is intentionally not the action surface.

## Config

```json
{
  "servers": {
    "forecastos": {
      "command": "node",
      "args": ["./mcp/server.js"],
      "env": {
        "FORECASTOS_STATE_DIR": ".forecastos"
      }
    }
  }
}
```

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
- `forecastos://assets/templates/multi-outcome-market`
- `forecastos://references/examples/agent-launch`
- `forecastos://references/examples/funding-handoff`
- `forecastos://references/examples/full-workflow`
- `forecastos://assets/schemas/actions`
- `forecastos://state/drafts`
- `forecastos://state/workflows/<status>`

## Tools

- `forecastos_list_resources`
- `forecastos_get_resource`
- `forecastos_list_workflows`
- `forecastos_get_workflow`
- `forecastos_list_drafts`
- `forecastos_get_draft`

These are read-only inspection tools. If an agent needs to execute, route through `scripts/forecastos_action.mjs`.
