#!/usr/bin/env node
// Validates that the ForecastOS skill package keeps its expected shape and safety boundaries.
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { listForecastOSTools } from "../mcp/tools.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skill = await readFile(join(root, "SKILL.md"), "utf8");
const mcpConfig = JSON.parse(await readFile(join(root, "mcp.json"), "utf8"));
const agentMetadata = await readFile(join(root, "agents", "metadata.yaml"), "utf8");
const tools = await listForecastOSTools();

assert(/^---\nname: forecast_os\n/m.test(skill), "SKILL.md needs name frontmatter");
assert(/^description: .+/m.test(skill), "SKILL.md needs description frontmatter");
assert(agentMetadata.includes('display_name: "ForecastOS"'), "agents/metadata.yaml needs ForecastOS display name");
assert(
  agentMetadata.includes("allow_implicit_invocation: true"),
  "agents/metadata.yaml should allow implicit invocation",
);
await assertDir(join(root, "agents"));
await assertDir(join(root, "references"));
await assertDir(join(root, "scripts"));
await assertDir(join(root, "assets"));
assert(
  JSON.stringify(mcpConfig.servers.forecastos.args) === JSON.stringify(["./mcp/server.js"]),
  "mcp.json must point at ./mcp/server.js",
);

const forbidden = /(create|fund|draft_market|run_skill_step|wallet|sign|swap)/;
for (const tool of tools) {
  assert(!forbidden.test(tool.name), `MCP tool is not read-only enough: ${tool.name}`);
}

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      skill: "forecast_os",
      read_only_mcp_tools: tools.map((tool) => tool.name),
    },
    null,
    2,
  ) + "\n",
);

function assert(condition, message) {
  if (!condition) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

async function assertDir(path) {
  assert((await stat(path)).isDirectory(), `${path} must be a directory`);
}
