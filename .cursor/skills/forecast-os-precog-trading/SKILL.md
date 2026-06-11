---
name: forecast-os-precog-trading
description: Quotes, buys, sells, and checks positions on deployed Precog markets using adapters/actions/precog scripts. Use when the user wants to trade outcome shares, get a Precog quote, buy/sell shares, or check positions after read-only ForecastOS market context.
---

# ForecastOS Precog Trading

## Boundary

- **Read context** with ForecastOS MCP or skill (search, prices, market detail)
- **Trade** with `adapters/actions/precog/` scripts only after operator confirmation
- ForecastOS core never signs trades

## Install once

```txt
cd adapters/actions/precog
npm install
```

Credentials: `PRIVATE_KEY` env or `--env-file <path>`.

## Required flow

1. Identify market id and outcome from read-only context
2. `quote.mjs` — paste full output verbatim
3. Operator confirms
4. `buy.mjs` or `sell.mjs` with exact quote parameters
5. Optional `positions.mjs`

## Quote flag mapping

| User says | Flag |
|-----------|------|
| buy N shares | `--shares N` |
| spend $X | `--cost X` |
| reach X% | `--price 0.X` |
| all in | `--all` |

## Commands

```txt
node adapters/actions/precog/quote.mjs --market <id> --outcome <n> --cost 50 --buy --network sepolia
node adapters/actions/precog/buy.mjs --market <id> --outcome <n> --shares <n> --max <from-quote> --network sepolia
node adapters/actions/precog/sell.mjs --market <id> --outcome <n> --shares <n> --min <from-quote> --network sepolia
node adapters/actions/precog/positions.mjs --market <id> --network sepolia
```

Default network is Base Sepolia. Require explicit opt-in for `--network mainnet`.

## Safety

- Quote before every buy or sell
- Sequential scripts only (shared nonce)
- No automated trade chains without per-step confirmation
- Never paste private keys in chat

## References

- `skill/forecast-os/references/precog-trading.md`
- `adapters/actions/precog/README.md`
