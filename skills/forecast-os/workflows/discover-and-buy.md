# Workflow: discover and buy

Discover markets, load outcomes, quote a buy, and submit only after explicit user approval.

**Done when:** a quote was shown without `--confirm`, and a buy was submitted only after the user approved (or the user stopped at the quote).

If short refs or predict pairs fail, load [pitfalls.md](../references/pitfalls.md) and [commands.md](../references/commands.md). If status is not trading-ready, follow the setup loop in [config-and-auth.md](../references/config-and-auth.md). Discovery can continue when `api` is `ok`. Follow that loop before `--confirm` if the user wants to buy.

## Steps

1. Confirm the CLI is available. Run status. Discovery can continue when `api` is `ok`:

```bash
forecast --version
forecast status --platform polymarket --output json --no-input
```

2. Search or list markets. Use results immediately (short refs rewrite):

```bash
forecast market search "QUERY" --platform polymarket --limit 5 --output json --no-input
# or
forecast market list --platform kalshi --limit 10 --output json --no-input
```

3. Load outcomes for the chosen market (required before any `OUT:*` predict):

```bash
forecast market get POL:1 --only-outcomes --all --output json --no-input
```

4. Quote with exactly one option pair from [commands.md](../references/commands.md). Precog cannot use `--buy-size` alone (add `--price-limit`, or use `--buy-shares` + `--spend-limit`):

```bash
forecast predict OUT:1 --buy-shares 10 --spend-limit 0.45 --output json --no-input
```

5. Show the quote to the user. Stop here unless they explicitly ask to submit.

6. Submit only after approval:

```bash
forecast predict OUT:1 --buy-shares 10 --spend-limit 0.45 --confirm --output json --no-input
```

Optional safe retry: add `--request-id <uuid>` together with `--confirm`.

## Completion check

- Quote response has `ok: true` and `data.submitted` is false/absent before confirm.
- After confirm, `data.submitted` is true (or equivalent success fields / `next_actions` from the CLI).
- `--confirm` was used only after user approval.
