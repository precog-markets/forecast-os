# Hermes Precog Trading

Host-agnostic Precog trading scripts live in the ForecastOS **repo root**, not
inside the copied Hermes skill install. Hermes shims forward to the repo when
`FORECASTOS_REPO_ROOT` is set.

## Prerequisites

```txt
export FORECASTOS_REPO_ROOT=/path/to/forecast-os-feat-add-trading
node ${HERMES_SKILL_DIR}/scripts/check-hermes-setup.mjs
```

`precog_actions_installed` must be `true` in the setup JSON.

## Market discovery (any chain)

List open markets with the Hermes shim (shows both API id and on-chain id):

```txt
node ${HERMES_SKILL_DIR}/scripts/list-precog-markets.mjs --chain-id 8453 --status OPEN
```

Columns: `api_id`, `master_market_id`, `name`, `outcomes`. **Trade with
`--market <api_id>`** — scripts resolve `master_market_id` for on-chain calls.

Use `chain_id=84532` for Base Sepolia listings. `supported_chains` in config is
for create/fund defaults, not for whether the API accepts a chain.

## API id vs on-chain id

Precog API `id` (for example `136`) is not the same as on-chain
`master_market_id` (for example `23`). Never pass API id directly to hand-rolled
calldata. Always use `quote-precog.mjs` → `prepare-precog-buy.mjs` →
`resolve-base-mcp-trade.mjs`. Do not patch repo scripts locally.

## Example: buy 2 Bruno Mars shares on Base market 136

### 1. Base MCP wallet (before prepare)

Call Base MCP `get_wallets` and `present_wallet_status_and_disclaimer`. Record
`wallet_address` (for example `0xabc...`).

### 2. Quote

```txt
node ${HERMES_SKILL_DIR}/scripts/quote-precog.mjs \
  --market 136 \
  --outcome-label "Bruno Mars" \
  --shares 2 \
  --buy \
  --chain-id 8453
```

Network is inferred from `chain_id` (`8453` → mainnet). Paste the full quote
output to the operator and wait for confirmation. Use the suggested `--max`
from the quote — do not guess.

### 3. Prepare unsigned trade

```txt
node ${HERMES_SKILL_DIR}/scripts/prepare-precog-buy.mjs \
  --market 136 \
  --outcome-label "Bruno Mars" \
  --shares 2 \
  --max <suggested-max-from-quote> \
  --wallet-address 0xabc... \
  --chain-id 8453 > /tmp/trade.json
```

Use `--outcome-label "Bruno Mars"` (quoted). Do not use `--outcome Bruno Mars`
or `--outcome-index`. `--outcome 2` is equivalent when Bruno Mars is the second
listed outcome.

### 4. Resolve Base MCP send_calls

```txt
node ${HERMES_SKILL_DIR}/scripts/resolve-base-mcp-trade.mjs \
  --input /tmp/trade.json \
  --wallet-address 0xabc...
```

If `--wallet-address` is omitted, the resolver returns
`next_action: base_mcp_get_wallets` with guidance instead of failing opaquely.

### 5. Submit via Base MCP

Run Base MCP `send_calls` with `base_mcp.send_calls` from the resolver output.

### 6. Confirm (optional)

```txt
node ${HERMES_SKILL_DIR}/scripts/resolve-base-mcp-trade.mjs \
  --input /tmp/trade.json \
  --wallet-address 0xabc... \
  --tx-hashes 0xhash1,0xhash2
```

## Outcome selection

| Operator says | CLI |
|---------------|-----|
| Bruno Mars (label) | `--outcome-label "Bruno Mars"` |
| first outcome | `--outcome 1` |
| second outcome | `--outcome 2` |

Invalid: `--outcome Bruno Mars`, `--outcome-index 1`, skipping quote, guessing `--max`.

## Boundaries

- Never ask for `PRIVATE_KEY`.
- Wallet adapters submit on Base mainnet (`8453`) only; use `--chain-id 8453` or `--network mainnet`.
- Sepolia (`84532`) is fine for API listing and on-chain quotes with
  `--network sepolia`, but Base MCP submit requires mainnet.
- One trade per operator confirmation.
