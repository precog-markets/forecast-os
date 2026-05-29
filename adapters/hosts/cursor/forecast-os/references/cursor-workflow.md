# Cursor ForecastOS Workflow

This is the Cursor-facing ForecastOS skill export. Cursor discovers Agent Skills
from `.cursor/skills/`, `.agents/skills/`, and the matching user-level
directories. It can also discover Codex and Claude skill folders, but this
native Cursor package is the clearest explicit setup path.

## Install

Project-level install:

```txt
.cursor/skills/forecast-os
.agents/skills/forecast-os
```

User-level install:

```txt
~/.cursor/skills/forecast-os
~/.agents/skills/forecast-os
```

Copy or symlink `adapters/hosts/cursor/forecast-os` to one of those locations.
The folder name must remain `forecast-os` because Cursor requires the folder
containing `SKILL.md` to match the `name` frontmatter.

## Runtime

This package is a Cursor host adapter, not the full ForecastOS runtime. It
expects the ForecastOS repo/runtime or an installed equivalent that provides:

- `skill/forecast-os/scripts/forecastos_action.mjs`
- `skill/forecast-os/.forecastos/config.json`
- selected wallet/action adapters under `adapters/wallets/*`

When this Cursor skill is copied away from the ForecastOS repo, set
`FORECASTOS_REPO_ROOT` to the ForecastOS repo root before running live workflow
commands. Set `FORECASTOS_NODE_BIN` only when Cursor cannot run `node` from PATH.

## Commands

Run a read-only setup check:

```txt
node scripts/check-cursor-setup.mjs
```

Forward an action to the canonical ForecastOS action bridge:

```txt
node scripts/forecastos-action.mjs run_skill_step --input <json-file>
```

## Boundaries

- Cursor loads ForecastOS instructions and runs local scripts.
- ForecastOS drafts, approves, creates, funds, polls, and consumes Precog state.
- Wallet/action adapters resolve signing, nonce lookup, token approval, and
  transaction fields outside Cursor and outside the host adapter.
- Do not ask for private keys, raw signatures, raw nonces, or custody secrets in
  chat.
- Do not ask Cursor to invent funding calldata.
