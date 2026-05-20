# Architecture

ForecastOS should be packaged as a bounded agent skill, not an AutoGPT-style autonomous agent.

```txt
Host agent / orchestrator
  -> ForecastOS skill
  -> read-only MCP context
  -> bundled CLI/runtime deterministic action bridge
  -> local structured state
  -> external adapters configured by the host project
```

## Layer Responsibilities

- Host agent: plans, routes, asks the human for missing info, and explains results.
- Skill folder: gives an agent procedural knowledge and reusable resources.
- MCP server: exposes read-only docs/templates/examples/local state.
- CLI/runtime action bridge: runs bundled deterministic ForecastOS methods and can later be replaced by a trusted production module.
- State store: persists drafts and workflow status in `.forecastos/`.
- External adapters: Precog, Bankr, Privy, Turnkey, manual wallet flows, and prediction APIs remain host-configured replacement points.

## Why This Shape

This follows the practical agent-skill pattern: keep the always-loaded description strong, keep `SKILL.md` lean, move details into references, and make repetitive local checks executable scripts.

## Production Direction

ForecastOS should remain framework-neutral. LangGraph, Mastra, Aeon, Hermes, hosted agent runtimes, or custom agents can all use this package without ForecastOS becoming the orchestrator.
