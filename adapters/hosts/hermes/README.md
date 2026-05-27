# Hermes Adapter

This adapter exposes ForecastOS to Hermes as a native plugin without copying or
reimplementing the ForecastOS skill.

## Local Install

Preferred local development install:

```txt
ln -s /path/to/forecast-os/adapters/hosts/hermes/forecast-os ~/.hermes/plugins/forecast-os
```

When symlinking, the adapter can resolve the repo-local skill folder:

```txt
skill/forecast-os
```

If you copy only `adapters/hosts/hermes/forecast-os` into `~/.hermes/plugins/forecast-os`,
set `FORECASTOS_SKILL_DIR` to the canonical skill folder:

```txt
FORECASTOS_SKILL_DIR=/path/to/forecast-os/skill/forecast-os
```

If `node` is not directly executable from the Hermes Python environment, set
`FORECASTOS_NODE_BIN` to the full Node executable path.

Then enable the plugin in Hermes:

```txt
hermes plugins enable forecast-os
```

## What This Adapter Does

- Registers the existing ForecastOS skill with Hermes as `forecast-os:forecast-os`.
- Registers one Hermes tool, `forecastos_action`.
- Invokes the existing Node action bridge at
  `skill/forecast-os/scripts/forecastos_action.mjs`.

## What This Adapter Does Not Do

- It does not copy `skill/forecast-os` into the plugin folder.
- It does not reimplement ForecastOS workflow logic in Python.
- It does not add mutating MCP tools.
- It does not sign transactions, custody wallets, fetch nonces, approve tokens, or
  bypass the existing ForecastOS approval rules.

ForecastOS logic remains in `skill/forecast-os`. This adapter is only a Hermes
compatibility wrapper.
