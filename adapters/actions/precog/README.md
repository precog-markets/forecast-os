# Precog Trading Actions

Host-agnostic scripts for quoting, buying, selling, and checking positions on
deployed Precog markets. Adapted from
[opencog-basic](https://github.com/0xAstraea/opencog-basic); ForecastOS core
and MCP stay read-only for trading.

## Install

```txt
cd adapters/actions/precog
npm install
```

## Credentials

Provide a local EOA private key using one of:

- `PRIVATE_KEY` environment variable
- `--env-file <path>` pointing at a dotenv file with `PRIVATE_KEY=0x...`
- `--private-key 0x...` (discouraged outside tests)

Scripts never print or return the private key.

## Networks

| Network | Flag | Default? |
|---------|------|----------|
| Base Sepolia (testnet) | `--network sepolia` | Yes |
| Base Mainnet | `--network mainnet` | No — real funds |

Override RPC with `PRECOG_RPC_URL`. Default network is Sepolia unless
`PRECOG_NETWORK=mainnet` or `--network mainnet` is set explicitly.

Mainnet master contract address aligns with
`skill/forecast-os/.forecastos/config.json` when available.

## Commands

Always run `quote` before `buy` or `sell`. Show full quote output and wait for
explicit operator confirmation.

```txt
node adapters/actions/precog/quote.mjs --market <id> --outcome <n> --cost 50 --buy
node adapters/actions/precog/buy.mjs --market <id> --outcome <n> --shares <n> --max <usdc>
node adapters/actions/precog/sell.mjs --market <id> --outcome <n> --shares <n> --min <usdc>
node adapters/actions/precog/positions.mjs --market <id>
```

Quote flags:

| User intent | Flag |
|-------------|------|
| Buy N shares | `--shares N` |
| Spend budget | `--cost X` |
| Target probability | `--price 0.X` |
| Spend full balance | `--all` |

## Safety

- Run scripts sequentially (shared nonce)
- Do not chain buy/sell without per-step operator confirmation
- Do not modify trade parameters after a failure; show the error and stop
- Token approval is handled inside buy scripts

## ForecastOS boundary

Use ForecastOS MCP/skill for read-only market discovery and workflow memory.
Use these scripts only for operator-approved onchain trades.
