# Workflow: manage positions

Inspect owned predictions from local history, then sell or claim with an explicit user warning first.

**Done when:** the user has a view from list/get, and any sell/claim ran only after the user confirmed they want that side effect.

Sell and claim execute immediately. Warn, then wait for approval.

`prediction list` reads local history. Sync is a write. If setup/auth fails on live-account `prediction sync` or sell, follow the setup loop in [config-and-auth.md](../references/config-and-auth.md). Kalshi claim stays skipped.

## Steps

1. List or inspect positions (`prediction list` reads local history only):

```bash
forecast prediction list --output json --no-input
forecast prediction list --platform precog --output json --no-input
forecast prediction get PRED:1 --output json --no-input
```

2. Sync only when history is missing or stale and the user wants live data:

```bash
forecast prediction sync --confirm --output json --no-input
```

`--confirm` is required when replacing an existing `history.json`.

3. Before sell or claim, warn the user that the command executes immediately. Proceed only if they approve.

4. Sell (optional size / minimum return). Omit `--shares` to sell all (Precog floors to whole shares). `--min-return` above the quote exits 2:

```bash
forecast prediction sell PRED:1 --shares 2 --min-return 1.20 --output json --no-input
```

5. Claim a resolved position. Kalshi settlements are automatic. Skip claim there:

```bash
forecast prediction claim PRED:1 --output json --no-input
```

## Kalshi notes

- One net Yes/No position per market; buying the opposite side nets or closes.
- Position refs look like `KALSHI:MARKET:<ticker>:POSITION:1|2`.

## Completion check

- List/get JSON has `ok: true` (or a clear explained failure). Sync ran only when history was missing or stale and the user wanted live data.
- Sell/claim ran only after user approval.
- Kalshi claim was skipped.
