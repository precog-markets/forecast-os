# Workflow: discover and buy

Discover markets, load outcomes, quote a buy, and submit only after explicit user approval.

**Done when:** a quote was shown without `--confirm`, and a buy was submitted only after the user approved (or the user stopped at the quote).

Read [pitfalls.md](../references/pitfalls.md) if short refs or predict option pairs fail.

## Steps

1. Confirm the CLI is available and the target platform is healthy:

```bash
forecast --version
forecast status --platform polymarket --output json --no-input
```

2. Search or list markets. Short refs rewrite on each call — use results immediately:

```bash
forecast market search "QUERY" --platform polymarket --limit 5 --output json --no-input
# or
forecast market list --platform kalshi --limit 10 --output json --no-input
```

3. Load outcomes for the chosen market (required before any `OUT:*` predict):

```bash
forecast market get POL:1 --only-outcomes --all --output json --no-input
```

`market get` has no `--platform`; the platform is in the ref.

4. Quote with exactly one option pair — never mix pairs:

- `--buy-shares` + `--spend-limit`
- `--buy-size` [+ optional `--price-limit` ≤ 1]

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
- No `--confirm` was used without user approval.
