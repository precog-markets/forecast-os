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
- `draft`: produce a structured market spec and quality result. Store all close/resolution times as UTC ISO strings.
- `needs_info`: ask for missing entity, source, dates, launch timestamp, or outcome labels.
- `await_approval`: present a friendly review message and ask the user to reply `yes`.
- `create_market`: requires explicit approval and a non-stale draft hash stored in workflow memory.
- `await_precog_approval`: check Precog upcoming market status. `CREATED` waits; `VALIDATED` advances to funding.
- `fund`: generate a wallet-agnostic funding intent, let Bankr/Privy/Turnkey/manual wallets resolve tx/signature fields, then submit the operator-approved funding record to Precog.
- `consume_prediction`: wait for the upcoming market to become `DEPLOYED`, then check the upcoming market using config `precog.chain_id` and `id`, then fetch the deployed market from `/api/v1/markets/` using config `deployed_master_address`.
- `done`: workflow has fetched the deployed market and stored a compact planning signal.

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
- `await_approval`: show `render_review`, then wait for a simple approval such as `yes`, `approved`, or `looks good`.
- `create_market`: call `forecastos_action.mjs create_market`.
- `await_precog_approval`: call `await_precog_approval` only after a market ID exists.
- `fund`: require operator approval and a funding request.
- `consume_prediction`: check upcoming deployment, then read the deployed market. Do not invent prices or probabilities.
