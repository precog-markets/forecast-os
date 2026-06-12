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

## Prerequisites

```txt
cd adapters/actions/precog
npm install
```

Default network is Base Sepolia for quotes; wallet adapters require
`--network mainnet` (Base 8453) for submit.

## Agent flow

1. Discover the market with read-only ForecastOS tools (`forecastos_search_markets`,
   `forecastos_get_market_prices`, or Precog API reads).
2. Run `quote.mjs` and paste the **full output verbatim** to the operator.
3. Wait for explicit confirmation.
4. Run `prepare_buy.mjs` or `prepare_sell.mjs` with `--wallet-address` from the
   operator's Bankr/Privy/Base wallet (not a private key).
5. Submit with the matching wallet adapter `resolve_trade.mjs`.
6. Optionally run `positions.mjs --wallet-address <0x...>` to verify holdings.

## Quote flags

| Operator says | Use |
|---------------|-----|
| buy N shares | `--shares N` |
| spend $X | `--cost X` |
| reach X% | `--price 0.X` |
| all in | `--all --wallet-address <0x...>` |

## Commands

```txt
node adapters/actions/precog/quote.mjs --market <id> --outcome <n> --cost 50 --buy
node adapters/actions/precog/prepare_buy.mjs --market <id> --outcome <n> --shares <n> --max <usdc> --wallet-address <0x...> --network mainnet
node adapters/wallets/bankr/resolve_trade.mjs --input <trade.json> --api-key <bk_...>
node adapters/actions/precog/positions.mjs --market <id> --wallet-address <0x...>
```

## Safety

- Always quote before prepare/submit
- One trade per operator confirmation
- Do not modify trade parameters after a failure
- Never ask for seed phrases or paste private keys in chat

See `adapters/actions/precog/README.md` for install and network details.
