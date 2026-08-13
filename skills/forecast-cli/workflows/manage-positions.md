# Workflow: manage positions

Refresh local history, inspect owned predictions, then sell or claim with an explicit user warning first.

**Done when:** the user has a current view from sync/list/get, and any sell/claim ran only after the user confirmed they want that side effect.

Sell and claim have **no dry-run** and no `--confirm` flag — they execute immediately.

## Steps

1. Refresh local history when it is missing or stale:

```bash
forecast prediction sync --confirm --output json --no-input
```

`--confirm` is required when replacing an existing `history.json`.

2. List or inspect positions (`prediction list` reads local history only):

```bash
forecast prediction list --output json --no-input
forecast prediction list --platform precog --output json --no-input
forecast prediction get PRED:1 --output json --no-input
```

3. Before sell or claim, warn the user that the command executes immediately. Proceed only if they approve.

4. Sell (optional size / minimum return):

```bash
forecast prediction sell PRED:1 --shares 2 --min-return 1.20 --output json --no-input
```

5. Claim a resolved position (not Kalshi — Kalshi auto-settles; claim errors there):

```bash
forecast prediction claim PRED:1 --output json --no-input
```

## Kalshi notes

- One net Yes/No position per market; buying the opposite side nets or closes.
- Do not use `prediction claim` for Kalshi.
- Position refs look like `KALSHI:MARKET:<ticker>:POSITION:1|2`.

## Completion check

- List/get/`sync` JSON has `ok: true` (or a clear explained failure).
- Sell/claim were not run without user approval.
- Kalshi claim was not attempted.
