---
name: forecast_os
description: Use ForecastOS for agent-native multi-outcome prediction-market workflows, .forecastos state inspection, read-only MCP context, bundled CLI/runtime actions, human-approved market creation, Precog TODOs, Bankr/LiFi funding handoff TODOs, and forecast consumption planning. Assumes multi_outcome markets, keeps MCP read-only, and avoids live funding/signing.
---

# ForecastOS Skill

Use this skill as the ForecastOS package for agent runtimes: concise trigger metadata, progressive disclosure, optional platform metadata in `agents/metadata.yaml`, and deterministic scripts only where they reduce repeated work.

## Operating Model

Keep the split crisp:

- `SKILL.md`: when to use ForecastOS and which bundled resource to read next.
- `agents/metadata.yaml`: optional platform UI metadata and invocation policy.
- `references/`: architecture, workflow, safety, MCP, actions, examples, and tool schemas.
- `assets/`: reusable templates and machine-readable schemas.
- `scripts/`: deterministic local helpers.
- `mcp/`: read-only context and state inspection.

## Boundaries

MCP is read-only. It can expose docs, templates, examples, drafts, and workflow state, but it should not draft, create, run workflow steps, fund, sign, swap, or call live Precog APIs.

Execution belongs to the bundled CLI/runtime action bridge. Read `references/actions.md` before using `scripts/forecastos_action.mjs`.

## Workflow

```txt
intake -> draft -> needs_info / await_approval -> create_market
  -> await_precog_approval -> fund -> consume_prediction -> done
```

Human approval is required before creation. Operator approval is required before funding. Multi-outcome markets require explicit outcome labels.

Assume every ForecastOS market is `multi_outcome`. For yes/no-looking ideas, still model the market as multi-outcome with explicit labels such as `Yes` and `No`, and add an invalid/ambiguous outcome only when the resolution source genuinely needs it.

## Progressive Disclosure

Read only what the task needs:

- `references/architecture.md`: layered skill/MCP/runtime/state design.
- `references/workflow.md`: workflow graph and `.forecastos/` folders.
- `references/safety.md`: trust boundaries and guardrails.
- `references/memory.md`: `.forecastos` persistent structured memory.
- `references/mcp.md`: read-only MCP resources and tools.
- `references/install.md`: install, state-dir, validation, and local-use notes.
- `references/actions.md`: bundled CLI/runtime execution bridge.
- `references/action-policy.md`: creation, funding, wallet, and prediction action rules.
- `references/tool-schemas.md`: action input shapes for CLI/runtime execution.
- `assets/templates/multi-outcome-market.md`: multi-outcome template.
- `references/examples/agent-launch.md`: agent survival market example.
- `references/examples/funding-handoff.md`: Bankr/LiFi funding handoff example.
- `references/examples/full-workflow.md`: end-to-end multi-outcome workflow example.
- `assets/schemas/actions.json`: machine-readable action input schema.

## Useful Commands

```txt
node scripts/validate_skill.mjs
node scripts/inspect_state.mjs
node scripts/render_review.mjs --workflow-id <workflow_id>
node scripts/next_step.mjs --workflow-id <workflow_id>
node scripts/forecastos_action.mjs <action> --input <json-file>
node mcp/server.js
```

By default it uses the bundled `scripts/forecastos_runtime.mjs`; `FORECASTOS_SDK_MODULE` is only an override for future production adapters.
