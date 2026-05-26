import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { registerForecastOSResources } from "./resources/registerResources.js";
import { registerForecastOSTools } from "./tools/registerTools.js";

export function createForecastOSMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
      instructions:
        "ForecastOS MCP is read-only. Use it for docs, templates, schemas, examples, capability metadata, and workflow inspection. Do not use MCP for market creation, funding, signing, token approval, swaps, wallet custody, or workflow mutation.",
    },
  );

  registerForecastOSResources(server);
  registerForecastOSTools(server);
  return server;
}
