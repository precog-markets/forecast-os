---
name: forecast-os-precog-trading
description: Quotes, prepares, and submits Precog trades via wallet adapters (Bankr, Privy, Base MCP). Use when the user wants to trade outcome shares, get a Precog quote, buy/sell shares, or check positions after read-only ForecastOS market context.
---

# ForecastOS Precog Trading

## Boundary

- **Read context** with ForecastOS MCP or skill (search, prices, market detail)
- **Prepare** unsigned trades with `adapters/actions/precog/` (no private keys)
- **Submit** with `adapters/wallets/{bankr,privy,base-mcp}/resolve_trade.mjs`
- ForecastOS core never signs trades

## Install once

```txt
cd adapters/actions/precog
npm install
```

Never ask for `PRIVATE_KEY`. Use the operator's wallet address from Bankr, Privy, or Base MCP.

## Required flow

1. Identify market id and outcome from read-only context
2. `quote.mjs` — paste full output verbatim
3. Operator confirms
4. `prepare_buy.mjs` or `prepare_sell.mjs` with `--wallet-address` and quote parameters
5. `resolve_trade.mjs` on the chosen wallet adapter (`--network mainnet` for submit)
6. Optional `positions.mjs --wallet-address <0x...>`

## Quote flag mapping

| User says | Flag |
|-----------|------|
| buy N shares | `--shares N` |
| spend $X | `--cost X` |
| reach X% | `--price 0.X` |
| all in | `--all --wallet-address <0x...>` |

## Commands

```txt
node adapters/actions/precog/quote.mjs --market <id> --outcome <n> --cost 50 --buy
node adapters/actions/precog/prepare_buy.mjs --market <id> --outcome <n> --shares <n> --max <from-quote> --wallet-address <0x...> --network mainnet > trade.json
node adapters/wallets/bankr/resolve_trade.mjs --input trade.json --api-key <bk_...>
node adapters/actions/precog/positions.mjs --market <id> --wallet-address <0x...>
```

Wallet adapters submit on Base mainnet (8453). Sepolia is fine for quotes only.

## Safety

- Quote before every prepare/submit
- One trade per operator confirmation
- No automated trade chains
- Never paste private keys in chat

## References

- `skill/forecast-os/references/precog-trading.md`
- `adapters/actions/precog/README.md`
