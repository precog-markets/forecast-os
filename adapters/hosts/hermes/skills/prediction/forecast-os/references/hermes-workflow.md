# Hermes ForecastOS Workflow

This is the Hermes-facing ForecastOS skill export. It is the preferred Hermes
integration because Hermes skills are discoverable through `skills_list`, slash
commands, and `skill_view`.

## Runtime

The skill expects the ForecastOS repo/runtime or an installed equivalent that
provides:

- `skill/forecast-os/scripts/forecastos_action.mjs`
- `skill/forecast-os/.forecastos/config.json`
- any selected wallet/action adapter under `adapters/wallets/`
- Precog trading scripts under `adapters/actions/precog/` (quote, prepare, positions)

When this skill is used from inside the ForecastOS repo, the setup check can
resolve the runtime path automatically. When copied elsewhere, set
`FORECASTOS_REPO_ROOT` to the ForecastOS repo root.
After updating ForecastOS, reinstall or symlink this Hermes skill export again,
or keep `FORECASTOS_REPO_ROOT` pointed at the current repo root so copied
Hermes installs do not call an outdated bridge.

## Publish Flow

After the user approves a draft, prefer **`run_skill_step`** to advance the
persisted workflow and prepare the create intent at `create_market`. Standalone
`prepare-create-intent.mjs` accepts `workflow_id` but `run_skill_step` is the
normal path.

1. Approve with full persisted `state` plus `event.approved: true` and
   `event.image_url`.
2. At `create_market`, call `run_skill_step` again with `event.image_url` to
   get the wallet create intent (or run `prepare-create-intent.mjs --input`
   with `{ "workflow_id": "<id>", "image_url": "..." }`).
3. Resolve wallet signing with the selected adapter. For Privy, run
   `scripts/resolve-privy-create.mjs --input <create-intent-json>`.
4. Submit with
   `scripts/forecastos-action.mjs publish_approved_market --workflow-id <id> --wallet-output <out.json>`.

Use `node scripts/inspect_state.mjs` to read `.forecastos` state. Never
`require(...)` skill scripts, never `sed`-edit drafts/workflows, and never
hand-write partial `config.json`. For copied installs, keep state in the
Hermes skill-local `.forecastos/` directory.

Do not call direct `create_market` before wallet resolution. Direct
`create_market` is only a low-level call when `creator_address` and
`creator_signature` are already present, and it skips workflow persistence. Do not use `preview_market`; use
`draft_market` or `run_skill_step`.

Prefer JSON input files. `scripts/forecastos-action.mjs --input -` also works
for heredoc stdin when Hermes needs to pipe a payload through the terminal.

## Draft Inputs

Prefer the canonical draft fields: `prompt`, `requested_outcomes`,
`source_hints`, `requested_close_time`, and `requested_resolution_time`.
Host-style aliases are also accepted for copied skill runtimes:
`question`, `outcomes`, `source`, `close_time`, `resolution_time`, and
`category`. Do not use only `Yes` and `No`; for release/date prompts, use buckets such as `Released in 2027`, `Released before 2027`, `Released after 2027`, and `No official release / cancelled`. If using explicit `resolution_criteria`, prefer labeled lines for `Source of truth`, `Winning outcome rule`, `Resolution timing`, and `Fallback`.

## Skill-First Model

Use this normal Hermes skill for default ForecastOS workflows. The older
`adapters/hosts/hermes/forecast-os` package is a plugin/tool wrapper for
advanced setups that explicitly want a Hermes tool named `forecastos_action`.

## Trading Flow

For deployed-market buy/sell, see `references/hermes-precog-trading.md`. Use
Hermes shims (`quote-precog.mjs`, `prepare-precog-buy.mjs`,
`resolve-base-mcp-trade.mjs`) with `FORECASTOS_REPO_ROOT` set. Call Base MCP
`get_wallets` before `prepare-precog-buy.mjs`.

## Boundaries

- ForecastOS drafts and advances human-approved Precog workflows.
- Wallet/action adapters resolve signing, nonce, token approval, and transaction
  fields outside ForecastOS.
- Hermes should not collect signing secrets in chat.
- Funding calldata must come from a trusted prepared transaction payload; do not
  invent it in the skill.
