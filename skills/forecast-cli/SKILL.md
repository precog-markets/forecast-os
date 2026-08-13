---
name: forecast-cli
description: >-
  Operate Forecast CLI for Polymarket, Precog, and Kalshi prediction markets.
  Use whenever the user installs or runs forecast-cli / the `forecast` command,
  searches or lists markets, gets outcomes, quotes or buys predictions, lists /
  sells / claims / syncs positions, creates Precog markets, or checks setup /
  status / config — including agent automation with JSON output.
metadata:
  cli: forecast
  package: forecast-cli
---

# Forecast CLI

Operator skill for the Forecast CLI (`forecast`) after `pip install forecast-cli`. Platforms: Polymarket, Precog, Kalshi.

Use the routing table to pick a reference or workflow, then read that file before constructing commands. CLI behavior lives in `references/`. Repeatable multi-step patterns live in `workflows/`.

## Agent defaults

- Invoke `forecast` on `PATH` (installed via `pip install forecast-cli`).
- Prefer `--output json --no-input` on every command.
- Never put secrets on the command line; use env vars or ignored key files.
- Quote / preview first. Add `--confirm` only when the user explicitly asks to submit.
- `prediction sell` and `prediction claim` have no dry-run — warn before running them.
- Run from a directory that resolves config (`forecast_config.toml`, `FORECAST_CONFIG`, or `--config`).

## Command routing

Match the user's intent, then load the linked file before running commands. If intent spans multiple domains, load them in dependency order (setup/status before trade workflows).

| User intent | Command / workflow | Load |
| --- | --- | --- |
| Install / verify CLI | `forecast --version` / `--help` | this file |
| Show or validate config | `forecast config` | [config-and-auth.md](references/config-and-auth.md) |
| Non-interactive platform setup | `forecast setup` | [config-and-auth.md](references/config-and-auth.md) |
| Check platform readiness | `forecast status` | [config-and-auth.md](references/config-and-auth.md) |
| Full command and flag map | — | [commands.md](references/commands.md) |
| Short refs, Kalshi, exit codes | — | [pitfalls.md](references/pitfalls.md) |
| List markets | `forecast market list` | [commands.md](references/commands.md) |
| Search markets | `forecast market search` | [commands.md](references/commands.md) |
| Get market or outcomes | `forecast market get` | [commands.md](references/commands.md) |
| Discover → quote → buy | multi-step | [discover-and-buy.md](workflows/discover-and-buy.md) |
| Quote or buy one outcome | `forecast predict` | [commands.md](references/commands.md) + [pitfalls.md](references/pitfalls.md) |
| Sync / list / get / sell / claim positions | multi-step | [manage-positions.md](workflows/manage-positions.md) |
| Create a Precog market | multi-step | [create-precog-market.md](workflows/create-precog-market.md) |
| Check market creation status | `forecast create status` | [commands.md](references/commands.md) |

## Quick health check

Done when `forecast status --output json --no-input` succeeds for the platforms you need, or you have explained a clear config/auth failure (often exit code 3).

```bash
forecast config --show --output json --no-input
forecast status --output json --no-input
```

## Local vs absolute refs

| Type | Local | Absolute examples |
| --- | --- | --- |
| Market | `POL:1`, `PRE:1`, `KAL:1` | `POLYMARKET:EVENT:…`, `KALSHI:EVENT:…`, `PRECOG:8453:…` |
| Outcome | `OUT:1`, `OUT:1:N` (Polymarket No) | `POLYMARKET:MARKET:…:OUTCOME:…` |
| Prediction | `PRED:1` | `POLYMARKET:POSITION:…`, `KALSHI:MARKET:…:POSITION:1\|2` |

Prefer absolute refs in scripts. Short refs rewrite on each list/search/`get --only-outcomes`.

## JSON envelope

Commands commonly return: `ok`, `command`, `data`, `warnings`, `error`, `next_actions`. Progress goes to stderr when `-v` is set.

## Out of scope

- `forecast upgrade` is a stub — do not rely on it.
- Editing the Forecast CLI codebase.
