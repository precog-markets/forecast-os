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

List open markets with the Precog API and `open_api_key` from config:

```txt
curl -s 'https://service.precog.markets/api/v1/markets/?chain_id=8453&status=OPEN' \
  -H 'Accept: application/json' \
  -H "X-API-Key: $(node -p "JSON.parse(require('fs').readFileSync('${FORECASTOS_REPO_ROOT}/skill/forecast-os/.forecastos/config.json','utf8')).precog.open_api_key")"
```

Use `chain_id=84532` for Base Sepolia listings. `supported_chains` in config is
for create/fund defaults, not for whether the API accepts a chain.

## Example: buy 2 Claude shares on Base market 138

### 1. Base MCP wallet (before prepare)

Call Base MCP `get_wallets` and `present_wallet_status_and_disclaimer`. Record
`wallet_address` (for example `0xabc...`).

### 2. Quote

```txt
node ${HERMES_SKILL_DIR}/scripts/quote-precog.mjs \
  --market 138 \
  --outcome-label Claude \
  --shares 2 \
  --buy \
  --network mainnet
```

Paste the full quote output to the operator and wait for confirmation.

### 3. Prepare unsigned trade

```txt
node ${HERMES_SKILL_DIR}/scripts/prepare-precog-buy.mjs \
  --market 138 \
  --outcome-label Claude \
  --shares 2 \
  --max <suggested-max-from-quote> \
  --wallet-address 0xabc... \
  --network mainnet > /tmp/trade.json
```

`--outcome 1` is equivalent to `--outcome-label Claude` when Claude is the
first listed outcome.

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
| Claude (label) | `--outcome-label Claude` |
| first outcome | `--outcome 1` |
| second outcome | `--outcome 2` |

## Boundaries

- Never ask for `PRIVATE_KEY`.
- Wallet adapters submit on Base mainnet (`8453`) only; use `--network mainnet`.
- Sepolia (`84532`) is fine for API listing and on-chain quotes with
  `--network sepolia`, but Base MCP submit requires mainnet.
- One trade per operator confirmation.
