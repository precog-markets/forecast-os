# Config and auth

**Done when:** `forecast status --output json --no-input` reports trading ready for the platforms you need, or you have explained a config/auth failure (exit 3). `creation: unsupported` on Polymarket/Kalshi is expected.

## Install

```bash
curl -sSL https://raw.githubusercontent.com/precog-markets/forecast-os/main/install.sh | sh
forecast --version
```

Pin a release with `FORECAST_VERSION=<tag>` before the pipe. The binary installs to `/usr/local/bin/forecast`.

## Config resolution order

1. `--config <path>` on the subcommand
2. `--config <path>` on the root `forecast` command
3. `FORECAST_CONFIG` environment variable
4. `./forecast_config.toml` in the current working directory

TOML sections: `[global]`, `[kalshi]`, `[polymarket]`, `[precog]`. Unknown keys/sections are rejected.

Keep tracked config secret-free. Pass keys via env vars or gitignored `*_file` paths.

## Agent setup pattern

```bash
forecast setup --platform polymarket --no-input --output json
forecast setup --platform precog --no-input --output json
forecast setup --platform kalshi --no-input --output json
forecast config --show --no-input
forecast status --output json --no-input
```

Interactive setup may hold prompted keys in-session only and not write them to TOML. For agents, always use env vars or `*_file` paths with `--no-input`.

## Polymarket

Provide exactly one of: `private_key`, `private_key_file`, or `POLYMARKET_PRIVATE_KEY`.

Relayer (both required when used):

- `relayer_api_key` / `POLYMARKET_RELAYER_API_KEY`
- `relayer_api_key_address` / `POLYMARKET_RELAYER_API_KEY_ADDRESS`

## Precog

Provide exactly one of: `private_key`, `private_key_file`, or `PRECOG_PRIVATE_KEY`.

Create and buy also need `[precog]` RPCs: `base_rpc` and `arbitrum_rpc` (plus `api_url` / `chain`).

## Kalshi

- `api_key_id` / `KALSHI_API_KEY_ID`
- RSA PEM via `private_key`, `private_key_file`, or `KALSHI_PRIVATE_KEY`

## Local store files

| File | Role |
| --- | --- |
| `references.json` | Short market/outcome maps (`POL:n`, `OUT:n`, …) |
| `history.json` | Owned prediction snapshots for `prediction list` |
| `prediction-requests.json` | Idempotent `--request-id` buys |

Default history path: `[global].history_file` or `history.json` next to the config. These files are typically gitignored.

## Secrets hygiene

- `config --show` redacts secrets; still avoid pasting raw keys into chat.
- Prefer env vars in the agent shell over writing secrets into tracked files.
