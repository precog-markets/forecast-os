# Workflow

ForecastOS advances one bounded step at a time:

```txt
intake
  -> draft
  -> needs_info / await_approval
  -> create_market
  -> await_precog_approval
  -> fund
  -> consume_prediction
  -> done
```

## Step Notes

- `intake`: parse prompt, category, entity, timeframe, source hints, and requested outcomes.
- `draft`: produce a structured market spec and quality result.
- `needs_info`: ask for missing entity, source, dates, launch timestamp, or outcome labels.
- `await_approval`: present review message and exact approval text.
- `create_market`: requires explicit approval and a non-stale draft hash.
- `await_precog_approval`: check Precog upcoming market status. `CREATED` waits; `VALIDATED` advances to funding.
- `fund`: TODO/mock until Bankr/LiFi/manual funding adapters are configured.
- `consume_prediction`: TODO/mock until market data APIs are confirmed.
- `done`: workflow has reached a terminal local state.

## Local State Layout

```txt
.forecastos/
  drafts/
    <draft_id>.json
  workflows/
    all/
      <workflow_id>.json
    needs_info/
    await_approval/
    create_market/
    await_precog_approval/
    funded/
    consume_prediction/
    done/
```

The workflow step `fund` is stored under the human-readable folder `funded/`.

## Memory Helpers

Use `scripts/render_review.mjs` to turn a draft or workflow into a human approval view.

Use `scripts/next_step.mjs` to inspect a workflow and determine the next valid action:

- `needs_info`: ask the user for missing fields, then rerun `run_skill_step`.
- `await_approval`: show `render_review`, then wait for exact approval.
- `create_market`: call `forecastos_action.mjs create_market`.
- `await_precog_approval`: call `await_precog_approval` only after a market ID exists.
- `fund`: require operator approval and a funding request.
- `consume_prediction`: use only a configured prediction data adapter.
