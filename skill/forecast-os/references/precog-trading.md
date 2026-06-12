# Precog Trading

ForecastOS does not execute onchain trades. When an operator wants to buy or
sell outcome shares on a **deployed** Precog market, use the host-agnostic
action scripts under `adapters/actions/precog/` plus a wallet adapter for signing.

## Boundary

- ForecastOS MCP and skill: read-only market discovery, prices, workflow memory
- `adapters/actions/precog/`: quote, prepare unsigned trades, positions (no keys)
- `adapters/wallets/{bankr,privy,base-mcp}/`: sign and submit prepared trades

Do not add trading tools to MCP or `forecastos_action.mjs`. Do not ask for
`PRIVATE_KEY` — use the operator's configured wallet provider.

## Market discovery

Precog open markets can be listed for **any** `chain_id` via the API:

```txt
GET /api/v1/markets/?chain_id=8453&status=OPEN
GET /api/v1/markets/?chain_id=84532&status=OPEN
```

Use `open_api_key` from `.forecastos/config.json`. A chain does not need a
`supported_chains` entry to be queryable through the API.

## Prerequisites

```txt
cd adapters/actions/precog
npm install
```

Default network is Base Sepolia for quotes; wallet adapters require
`--network mainnet` (Base 8453) for submit.

## Agent flow

1. Discover the market with read-only ForecastOS tools (`forecastos_search_markets`,
   Precog API reads, or MCP market tools).
2. Run `quote.mjs` and paste the **full output verbatim** to the operator.
3. Wait for explicit confirmation.
4. Run `prepare_buy.mjs` or `prepare_sell.mjs` with `--wallet-address` from the
   operator's Bankr/Privy/Base wallet (not a private key).
5. Submit with the matching wallet adapter `resolve_trade.mjs`.
6. Optionally run `positions.mjs --wallet-address <0x...>` to verify holdings.

## Outcome selection

Use 1-based `--outcome <n>` or `--outcome-label <name>` (case-insensitive).
If both are provided, they must agree.

| Operator says | Use |
|---------------|-----|
| Claude (label) | `--outcome-label Claude` |
| first outcome | `--outcome 1` |
| buy N shares | `--shares N` |
| spend $X | `--cost X` |
| reach X% | `--price 0.X` |
| all in | `--all --wallet-address <0x...>` |

## Commands (repo root)

```txt
node adapters/actions/precog/quote.mjs --market <id> --outcome-label Claude --shares 2 --buy --network mainnet
node adapters/actions/precog/prepare_buy.mjs --market <id> --outcome-label Claude --shares 2 --max <usdc> --wallet-address <0x...> --network mainnet
node adapters/wallets/base-mcp/resolve_trade.mjs --input <trade.json> --wallet-address <0x...>
node adapters/wallets/bankr/resolve_trade.mjs --input <trade.json> --api-key <bk_...>
node adapters/actions/precog/positions.mjs --market <id> --wallet-address <0x...>
```

## Hermes shims

When using the Hermes skill export with `FORECASTOS_REPO_ROOT` set:

```txt
node ${HERMES_SKILL_DIR}/scripts/quote-precog.mjs ...
node ${HERMES_SKILL_DIR}/scripts/prepare-precog-buy.mjs ...
node ${HERMES_SKILL_DIR}/scripts/resolve-base-mcp-trade.mjs ...
```

Do not search `adapters/actions/precog` under the Hermes skill install path.

## Safety

- Always quote before prepare/submit
- One trade per operator confirmation
- Do not modify trade parameters after a failure
- Never ask for seed phrases or paste private keys in chat

See `adapters/actions/precog/README.md` and
`adapters/hosts/hermes/skills/prediction/forecast-os/references/hermes-precog-trading.md`
for install and host-specific details.
