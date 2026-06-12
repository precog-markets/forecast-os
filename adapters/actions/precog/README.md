# Precog Trading Actions

Host-agnostic scripts for quoting, preparing, and checking positions on
deployed Precog markets. Signing and submission go through wallet adapters
(Bankr, Privy, Base MCP) — **no local `PRIVATE_KEY`**.

Adapted from [opencog-basic](https://github.com/0xAstraea/opencog-basic); ForecastOS core
and MCP stay read-only for trading.

## Install

```txt
cd adapters/actions/precog
npm install
```

## Networks

| Network | Flag | Default? |
|---------|------|----------|
| Base Sepolia (testnet) | `--network sepolia` | Yes |
| Base Mainnet | `--network mainnet` | No — real funds |

Override RPC with `PRECOG_RPC_URL`. Default network is Sepolia unless
`PRECOG_NETWORK=mainnet` or `--network mainnet` is set explicitly.

Mainnet master contract address aligns with
`skill/forecast-os/.forecastos/config.json` when available.

Wallet adapters (Bankr, Privy, Base MCP) currently submit on **Base mainnet (8453)** only.
Use `--network mainnet` before prepare + resolve_trade.

## Flow

1. **Quote** (read-only): `quote.mjs`
2. **Prepare** unsigned calldata: `prepare_buy.mjs` or `prepare_sell.mjs` with `--wallet-address`
3. **Submit** via wallet adapter: `adapters/wallets/<provider>/resolve_trade.mjs`

Always run `quote` before prepare. Show full quote output and wait for
explicit operator confirmation.

```txt
node adapters/actions/precog/quote.mjs --market 4 --outcome 1 --cost 50 --buy
node adapters/actions/precog/prepare_buy.mjs --market 4 --outcome 1 --shares 312 --max 99.44 --wallet-address 0x... --network mainnet > trade.json
node adapters/wallets/bankr/resolve_trade.mjs --input trade.json --api-key bk_...
```

Sell:

```txt
node adapters/actions/precog/prepare_sell.mjs --market 4 --outcome 1 --shares 100 --min 45 --wallet-address 0x... --network mainnet > trade.json
node adapters/wallets/privy/resolve_trade.mjs --input trade.json --wallet-id <id>
```

Positions (read-only, needs wallet address):

```txt
node adapters/actions/precog/positions.mjs --market 4 --wallet-address 0x...
```

## Quote flags

| User intent | Flag |
|-------------|------|
| Outcome by name | `--outcome-label Claude` |
| Outcome by index | `--outcome 1` (1-based) |
| Buy N shares | `--shares N` |
| Spend budget | `--cost X` |
| Target probability | `--price 0.X` |
| Spend full balance | `--all` (requires `--wallet-address`) |

## Wallet adapters

| Provider | Resolver | Credentials |
|----------|----------|-------------|
| Bankr | `adapters/wallets/bankr/resolve_trade.mjs` | `BANKR_API_KEY` or `--api-key` |
| Privy | `adapters/wallets/privy/resolve_trade.mjs` | `PRIVY_APP_ID`, `PRIVY_APP_SECRET` |
| Base MCP | `adapters/wallets/base-mcp/resolve_trade.mjs` | Operator runs Base MCP `send_calls` |

`buy.mjs` and `sell.mjs` are deprecated stubs that print this flow.

## Safety

- Quote → prepare → wallet submit; one trade per operator confirmation
- Do not modify trade parameters after a failure; show the error and stop
- Token approval is included in prepared buy transactions when needed
- Never ask for seed phrases or local private keys in chat

## ForecastOS boundary

Use ForecastOS MCP/skill for read-only market discovery and workflow memory.
Use prepare scripts + wallet adapters only for operator-approved onchain trades.
