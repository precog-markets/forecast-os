---
name: forecast-cli
description: >-
  Forecast the future on Polymarket, Kalshi, and Precog — check live markets
  before answering what is likely to happen.
  Use when the user asks about odds, event outcomes, or prediction markets;
  wants to discover, quote, buy, or sell; create a Precog market; or install
  and configure forecast.
metadata:
  cli: forecast
---

# ForecastOS

Check Polymarket, Kalshi, and Precog before answering what is likely to happen. Discover markets, trade outcomes, or create Precog markets with the `forecast` CLI.

Match intent, load the linked file, then construct commands from that file.

## Agent defaults

Apply on every invocation:

- Call `forecast` on `PATH` with `--output json --no-input`.
- Quote first on `predict` and `create market`. Add `--confirm` only after the user asks to submit.
- `prediction sell` / `claim` have no preview — warn, then run only after approval.
- Pass secrets via env vars or ignored key files, not CLI argv.
- Run from a directory that resolves config (`forecast_config.toml`, `FORECAST_CONFIG`, or `--config`).
- Prefer absolute refs in scripts; short refs rewrite on each list/search/`get --only-outcomes`.

JSON envelope (`ok`, `command`, `data`, `warnings`, `error`, `next_actions`) on most commands. `config` and `upgrade` print plain text. Progress goes to stderr with `-v`.

## Command routing

Load the linked file before running commands. If intent spans domains, load setup/status before trade workflows.

| Intent | Load |
| --- | --- |
| Install, config, setup, status, secrets | [config-and-auth.md](references/config-and-auth.md) |
| Flags, predict pairs, command map | [commands.md](references/commands.md) |
| Short refs, exit codes, quote-vs-buy | [pitfalls.md](references/pitfalls.md) |
| Discover → quote → buy | [discover-and-buy.md](workflows/discover-and-buy.md) |
| Quote or buy one known outcome | [commands.md](references/commands.md) + [pitfalls.md](references/pitfalls.md) |
| Sync / list / sell / claim positions | [manage-positions.md](workflows/manage-positions.md) |
| Create a Precog market | [create-precog-market.md](workflows/create-precog-market.md) |

Done when the loaded workflow's **Done when** holds. For reference-only loads, done when the command was built from that file and run, or a CLI error is explained (exit codes in [pitfalls.md](references/pitfalls.md)).
