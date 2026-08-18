# Forecast CLI command map

**Done when:** flags and option pairs match this map, the command was run, or a CLI error is explained.

All subcommands accept `--output auto|table|json`, `--config <path>`, `--no-input`, and `--verbose` / `-v`. Binary: `forecast` on `PATH` after `install.sh`.

## Root

| Command | Purpose | Notable options |
| --- | --- | --- |
| `status` | Platform readiness | `--platform all\|kalshi\|polymarket\|precog` |
| `setup` | Prepare platform config | `--platform …`, `--check-only` |
| `upgrade` | Unimplemented stub | `--version`, `--confirm` |
| `config` | Show / validate config | `--show`, `--validate` |
| `predict` | Quote or buy one outcome | see below |

## `market`

| Command | Purpose | Notable options |
| --- | --- | --- |
| `market list` | List markets | `--platform` (default `all`), `--tag`, `--status OPEN\|ENDED\|RESOLVED` (default `OPEN`), `--limit` (default `10`) |
| `market search <query>` | Search markets | `--platform`, `--status`, `--limit` (default `20`) |
| `market get <market_ref>` | Market detail or outcomes | `--only-outcomes`, `--status open\|closed\|all` (default `all`), `--yes`, `--no`, `--all` |

Notes:

- Multi-platform list/search splits `--limit` evenly across platforms and drops remainder (e.g. `10` → 3 each).
- `market get` does not take `--platform`; platform is encoded in the ref.
- `--yes` / `--no` / `--all` require `--only-outcomes`.

## `predict <outcome_ref>`

Quote by default. `--confirm` submits.

Use **one** option pair:

| Pair | Flags |
| --- | --- |
| Shares + budget | `--buy-shares <int≥1>` + `--spend-limit <decimal>` |
| Size + optional price | `--buy-size <decimal>` [+ `--price-limit <decimal>`] |

Also: `--request-id <uuid>` (requires `--confirm`).

`--spend-limit` is a total budget. If it implies more than one dollar per share, the CLI caps the per-share limit and still buys at most `--buy-shares`. `--price-limit` must not be greater than `1`. Mixing pairs, `--price-limit` alone, or an incomplete share/budget pair exits 2.

On Precog, `--buy-size` requires `--price-limit`. `--buy-shares` + `--spend-limit` still works (it derives a cap).

## `prediction`

| Command | Purpose | Notable options |
| --- | --- | --- |
| `prediction list` | Local history only | `--market <ref>`, `--platform` |
| `prediction get <prediction_ref>` | One position | |
| `prediction sell <prediction_ref>` | Sell (immediate) | `--shares`, `--min-return` |
| `prediction claim <prediction_ref>` | Claim resolved (not Kalshi) | |
| `prediction sync` | Refresh history from providers | `--confirm` required when replacing existing history |

## `create` (Precog)

| Command | Purpose | Notable options |
| --- | --- | --- |
| `create market` | Preview or create | `--spec <yaml\|json>` (required), `--chain base\|arbitrum`, `--confirm` |
| `create status <creation_ref>` | Creation request state | |

Required spec fields and Launchpad validation live in [create-precog-market.md](../workflows/create-precog-market.md).

## Market states (list/search)

- `OPEN`. Trading available.
- `ENDED`. Trading unavailable.
- `RESOLVED`. Claim may be available.
