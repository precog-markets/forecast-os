# Remote Hosted MCP

Use this only for future or advanced infrastructure planning. The production skill path should not depend on hosted MCP.

Use a hybrid architecture:

- `skill/forecast-os`: agent onboarding, UX rules, safety boundaries, local scripts, and `.forecastos/` memory.
- Bundled local MCP: optional read-only stdio context from `mcp/forecast-os-mcp-server`.
- Host adapters: config examples in `adapters/` for Codex, Claude, OpenClaw, and other MCP-capable agents.
- Remote MCP: future shared current context and inspection for docs, templates, schemas, examples, Precog capabilities, and read-only market data.
- Action bridge or SDK/API: bounded execution for create/status/fund/consume.
- Wallet/action tooling: EIP-712 signing, nonce lookup, token approval, funding transactions, and signatures.

Remote MCP V1 should stay read-only. It may expose:

- `forecastos://docs/*`
- `forecastos://templates/multi-outcome-market`
- `forecastos://schemas/actions`
- `forecastos://examples/*`
- `forecastos://precog/capabilities`
- `forecastos://precog/config-defaults`
- read-only market/upcoming-market inspection after auth policy is settled

Remote MCP V1 must not expose live mutation tools such as market creation, funding, signing, token approval, swaps, or wallet-provider-specific flows.

Agents should use the skill first. The skill can then use local MCP for offline context or remote MCP for fresher shared context when that context is useful. The final user-facing response should still be a short draft summary and next-step prompt, not raw MCP or action JSON.

Canonical local MCP package:

```txt
mcp/forecast-os-mcp-server
```

Build it locally with:

```txt
cd mcp/forecast-os-mcp-server
npm install
npm run build
```

The skill and MCP package are distributed from the same ForecastOS repo. Remote hosted MCP remains optional infrastructure, not a required dependency for plug-and-play agent use.