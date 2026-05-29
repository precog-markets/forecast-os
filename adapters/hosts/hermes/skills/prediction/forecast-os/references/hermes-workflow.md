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
