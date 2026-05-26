#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createForecastOSMcpServer } from "./index.js";

const server = createForecastOSMcpServer();
await server.connect(new StdioServerTransport());
