# ForecastOS [Base MCP](https://mcp.base.org) Wallet Plugin

> [!IMPORTANT]
> ## STOP - COMPLETE BASE MCP ONBOARDING BEFORE WALLET ACTIONS
>
> Before using [Base MCP](https://mcp.base.org) wallet tools for ForecastOS creation or funding, you MUST:
> 1. Call `get_wallets` to detect the available wallet.
> 2. Present the wallet status and [Base MCP](https://mcp.base.org) disclaimer required by the host.
> 3. Use the detected wallet address as the account in ForecastOS EIP-712
>    authorization payloads.
>
> Do not ask the user to paste private keys, seed phrases, raw signing
> credentials, or raw signatures in normal chat.

ForecastOS is a human-approved multi-outcome prediction-market workflow for
drafting, creating, funding, and consuming Precog markets. ForecastOS core
supports configured Base (`8453`) and Arbitrum (`42161`) chains. Use the
ForecastOS skill/action bridge for workflow state and Precog API submission, and
use [Base MCP](https://mcp.base.org) only as the wallet/action adapter for Base.
If chain/collateral is missing from user input, ask first (`USDC on Base` or
`USDC on Arbitrum`) before choosing a wallet/action adapter.

**Supported chain:** Base mainnet (`8453` / `0x2105`), mapped to [Base MCP](https://mcp.base.org) chain
name `base`.

**Host model:** A user may run ForecastOS inside Codex, Claude, Hermes,
OpenClaw, or another host. The host adapter makes ForecastOS available. This
[Base MCP](https://mcp.base.org) plugin supplies the wallet/action mapping and is complementary to that
host adapter.

**ForecastOS boundaries:** ForecastOS MCP is read-only. Do not create mutating
ForecastOS MCP tools. Live ForecastOS execution belongs in
`skill/forecast-os/scripts/forecastos_action.mjs`, a future ForecastOS API/SDK,
or trusted wallet/action tooling.

---

## Read Endpoints And Commands

Use ForecastOS read-only MCP tools when available for docs, templates, examples,
market discovery, and public market context. These tools must not sign, trade,
approve tokens, send transactions, create markets, fund markets, or mutate
`.forecastos` workflow state.

For local workflow state inspection, use the ForecastOS skill scripts:

```txt
node skill/forecast-os/scripts/next_step.mjs --workflow-id <workflow_id>
node skill/forecast-os/scripts/render_review.mjs --workflow-id <workflow_id>
```

For Precog lifecycle status and prediction consumption, use the ForecastOS
action bridge after the workflow has reached the relevant step:

```txt
node skill/forecast-os/scripts/forecastos_action.mjs await_precog_approval --input <json-file>
node skill/forecast-os/scripts/forecastos_action.mjs consume_prediction --input <json-file>
```

## Prepare Create Intent

After the user approves a draft and ForecastOS has persisted the workflow at
`create_market`, prepare the wallet-agnostic Precog create intent:

```txt
node skill/forecast-os/scripts/forecastos_action.mjs prepare_create_intent --input <json-file>
```

The intent includes:

```json
{
  "intent_type": "forecastos.create_market",
  "chain_id": 8453,
  "eip712_typed_data_template": {
    "primaryType": "PrecogMarketAuthorization",
    "domain": {
      "name": "Precog Markets",
      "version": "1",
      "chainId": 8453,
      "verifyingContract": "0x..."
    },
    "message": {
      "action": "CREATE_UPCOMING_MARKET",
      "account": "<wallet_address>",
      "chainId": 8453,
      "nonce": "<next_pending_nonce>"
    }
  },
  "precog_payload_template": {
    "image_url": "https://...",
    "category": "AI"
  }
}
```

## Base MCP Create Mapping

Use the wallet returned by `get_wallets` as the EIP-712 `account`. [Base MCP](https://mcp.base.org) can
prepare the typed-data signing request. Base Account smart-account/WebAuthn
signatures are valid Precog authorization signatures when signed over the
canonical `CREATE_UPCOMING_MARKET` typed data with the current pending nonce.
The request id returned by Base MCP is not the signature. After approval,
`get_request_status` may return a long EIP-1271/ERC-6492-compatible Base Account
hex signature envelope; pass that adapter output through and do not reject it
for not being a compact 65-byte EOA signature.

Run the resolver before asking for the signature:

```txt
node adapters/wallets/base-mcp/resolve_create.mjs \
  --input <prepare-create-intent-json> \
  --wallet-address <base-mcp-wallet-address> \
  --nonce <pending-nonce>
```

Request the returned `base_mcp.sign` payload through [Base MCP](https://mcp.base.org). Then run the
resolver again with `--creator-signature <signature>`. If Precog rejects the
submitted signature, compare the typed data, wallet account, nonce, and chain/domain
fields against ForecastOS signature diagnostics.

Map the [Base MCP](https://mcp.base.org) signing result into the ForecastOS wallet adapter shape:

```json
{
  "event": {
    "image_url": "<intent.precog_payload_template.image_url>",
    "category": "<intent.precog_payload_template.category>",
    "creator_address": "<wallet.address>",
    "creator_signature": "<sign_result.signature>",
    "wallet_provider": "base-mcp",
    "wallet_audit": {
      "provider": "base-mcp",
      "wallet_id": "<wallet.id-or-address>",
      "wallet_address": "<wallet.address>",
      "policy_ids": [],
      "chain_id": 8453,
      "nonce": "<typed_data.message.nonce>",
      "method": "sign",
      "signature_compatibility": "base_account_eip1271_erc6492_supported_for_precog_create"
    }
  },
  "next_action": "publish_approved_market"
}
```

Then pass the adapter output to the persisted ForecastOS `create_market`
workflow via `publish_approved_market`:

```txt
node skill/forecast-os/scripts/forecastos_action.mjs publish_approved_market \
  --input <workflow-id-json> \
  --wallet-output <wallet-adapter-output-json>
```

Prefer passing the saved [Base MCP](https://mcp.base.org) signing result through `--wallet-output` /
`--adapter-output` rather than rebuilding create input with shell variables.

Creation is not a `send_calls` flow. It is an EIP-712 authorization signature
followed by a human-approved Precog API submission through ForecastOS.

## Prepare Funding Intent

Only start funding after Precog reports the upcoming market as `VALIDATED` and
the operator explicitly approves funding.

Prepare the wallet-agnostic funding intent:

```txt
node skill/forecast-os/scripts/forecastos_action.mjs prepare_funding_intent --input <json-file>
```

The current ForecastOS funding intent documents amount, collateral context,
policy prerequisites, token-approval guidance, and EIP-712 authorization fields.
It does not by itself guarantee a [Base MCP](https://mcp.base.org) `send_calls` batch.

## Base MCP Funding Mapping

Use `resolve_funding.mjs` when a ForecastOS funding resolver, wallet adapter, or
Precog transaction builder returns an unsigned calldata envelope or ordered
transaction batch:

```txt
node adapters/wallets/base-mcp/resolve_funding.mjs \
  --input <prepare-funding-intent-json> \
  --prepare-response <unsigned-calldata-json> \
  --wallet-address <wallet.address> \
  --nonce <next_pending_nonce>
```

Single-call envelope:

```json
{
  "ok": true,
  "data": {
    "to": "0x...",
    "data": "0x...",
    "value": "0x0",
    "chainId": 8453
  }
}
```

Ordered batch:

```json
{
  "transactions": [
    {
      "step": "approve",
      "to": "0x...",
      "data": "0x...",
      "value": "0x0",
      "chainId": 8453
    },
    {
      "step": "fund",
      "to": "0x...",
      "data": "0x...",
      "value": "0x0",
      "chainId": 8453
    }
  ]
}
```

The resolver maps every transaction to [Base MCP](https://mcp.base.org) `send_calls`:

```json
{
  "chain": "base",
  "calls": [
    { "to": "<tx.to>", "value": "<tx.value || 0x0>", "data": "<tx.data>" }
  ]
}
```

After the user approves and [Base MCP](https://mcp.base.org) returns the transaction hash, fetch the
wallet's post-transaction pending nonce and run the resolver again with
`--tx-hash` and `--nonce`. It will emit a Base MCP signing request. After Base
MCP returns the funding signature, run the resolver a final time with
`--tx-hash`, `--nonce`, and `--funder-signature`; it will emit the standard
ForecastOS `fund_market` adapter output:

Base Account signatures may be smart-wallet signatures verified through
EIP-1271, with ERC-6492 relevant before deployment. Those Base MCP signature
shapes are intentionally accepted for funding, including smart-wallet/WebAuthn
signatures. For funding, run `send_calls` first, then sign `FUND_UPCOMING_MARKET`
with the post-transaction pending nonce before submitting to Precog.

```json
{
  "funding_request": {
    "upcoming_market": 123,
    "amount": "1",
    "tx_hash": "0xTransactionHash",
    "funder_address": "<wallet.address>",
    "funder_signature": "<sign_result.signature>"
  },
  "wallet_audit": {
    "provider": "base-mcp"
  },
  "next_action": "fund_market"
}
```

If no unsigned calldata envelope or ordered transaction batch is available, do not invent calldata.
Use another configured ForecastOS wallet/action adapter or direct the operator
to `https://core.precog.markets/launchpad/`.

## Orchestration Pattern

```txt
1. Host adapter loads ForecastOS in Codex, Claude, Hermes, OpenClaw, or similar
2. ForecastOS draft -> user approval
3. get_wallets -> wallet address and Base MCP onboarding/disclaimer
4. prepare_create_intent -> EIP-712 create authorization
5. Base MCP sign -> creator_signature
6. publish_approved_market -> Precog upcoming market
7. await_precog_approval until status is VALIDATED
8. prepare_funding_intent -> funding authorization/context
9. If an unsigned funding envelope or batch exists:
   a. resolve_funding.mjs -> Base MCP send_calls payload
   b. Base MCP send_calls -> tx_hash
   c. fetch the wallet post-transaction pending nonce
   d. resolve_funding.mjs --tx-hash --nonce -> Base MCP sign payload
   e. Base MCP sign -> funder_signature
   f. resolve_funding.mjs --tx-hash --nonce --funder-signature -> fund_market payload
   g. fund_market with tx_hash, funder_address, and funder_signature
10. If no funding batch exists, use configured wallet/action tooling or launchpad
11. consume_prediction only after the upcoming market is DEPLOYED
```

## Chain Mapping

```txt
8453 / 0x2105 -> base
```

Reject or stop for any other ForecastOS `chain_id` unless ForecastOS config and
Base MCP support have both been updated intentionally.

If ForecastOS runs with `chain_id: 42161` (Arbitrum), this Base MCP plugin is
not the correct adapter path.
