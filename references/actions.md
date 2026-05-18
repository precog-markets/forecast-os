# Bundled CLI / Runtime Action Bridge

Use the action bridge for local ForecastOS execution. The skill includes a bundled runtime at `scripts/forecastos_runtime.mjs`, so no external SDK is required for local drafting, workflow state, TODO/mock creation, funding handoff, or prediction-consumption placeholders.

Before executing an action, inspect persistent workflow memory with:

```txt
node scripts/next_step.mjs --workflow-id <workflow_id>
node scripts/render_review.mjs --workflow-id <workflow_id>
```

```txt
node scripts/forecastos_action.mjs <action> --input <json-file>
```

Optional:

```txt
FORECASTOS_SDK_MODULE=<module-or-path>
FORECASTOS_STATE_DIR=.forecastos
```

`FORECASTOS_STATE_DIR` controls where `.forecastos` memory is written. `FORECASTOS_SDK_MODULE` is optional and should only point to a trusted replacement runtime when real Precog, Bankr/LiFi, or prediction adapters are ready.

## Supported Actions

- `draft_market`
- `run_skill_step`
- `create_market`
- `await_precog_approval`
- `fund_market`
- `consume_prediction`

See `references/tool-schemas.md` for the JSON input shapes to pass through `--input`.

## Approval Rules

- `create_market` requires `approved: true` and `approval_text`.
- `fund_market` requires `approved: true` from an operator.
- Live external adapters must be configured by the host project, not by the MCP server.
- The bundled runtime may write local `.forecastos` state, but does not make live network, wallet, or funding calls.

## Replace Points

- Precog creation adapter: endpoint, auth, payload, response contract.
- Precog approval adapter: approval status source and polling/subscription behavior.
- Funding adapter: Bankr, LiFi, manual operator flow, or another provider.
- Prediction adapter: probability/source API and response schema.
