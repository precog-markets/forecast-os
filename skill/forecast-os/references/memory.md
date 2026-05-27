# Persistent Workflow Memory

ForecastOS uses `.forecastos/` as persistent structured memory for drafts and workflow state.

This is operational memory, not vector memory. Agents should inspect it to know what is pending, what needs approval, what has been created, and what is ready for funding or prediction consumption.

## State Root

Default:

```txt
.forecastos
```

Override:

```txt
FORECASTOS_STATE_DIR=/path/to/.forecastos
```

## Folder Model

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

`workflows/all/` holds the latest copy. Status folders show the current active workflow state. The workflow step `fund` is stored under the human-readable `funded/` folder.

## Read And Write Boundaries

- MCP reads memory.
- `inspect_state.mjs`, `render_review.mjs`, and `next_step.mjs` read memory.
- `forecastos_action.mjs` is the only script in this skill that should advance or create state, using the bundled runtime.

Do not add mutating MCP tools for memory updates.

## Review Helpers

Use:

```txt
node scripts/render_review.mjs --workflow-id <workflow_id>
node scripts/render_review.mjs --draft-id <draft_id>
```

Use this before asking the human to approve a draft.

## Next-Step Helper

Use:

```txt
node scripts/next_step.mjs --workflow-id <workflow_id>
```

Use this when an agent needs to decide whether to ask for missing info, collect approval, create the market, wait for Precog approval, request funding, consume prediction, or stop.
