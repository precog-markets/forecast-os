# Workflow

ForecastOS advances one bounded step at a time. Creation defaults to Precog: the `create_market` step submits a Precog upcoming-market request, while external market providers remain read-only context.

```txt
intake
  -> draft
  -> needs_info / await_approval
  -> create_market
  -> await_precog_approval
  -> fund
  -> consume_prediction
  -> done
await_precog_approval
  -> rejected
```

## Step Notes

- `intake`: parse prompt, category, entity, timeframe, source hints, and requested outcomes.
- `draft`: produce a structured market spec and quality result. Store all close/resolution times as UTC ISO strings. Block approval when the question is over 65 characters or any sanitized outcome label is over 32 characters.
- `needs_info`: ask natural questions for missing entity, source, dates, launch timestamp, or outcome labels. Do not show schema field names to the user.
- `await_approval`: present a friendly review message, not raw JSON, and ask the user to reply `yes` or request edits. Include configured collateral token context such as `Token: USDC` and the collateral address when available.
- `create_market`: submits to the configured Precog API root and requires explicit approval and a non-stale draft hash stored in workflow memory.
- `await_precog_approval`: check Precog upcoming market status. `CREATED`, `PENDING`, and unknown non-final statuses wait; `VALIDATED` advances to funding; `REJECTED`, `FAILED`, and `DENIED` move to `rejected`.
- `fund`: generate a wallet-agnostic funding intent, let configured wallet/action tooling resolve transaction and signature fields, then submit the operator-approved funding record to Precog.
- `consume_prediction`: wait for the upcoming market to become `DEPLOYED`, then check the upcoming market using config `precog.chain_id` and `id`, then fetch the deployed market from `/api/v1/markets/` using config `deployed_master_address`.
- `done`: workflow has fetched the deployed market and stored a compact planning signal.
- `rejected`: Precog rejected or denied the upcoming market, or returned a failed terminal status. Keep the raw status in workflow memory.

Funding is both a workflow step and a liquidity action. Read `references/precog-liquidity.md` before explaining creator earnings, LP returns, profit pools, funding risk, or virtual liquidity. Funding still requires explicit operator approval and the `VALIDATED` Precog approval state.

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
    rejected/
    funded/
    consume_prediction/
    done/
```

The workflow step `fund` is stored under the human-readable folder `funded/`.

## Memory Helpers

Use `scripts/render_review.mjs` to turn a draft or workflow into a human approval view. In chat, summarize the review for the user; do not paste raw JSON unless the user asks for operator/debug detail.

Use `scripts/next_step.mjs` to inspect a workflow and determine the next valid action:

- `needs_info`: ask the user the friendly questions from `suggest_next_questions`, then rerun `run_skill_step`.
- `await_approval`: show `render_review`, then wait for a simple approval such as `yes`, `approved`, or `looks good`.
- `create_market`: call `forecastos_action.mjs create_market` to submit the approved Precog upcoming market.
- `await_precog_approval`: call `await_precog_approval` only after a market ID exists, or use `scripts/check_pending_market.mjs --workflow-id <workflow_id>` as the one-shot command for an external hourly scheduler.
- `fund`: require operator approval and a funding request.
- `consume_prediction`: check upcoming deployment, then read the deployed market. Do not invent prices or probabilities.

MCP is optional. The normal production path works through `scripts/forecastos_action.mjs` and `.forecastos/` memory without reading or building any MCP project.

By default, CLI scripts use the skill-local `.forecastos` directory next to `SKILL.md`, so the repo path is `skill/forecast-os/.forecastos` and an installed skill reads its own bundled `.forecastos`. Use `FORECASTOS_STATE_DIR` or a script's `--state-dir` option only when a custom state/config directory is intentional; a repo-root `.forecastos/config.json` is not required.

## Version Checks

The repo root `VERSION` is canonical. A skill-local `VERSION` is generated only for detached fixed-copy installs, using `node scripts/sync_version.mjs`; symlinked repo installs can read the root version directly. Run `node scripts/check_version.mjs` daily from the skill directory or repo to get machine-readable JSON for the current skill, repo, optional artifact version, and drift status. The script reports version drift only; daily scheduling belongs to Codex automation, cron, or another external scheduler.
