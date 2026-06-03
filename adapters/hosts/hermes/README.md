# Hermes Host Adapter

ForecastOS should be installed in Hermes as a normal skill first. Hermes skills
are discoverable through `skills_list`, slash commands, and `skill_view`; the
Python plugin wrapper is optional advanced infrastructure for users who
explicitly want a Hermes tool.

## Skill-First Install

Preferred local development install:

```txt
mkdir -p ~/.hermes/skills/prediction
ln -s /path/to/forecast-os/adapters/hosts/hermes/skills/prediction/forecast-os ~/.hermes/skills/prediction/forecast-os
```

For repo-local development without copying, Hermes can scan an external skill
directory. Add the ForecastOS Hermes skills directory to `skills.external_dirs`
in `~/.hermes/config.yaml`:

```yaml
skills:
  external_dirs:
    - /path/to/forecast-os/adapters/hosts/hermes/skills
```

If the Hermes skill is copied away from the ForecastOS repo, set
`FORECASTOS_REPO_ROOT` to the ForecastOS repo/runtime root before using live
workflow commands:

```txt
FORECASTOS_REPO_ROOT=/path/to/forecast-os
```

After updating ForecastOS, either reinstall/symlink this Hermes skill export
again or keep `FORECASTOS_REPO_ROOT` pointed at the updated repo root. Copied
Hermes installs can otherwise keep calling an older action bridge.

If `node` is not directly executable from the Hermes environment, set
`FORECASTOS_NODE_BIN` to the full Node executable path.

Run the read-only setup check from Hermes or a shell:

```txt
node ~/.hermes/skills/prediction/forecast-os/scripts/check-hermes-setup.mjs
```

## Privy Wallet Handoff

Hermes should call the ForecastOS Privy adapter wrapper instead of constructing
Privy wallet RPC requests itself:

```txt
node ~/.hermes/skills/prediction/forecast-os/scripts/resolve-privy-create.mjs --input <prepare-create-intent-json> --wallet-id <privy-wallet-id>
```

The canonical adapter owns Privy's strict EIP-712 shape: `params` contains only
`typed_data`, typed data uses `primary_type`, and `caip2` is omitted for the
current wallet RPC endpoint. If Privy returns a strict schema error, treat that
as an adapter regression. If Privy returns `PRIVY_POLICY_DENIED` or “RPC request
denied due to policy violation,” ask the operator to update the selected wallet
policy to allow `eth_signTypedData_v4`; include `eth_sendTransaction` too if the
wallet will later fund a market.

## Optional Plugin Wrapper

The legacy plugin wrapper remains available at:

```txt
adapters/hosts/hermes/forecast-os
```

Use it only when a Hermes plugin-provided tool named `forecastos_action` is
explicitly desired:

```txt
ln -s /path/to/forecast-os/adapters/hosts/hermes/forecast-os ~/.hermes/plugins/forecast-os
hermes plugins enable forecast-os
```

If you copy only the plugin wrapper into `~/.hermes/plugins/forecast-os`, set
`FORECASTOS_SKILL_DIR` to the canonical skill folder:

```txt
FORECASTOS_SKILL_DIR=/path/to/forecast-os/skill/forecast-os
```

## Boundaries

- The Hermes skill is the primary discoverable integration.
- The plugin wrapper is optional and does not replace the skill package.
- ForecastOS workflow logic remains in `skill/forecast-os`.
- The action bridge remains `skill/forecast-os/scripts/forecastos_action.mjs`.
- Neither the skill nor plugin signs transactions, custodies wallets, fetches
  nonces, approves tokens, or bypasses ForecastOS approval rules.
