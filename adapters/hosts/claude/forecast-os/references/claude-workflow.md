# Claude ForecastOS Workflow

This is the Claude-facing ForecastOS skill export. It keeps Claude host setup
separate from wallet/action providers.

This package assumes access to the full ForecastOS repo/runtime or an installed
equivalent. The action bridge, bundled config, MCP server build, and wallet
adapters are provided by that runtime, not by this host export folder alone.

## Claude Code MCP

ForecastOS MCP is optional read-only context. Use it for docs, templates,
schemas, examples, Precog capability metadata, public market search, and
workflow inspection. Do not use MCP for live creation, funding, signing, token
approval, transaction submission, or workflow mutation.

Project-scoped Claude Code MCP config uses a project-root `.mcp.json` with
`mcpServers`. The ForecastOS template lives at:

```txt
adapters/hosts/claude/.mcp.json
```

Claude Code prompts for approval before using project-scoped MCP servers from
`.mcp.json`.

## Execution

Run live workflow steps through the ForecastOS action bridge:

```txt
node skill/forecast-os/scripts/forecastos_action.mjs <action> --input <json-file>
```

Common actions:

- `run_skill_step`
- `prepare_create_intent`
- `await_precog_approval`
- `prepare_funding_intent`
- `fund_market`
- `consume_prediction`

## Boundaries

- Claude host adapter: loads the skill and optional read-only MCP context.
- ForecastOS action bridge: advances approved workflow steps.
- Wallet adapters: resolve signing, nonce, token approval, and transaction
  fields outside ForecastOS.

Keep those boundaries separate so Claude does not confuse host setup with wallet
execution.
