import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { RESOURCE_ROOT } from "../constants.js";
import type { ForecastOSResource } from "../types.js";
import { kalshiCapabilities, polymarketCapabilities } from "../tools/externalMarkets.js";

export const STATIC_RESOURCES: Record<string, ForecastOSResource> = {
  "forecastos://docs/skill": {
    uri: "forecastos://docs/skill",
    name: "ForecastOS skill instructions",
    path: "docs/skill.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/architecture": {
    uri: "forecastos://docs/architecture",
    name: "ForecastOS architecture",
    path: "docs/architecture.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/workflow": {
    uri: "forecastos://docs/workflow",
    name: "ForecastOS workflow",
    path: "docs/workflow.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/safety": {
    uri: "forecastos://docs/safety",
    name: "ForecastOS safety",
    path: "docs/safety.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/memory": {
    uri: "forecastos://docs/memory",
    name: "ForecastOS persistent workflow memory",
    path: "docs/memory.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/mcp": {
    uri: "forecastos://docs/mcp",
    name: "ForecastOS MCP",
    path: "docs/mcp.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/remote-mcp": {
    uri: "forecastos://docs/remote-mcp",
    name: "ForecastOS remote MCP architecture",
    path: "docs/remote-mcp.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/install": {
    uri: "forecastos://docs/install",
    name: "ForecastOS install and local use",
    path: "docs/install.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/actions": {
    uri: "forecastos://docs/actions",
    name: "ForecastOS actions",
    path: "docs/actions.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/action-policy": {
    uri: "forecastos://docs/action-policy",
    name: "ForecastOS action policy",
    path: "docs/action-policy.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/tool-schemas": {
    uri: "forecastos://docs/tool-schemas",
    name: "ForecastOS action input schemas",
    path: "docs/tool-schemas.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/wallet-adapters": {
    uri: "forecastos://docs/wallet-adapters",
    name: "ForecastOS wallet adapters",
    path: "docs/wallet-adapters.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/external-markets": {
    uri: "forecastos://docs/external-markets",
    name: "ForecastOS external market reads",
    path: "docs/external-markets.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/providers/polymarket-read": {
    uri: "forecastos://docs/providers/polymarket-read",
    name: "ForecastOS Polymarket read-only provider",
    path: "docs/providers/polymarket-read.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/providers/kalshi-read": {
    uri: "forecastos://docs/providers/kalshi-read",
    name: "ForecastOS Kalshi read-only provider",
    path: "docs/providers/kalshi-read.md",
    mimeType: "text/markdown",
  },
  "forecastos://templates/multi-outcome-market": {
    uri: "forecastos://templates/multi-outcome-market",
    name: "Multi-outcome market template",
    path: "templates/multi-outcome-market.md",
    mimeType: "text/markdown",
  },
  "forecastos://schemas/actions": {
    uri: "forecastos://schemas/actions",
    name: "ForecastOS action JSON schemas",
    path: "schemas/actions.json",
    mimeType: "application/json",
  },
  "forecastos://examples/agent-launch": {
    uri: "forecastos://examples/agent-launch",
    name: "Agent launch example",
    path: "examples/agent-launch.md",
    mimeType: "text/markdown",
  },
  "forecastos://examples/funding-handoff": {
    uri: "forecastos://examples/funding-handoff",
    name: "Funding handoff example",
    path: "examples/funding-handoff.md",
    mimeType: "text/markdown",
  },
  "forecastos://examples/full-workflow": {
    uri: "forecastos://examples/full-workflow",
    name: "Full workflow example",
    path: "examples/full-workflow.md",
    mimeType: "text/markdown",
  },
};

export function listForecastOSResources(): ForecastOSResource[] {
  return [
    ...Object.values(STATIC_RESOURCES),
    {
      uri: "forecastos://precog/capabilities",
      name: "ForecastOS Precog capability metadata",
      mimeType: "application/json",
    },
    {
      uri: "forecastos://precog/config-defaults",
      name: "ForecastOS public Precog config defaults",
      mimeType: "application/json",
    },
    {
      uri: "forecastos://providers/polymarket/capabilities",
      name: "ForecastOS Polymarket read-only capability metadata",
      mimeType: "application/json",
    },
    {
      uri: "forecastos://providers/kalshi/capabilities",
      name: "ForecastOS Kalshi read-only capability metadata",
      mimeType: "application/json",
    },
  ];
}

export async function readForecastOSResource(uri: string): Promise<{
  uri: string;
  mimeType: string;
  text: string;
}> {
  const resource = STATIC_RESOURCES[uri];
  if (resource?.path) {
    return {
      uri,
      mimeType: resource.mimeType,
      text: await readFile(join(RESOURCE_ROOT, resource.path), "utf8"),
    };
  }
  if (uri === "forecastos://precog/capabilities") {
    return jsonResource(uri, precogCapabilities());
  }
  if (uri === "forecastos://precog/config-defaults") {
    return jsonResource(uri, await precogConfigDefaults());
  }
  if (uri === "forecastos://providers/polymarket/capabilities") {
    return jsonResource(uri, polymarketCapabilities());
  }
  if (uri === "forecastos://providers/kalshi/capabilities") {
    return jsonResource(uri, kalshiCapabilities());
  }
  throw new Error(
    `Unknown ForecastOS MCP resource '${uri}'. Use forecastos_list_resources to discover valid read-only resources.`,
  );
}

export function precogCapabilities() {
  return {
    mode: "read_only_context",
    market_type_default: "multi_outcome",
    remote_mcp_role: "shared docs, templates, schemas, examples, capabilities, and read-only inspection",
    local_execution: "scripts/forecastos_action.mjs",
    live_mutation_tools_exposed_by_mcp: false,
    wallet_custody: false,
    signing: false,
    token_approval: false,
    create_endpoint: "POST /api/v1/create-upcoming-market/",
    fund_endpoint: "POST /api/v1/fund-upcoming-market/",
    upcoming_market_status_endpoint: "GET /api/v1/upcoming-markets/",
    deployed_market_endpoint: "GET /api/v1/markets/",
    launchpad_fallback_url: "https://core.precog.markets/launchpad/",
  };
}

export async function precogConfigDefaults() {
  const config = await readJson(join(RESOURCE_ROOT, "precog", "config-defaults.json"));
  const precog = config.precog ?? {};
  return {
    api_root: precog.api_root,
    chain_id: precog.chain_id,
    deployed_master_address: precog.deployed_master_address,
    default_collateral_address: precog.default_collateral_address,
    default_collateral_symbol: precog.default_collateral_symbol,
    signature_actions: precog.signature_actions,
    open_api_key: "<redacted>",
  };
}

async function readJson(path: string): Promise<Record<string, any>> {
  return JSON.parse(await readFile(path, "utf8"));
}

function jsonResource(uri: string, value: unknown) {
  return { uri, mimeType: "application/json", text: `${JSON.stringify(value, null, 2)}\n` };
}
