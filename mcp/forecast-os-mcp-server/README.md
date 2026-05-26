# ForecastOS MCP Server

Bundled read-only MCP server for ForecastOS agents. This package lives inside the ForecastOS repo at `mcp/forecast-os-mcp-server`.

The server exposes ForecastOS docs, templates, schemas, examples, Precog capability metadata, and workflow guidance from its own `resources/` directory. It does not create markets, fund markets, sign messages, approve tokens, send transactions, read local workflow memory, or mutate `.forecastos` workflow state.

Production V1 is public read-only. Use it as shared context and inspection infrastructure; keep execution in the ForecastOS action bridge, SDK/API, or trusted wallet/action tooling.

## Local stdio

```bash
npm install
npm run build
node dist/stdio.js
```

## Remote HTTP

```bash
npm run build
FORECASTOS_MCP_PORT=3001 node dist/http.js
```

The HTTP endpoint is `/mcp`.

Health endpoints live outside MCP:

- `GET /healthz`
- `GET /health`
- `GET /readyz`
- `GET /ready`

Useful hosting settings:

- `FORECASTOS_MCP_PORT`, default `3001`
- `FORECASTOS_MCP_PATH`, default `/mcp`
- `FORECASTOS_MCP_BODY_LIMIT_BYTES`, default `1000000`
- `FORECASTOS_MCP_RATE_LIMIT_MAX`, default `120`
- `FORECASTOS_MCP_RATE_LIMIT_WINDOW_MS`, default `60000`
- `FORECASTOS_MCP_REQUEST_TIMEOUT_MS`, default `30000`
- `FORECASTOS_MCP_CHARACTER_LIMIT`, default `25000`
- `FORECASTOS_RESOURCE_DIR`, default `./resources` relative to the built project

## Tools

- `forecastos_list_resources`
- `forecastos_get_resource`
- `forecastos_get_schema`
- `forecastos_get_template`
- `forecastos_validate_market_shape`
- `forecastos_explain_next_step`
- `forecastos_get_precog_capabilities`
- `forecastos_get_config_defaults`

All tools are read-only.

Tools default to concise Markdown where useful and accept `response_format: "json"` for structured clients.

## Docker

Build the production HTTP image from this package directory:

```bash
npm run docker:build
```

The Docker build context is this MCP project root. The image bundles this project's `resources/` directory, starts `node dist/http.js`, exposes port `3001`, and sets `FORECASTOS_RESOURCE_DIR=/app/mcp/resources`.

Run locally:

```bash
npm run docker:run
```

Smoke test a built image:

```bash
npm run docker:smoke
```

The image is public read-only. Do not add mutating MCP tools for market creation, funding, signing, token approval, swaps, wallet actions, or workflow mutation.

## Resource Maintenance

MCP resources are first-class public assets owned by this project:

```txt
resources/
  docs/
  templates/
  schemas/
  examples/
  precog/
```

To intentionally refresh them from the bundled ForecastOS skill artifact:

```bash
npm run sync:resources
```

This is a maintainer workflow only. Runtime and Docker should not depend on the skill folder; resources are copied into this package at release time.
