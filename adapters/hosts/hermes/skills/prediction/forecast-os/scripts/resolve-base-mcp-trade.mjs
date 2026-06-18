#!/usr/bin/env node
import { BASE_MCP_TRADE_REL } from "./repo-discovery.mjs";
import { spawnRepoScript } from "./spawn-repo-script.mjs";

await spawnRepoScript({ relPath: BASE_MCP_TRADE_REL, label: "Base MCP trade resolver" });
