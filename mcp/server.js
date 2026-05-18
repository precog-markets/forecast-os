#!/usr/bin/env node
// Runs the dependency-free read-only ForecastOS MCP server over stdio.
import readline from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMcpContext,
  listForecastOSResources,
  readForecastOSResource,
} from "./resources.js";
import { callForecastOSTool, listForecastOSTools } from "./tools.js";

const context = createMcpContext();

if (isMainModule()) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let request;
    try {
      request = JSON.parse(line);
      const result = await handleRequest(request);
      if (request.id !== undefined) send({ jsonrpc: "2.0", id: request.id, result });
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: request?.id ?? null,
        error: { code: -32000, message: error.message },
      });
    }
  });
}

export async function handleRequest(request) {
  if (request.method === "initialize") {
    return {
      protocolVersion: request.params?.protocolVersion ?? "2024-11-05",
      capabilities: { resources: {}, tools: {} },
      serverInfo: { name: "forecast_os-readonly", version: "0.1.0" },
    };
  }
  if (request.method === "resources/list") return { resources: await listForecastOSResources() };
  if (request.method === "resources/read") {
    return readForecastOSResource(request.params?.uri, context);
  }
  if (request.method === "tools/list") return { tools: await listForecastOSTools() };
  if (request.method === "tools/call") {
    return callForecastOSTool(
      request.params?.name,
      request.params?.arguments ?? {},
      context,
    );
  }
  if (request.method === "notifications/initialized") return {};
  throw new Error(`Unsupported MCP method: ${request.method}`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}
