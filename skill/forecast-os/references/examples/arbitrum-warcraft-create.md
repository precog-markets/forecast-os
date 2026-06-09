# Arbitrum Warcraft Create Example

Use this example when an operator or agent needs a concrete Base/Arbitrum create
flow for a multi-outcome market on Precog.

## User Prompt

```txt
Create a prediction market about the viewership of a Warcraft tournament in 2026 on Arbitrum.
```

## Runnable Example

From `skill/forecast-os`:

```txt
node scripts/examples/arbitrum-warcraft-2026/run_example.mjs
```

The runner executes draft, approval, and create-intent preparation through the
normal ForecastOS bridge. It writes intermediate outputs under
`.forecastos/examples/warcraft-arb/` and prints the exact Privy sign + publish
commands for the final live submit step.

## Manual Step-By-Step

### 1. Draft

```txt
node scripts/forecastos_action.mjs run_skill_step --input scripts/examples/arbitrum-warcraft-2026/01_draft.json
```

Expected: `state.step = await_approval`, Arbitrum chain context persisted.

### 2. Approve

Copy `result.state` from step 1 into `02_approve.json` under `"state"`, then:

```txt
node scripts/forecastos_action.mjs run_skill_step --input scripts/examples/arbitrum-warcraft-2026/02_approve.json
```

Expected: `state.step = create_market` and a create intent in `tool_result` when
no wallet signature is present yet.

### 3. Sign With Privy (Arbitrum)

Use the create intent from step 2:

```txt
node ../../adapters/wallets/privy/resolve_create.mjs --input <create-intent.json> --wallet-id <privy-wallet-id>
```

Privy supports Arbitrum (`42161`) when the intent chain matches.

### 4. Publish

```txt
node scripts/forecastos_action.mjs publish_approved_market --workflow-id <workflow_id_from_step_2> --wallet-output <privy-output.json>
```

Expected: Precog create succeeds, workflow advances to `await_precog_approval`,
and the result includes a launchpad URL on chain `42161`.

## Do Not

- Hand-write `.forecastos/drafts/*` or `.forecastos/workflows/*`
- Run `draft_market file.json` or `run_skill_step file.json` without `--input`
  unless using positional shorthand after the action name
- Use Base MCP for Arbitrum creation
- Paste placeholder `<wallet_signature>` values into publish calls

## Chain Context

Arbitrum defaults for this example:

- `chain_id`: `42161`
- `collateral_symbol`: `USDC`
- `collateral_address`: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`

These are passed through draft and approval events; ForecastOS resolves the
matching Arbitrum deployed master and collateral from config.
