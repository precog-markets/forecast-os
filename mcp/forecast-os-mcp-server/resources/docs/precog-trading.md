# Precog Trading

ForecastOS does not execute onchain trades. When an operator wants to buy or
sell outcome shares on a **deployed** Precog market, use the host-agnostic
action scripts under `adapters/actions/precog/`.

## Boundary

- ForecastOS MCP and skill: read-only market discovery, prices, workflow memory
- `adapters/actions/precog/`: quote, buy, sell, positions with a local EOA key
- Wallet adapters under `adapters/wallets/`: create/fund EIP-712 handoffs only

Do not add trading tools to MCP or `forecastos_action.mjs`.

## Prerequisites

```txt
cd adapters/actions/precog
npm install
```

Set `PRIVATE_KEY` or pass `--env-file <path>`. Default network is Base Sepolia;
mainnet requires explicit `--network mainnet` or `PRECOG_NETWORK=mainnet`.

## Agent flow

1. Discover the market with read-only ForecastOS tools (`forecastos_search_markets`,
   `forecastos_get_market_prices`, or Precog API reads).
2. Run `quote.mjs` and paste the **full output verbatim** to the operator.
3. Wait for explicit confirmation.
4. Run `buy.mjs` or `sell.mjs` with the exact shares and `--max`/`--min` from the quote.
5. Optionally run `positions.mjs` to verify holdings.

## Quote flags

| Operator says | Use |
|---------------|-----|
| buy N shares | `--shares N` |
| spend $X | `--cost X` |
| reach X% | `--price 0.X` |
| all in | `--all` |

## Commands

```txt
node adapters/actions/precog/quote.mjs --market <id> --outcome <n> --cost 50 --buy
node adapters/actions/precog/buy.mjs --market <id> --outcome <n> --shares <n> --max <usdc>
node adapters/actions/precog/sell.mjs --market <id> --outcome <n> --shares <n> --min <usdc>
node adapters/actions/precog/positions.mjs --market <id>
```

## Safety

- Always quote before buy or sell
- Run scripts sequentially (shared nonce)
- Do not chain trades without per-step operator confirmation
- Never modify trade parameters after a failure
- Never ask for seed phrases or paste private keys in chat

See `adapters/actions/precog/README.md` for install and network details.
