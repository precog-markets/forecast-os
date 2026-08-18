# Pitfalls and exit codes

**Done when:** the relevant gotcha is applied (short ref refreshed, quote not submitted as a buy, exit code explained).

Gotchas `--help` does not confess. Flag maps and option pairs live in [commands.md](commands.md).

## Short refs rewrite

| Type | Local | Absolute examples |
| --- | --- | --- |
| Market | `POL:1`, `PRE:1`, `KAL:1` | `POLYMARKET:EVENT:…`, `KALSHI:EVENT:…`, `PRECOG:8453:…` |
| Outcome | `OUT:1`, `OUT:1:N` (Yes / No) | `POLYMARKET:MARKET:…:OUTCOME:…`, `KALSHI:MARKET:…:OUTCOME:…` |
| Prediction | `PRED:1` | `POLYMARKET:POSITION:…`, `KALSHI:MARKET:…:POSITION:1\|2` |

`POL:n`, `PRE:n`, `KAL:n`, and `OUT:n` rewrite on each `market list`, `market search`, and `market get --only-outcomes`. Stale short refs fail or buy the wrong market. Re-list / re-get immediately before `predict`. Prefer `POLYMARKET:EVENT:{id}` and `KALSHI:EVENT:{id}` from the same JSON `id`. Do not search again until those short refs are finished. Browse headlines from search/list JSON. Do not `market get` every row.

## Outcomes before predict

`OUT:*` requires a prior `market get <market_ref> --only-outcomes` (optionally `--all` / `--yes` / `--no`). Closed outcomes may map to local ref `CLOSED`.

`OUT:n` is Yes and `OUT:n:N` is No on Polymarket and Kalshi, not a separate market ref.

## Quote vs buy

Without `--confirm`, `predict` and `create market` only quote/preview.

With `--output json` or `--no-input`, the CLI stops after the preview. It does not prompt to continue. Submission is an explicit `--confirm` after user approval.

`--request-id` without `--confirm` is rejected.

## Positions

- `prediction list` reads local `history.json` only. `prediction sync --confirm` is required when replacing existing history.
- `prediction sell` / `prediction claim` execute immediately. Warn, then wait for approval.
- Kalshi settlements are automatic; `prediction claim` always errors there.
- On Kalshi, one net Yes/No position per market. Buying the opposite side nets or closes.

## Status enums

List/search `--status` uses `OPEN|ENDED|RESOLVED`. Outcome filter on `market get` uses `open|closed|all`.

`status` `creation` is `unsupported` on Polymarket and Kalshi; trading can still be healthy. Treat `creation: unsupported` as expected there, not a setup failure. It is not a credentials pause. Funding messages (`INSUFFICIENT_BALANCE`, `INSUFFICIENT_ALLOWANCE`) are not a credentials pause. Missing keys, relayer, or read-only trading uses the setup loop in [config-and-auth.md](config-and-auth.md).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Soft capability / sync confirmation style failures |
| 2 | Bad refs, bad option combos, user errors |
| 3 | Config / auth / setup failures |
| 4 | Provider / service errors |
| 5 | Pending `--request-id` already started |

`status` is non-zero when any selected platform is unhealthy (setup → 3, unsupported → 1, else often 4).
