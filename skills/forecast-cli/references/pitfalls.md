# Pitfalls and exit codes

## Short refs rewrite

`POL:n`, `PRE:n`, `KAL:n`, and `OUT:n` are rewritten on each `market list`, `market search`, and `market get --only-outcomes`. Stale short refs fail or buy the wrong market.

- Re-list / re-get immediately before `predict`.
- Prefer absolute refs in scripts and retries.

## Outcomes before predict

`OUT:*` requires a prior `market get <market_ref> --only-outcomes` (optionally `--all` / `--yes` / `--no`). Closed outcomes may map to local ref `CLOSED`.

Polymarket No side is `OUT:1:N`, not a separate market ref.

## Quote is not a buy

Without `--confirm`, `predict` and `create market` only quote/preview.

With `--output json` or `--no-input`, the CLI does **not** prompt to continue — it stops after the preview. Submission requires an explicit `--confirm` (and user approval in agent flows).

`--request-id` without `--confirm` is rejected.

## Predict option pairs

Valid:

- `--buy-shares` + `--spend-limit`
- `--buy-size` with optional `--price-limit` (must be ≤ 1)

Invalid: mixing pairs, `--price-limit` alone, incomplete share/budget pairs → user error (exit 2).

## Positions

- `prediction list` = local `history.json` only.
- Refresh with `prediction sync --confirm` when history already exists.
- `prediction sell` / `prediction claim` execute immediately — no dry-run flag.
- Kalshi: `prediction claim` always errors; settlements are automatic.
- Kalshi: one net Yes/No position per market; buying the opposite side nets/closes.

## Platform flags

- `market get` has no `--platform`.
- List/search `--status` uses `OPEN|ENDED|RESOLVED`.
- Outcome filter on get uses `open|closed|all`.
- Multi-platform `--limit` is split evenly; remainder dropped.

## Config cwd

Config defaults to `forecast_config.toml` in the **current working directory**. Run from a directory that has config, or pass `--config` / set `FORECAST_CONFIG`.

## Exit codes (practical)

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Soft capability / sync confirmation style failures |
| 2 | Bad refs, bad option combos, user errors |
| 3 | Config / auth / setup failures |
| 4 | Provider / service errors |

`status` is non-zero when any selected platform is unhealthy (setup → 3, unsupported → 1, else often 4).

## Stub

`forecast upgrade` is not implemented — ignore it in workflows.
