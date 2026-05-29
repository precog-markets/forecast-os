#!/usr/bin/env node
// Read-only setup check for the ForecastOS Claude host adapter.
import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(process.env.FORECASTOS_REPO_ROOT ?? ".");
const checks = await Promise.all([
  checkFile("skill_config", join(repoRoot, "skill", "forecast-os", ".forecastos", "config.json")),
  checkFile("action_bridge", join(repoRoot, "skill", "forecast-os", "scripts", "forecastos_action.mjs")),
  checkFile("mcp_stdio", join(repoRoot, "mcp", "forecast-os-mcp-server", "dist", "stdio.js")),
  checkClaudeMcpConfig(join(repoRoot, "adapters", "hosts", "claude", ".mcp.json")),
]);

process.stdout.write(
  JSON.stringify(
    {
      ok: checks.every((check) => check.ok),
      repo_root: repoRoot,
      node: process.version,
      checks,
    },
    null,
    2,
  ) + "\n",
);

if (!checks.every((check) => check.ok)) process.exit(1);

async function checkFile(name, path) {
  try {
    await access(path);
    return { name, ok: true, path };
  } catch (error) {
    return { name, ok: false, path, error: error.code ?? error.message };
  }
}

async function checkClaudeMcpConfig(path) {
  try {
    const config = JSON.parse(await readFile(path, "utf8"));
    return {
      name: "claude_mcp_template",
      ok: Boolean(config.mcpServers?.forecastos) && !config.servers,
      path,
    };
  } catch (error) {
    return { name: "claude_mcp_template", ok: false, path, error: error.code ?? error.message };
  }
}
