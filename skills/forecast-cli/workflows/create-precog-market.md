# Workflow: create Precog market

Preview a market creation from a YAML/JSON spec, submit only after explicit user approval, then check creation status.

**Done when:** a preview ran without `--confirm`, and submit ran only after approval (or status was checked for an existing creation ref).

If Precog status fails, follow [config-and-auth.md](../references/config-and-auth.md). Flag map: [commands.md](../references/commands.md).

## Spec requirements

Required fields: `question`, `resolution_criteria`, `image_url`, `category`, `outcomes`, `end_timestamp`, `collateral_address`.

Optional: `start_timestamp` (defaults to now). Optional CLI flag: `--chain base|arbitrum`.

Launchpad rules:

- `question` must end with `?`, max 65 characters
- ≥2 outcomes; no commas in labels; max 32 characters each
- `image_url` is `http(s)` or `ipfs://`
- `start_timestamp` < `end_timestamp`

Example:

```yaml
question: Which team wins the final?
resolution_criteria: Use the official organizer result.
image_url: ipfs://bafybeigdyrzt
category: Sports
outcomes:
  - North
  - South
end_timestamp: 1800000000
collateral_address: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

## Steps

1. Ensure Precog is ready:

```bash
forecast status --platform precog --output json --no-input
```

2. Preview creation (no submit):

```bash
forecast create market --spec market.yaml --output json --no-input
```

3. Show the preview to the user. Stop unless they explicitly ask to submit.

4. Submit after approval:

```bash
forecast create market --spec market.yaml --confirm --output json --no-input
```

5. Follow up with creation status when a creation ref is available:

```bash
forecast create status PRECOG:8453:UPCOMING:42 --output json --no-input
```

## Completion check

- Preview completed without `--confirm`.
- `--confirm` was used only after user approval.
- Status check used when a creation reference exists.
