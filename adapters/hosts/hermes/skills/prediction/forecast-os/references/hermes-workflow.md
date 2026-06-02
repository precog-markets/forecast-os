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

When this skill is used from inside the ForecastOS repo, the setup check can
resolve the runtime path automatically. When copied elsewhere, set
`FORECASTOS_REPO_ROOT` to the ForecastOS repo root.
After updating ForecastOS, reinstall or symlink this Hermes skill export again,
or keep `FORECASTOS_REPO_ROOT` pointed at the current repo root so copied
Hermes installs do not call an outdated bridge.

## Publish Flow

After the user approves a draft, use this sequence:

1. Run `scripts/prepare-create-intent.mjs --input <create-intent-json>`.
2. Resolve wallet signing with the selected adapter. For Privy, run
   `scripts/resolve-privy-create.mjs --input <prepare-create-intent-json>`.
3. Submit the stored `create_market` workflow step with
   `scripts/forecastos-action.mjs publish_approved_market --input <workflow-id-json> --wallet-output <wallet-output-json>`.
   The input file should contain the existing `workflow_id`; the wrapper loads
   persisted workflow state before submitting.

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

## Boundaries

- ForecastOS drafts and advances human-approved Precog workflows.
- Wallet/action adapters resolve signing, nonce, token approval, and transaction
  fields outside ForecastOS.
- Hermes should not collect signing secrets in chat.
- Funding calldata must come from a trusted prepared transaction payload; do not
  invent it in the skill.
