---
name: forecast-os
description: >-
  Forecast the future on Polymarket, Kalshi, and Precog. Check live markets
  before answering what is likely to happen. Use when the user asks about
  odds, event outcomes, or prediction markets; wants to discover, quote,
  buy, or sell; create a Precog market; install and configure forecast; or
  needs first-time setup, a relayer, a Precog private key, a Kalshi API key,
  an RSA PEM, a read-only CLI, or a missing Windows forecast binary.
metadata:
  cli: forecast
---

# ForecastOS

Check Polymarket, Kalshi, and Precog before answering what is likely to happen. Discover markets, trade outcomes, or create Precog markets with the `forecast` CLI.

Match intent, load the linked file, then construct commands from that file.

## Agent defaults

Apply on every invocation:

- Call `forecast` with `--output json --no-input`. If it is missing, load [config-and-auth.md](references/config-and-auth.md) and find or install the binary.
- Browse (odds, search, list, headlines) does not need `status`, keys, or a config file. `status` exit 3 with `CONFIG_INVALID` is not a browse failure.
- Quote first on `predict` and `create market`. Add `--confirm` only after the user asks to submit.
- `prediction sell` / `claim` have no preview. Warn, then run only after approval.
- Pass secrets via env vars or ignored key files, not CLI argv.
- Run from a directory that resolves config (`forecast_config.toml`, `FORECAST_CONFIG`, or `--config`) when trading.
- Prefer absolute refs (`POLYMARKET:EVENT:{id}`, `KALSHI:EVENT:{id}`). Short refs rewrite. Details in [pitfalls.md](references/pitfalls.md).

JSON envelope (`ok`, `command`, `data`, `warnings`, `error`, `next_actions`) on most commands. `config` and `upgrade` print plain text. Progress goes to stderr with `-v`.

## Command routing

Load the linked file before running commands. Browse does not load setup. Load setup only for writes, missing binary, or explicit install.

| Intent | Load |
| --- | --- |
| Missing binary, install, config, setup, status, secrets, first-time keys | [config-and-auth.md](references/config-and-auth.md) |
| Browse, odds, search, list | [commands.md](references/commands.md) + [pitfalls.md](references/pitfalls.md) |
| Flags, predict pairs, command map | [commands.md](references/commands.md) |
| Short refs, exit codes, quote-vs-buy | [pitfalls.md](references/pitfalls.md) |
| Quote or buy (chosen market or known outcome) | [quote-and-buy.md](workflows/quote-and-buy.md) |
| Sync / list / sell / claim positions | [manage-positions.md](workflows/manage-positions.md) |
| Create a Precog market | [create-precog-market.md](workflows/create-precog-market.md) |

Done when the loaded workflow's **Done when** holds. For reference-only loads, done when the command was built from that file and run, or a CLI error is explained (exit codes in [pitfalls.md](references/pitfalls.md)).
