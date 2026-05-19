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
const precogConfig = JSON.parse(await readFile(join(root, ".forecastos", "config.json"), "utf8"));
const agentMetadata = await readFile(join(root, "agents", "openai.yaml"), "utf8");
const tools = await listForecastOSTools();
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);

assert(/^---\nname: forecast-os\n/m.test(skill), "SKILL.md needs hyphen-case forecast-os name frontmatter");
assert(
  /^description: .+ForecastOS.+multi-outcome.+\.forecastos.+read-only MCP.+action bridge.+Precog.+fund.+no wallet custody.+no signing/m.test(skill),
  "SKILL.md description needs ForecastOS trigger, boundaries, and action context",
);
assert(frontmatter, "SKILL.md needs YAML frontmatter");
assert(
  frontmatter[1].trim().split(/\r?\n/).map((line) => line.split(":")[0]).join(",") === "name,description",
  "SKILL.md frontmatter must only use name and description",
);
assert(agentMetadata.includes('display_name: "ForecastOS"'), "agents/openai.yaml needs ForecastOS display name");
assert(
  agentMetadata.includes("allow_implicit_invocation: true"),
  "agents/openai.yaml should allow implicit invocation",
);
await assertDir(join(root, "agents"));
await assertDir(join(root, "references"));
await assertDir(join(root, "scripts"));
await assertDir(join(root, "assets"));
await assertDir(join(root, ".forecastos"));
assert(
  precogConfig.precog?.api_root === "https://tracker.precog.market/",
  ".forecastos/config.json needs the public Precog API root",
);
assert(
  precogConfig.precog?.open_api_key,
  ".forecastos/config.json needs the public open_api_key",
);
assert(
  precogConfig.precog?.deployed_master_address,
  ".forecastos/config.json needs deployed_master_address",
);
await assertMissing(join(root, "agents", "metadata.yaml"), "agents/metadata.yaml should not exist");
await assertMissing(join(root, ".forecastos", "config.local.json"), ".forecastos/config.local.json should not be shipped");
await assertMissing(join(root, "README.md"), "README.md should not exist");
await assertMissing(join(root, "CHANGELOG.md"), "CHANGELOG.md should not exist");
await assertMissing(join(root, "QUICK_REFERENCE.md"), "QUICK_REFERENCE.md should not exist");
await assertMissing(join(root, "INSTALLATION_GUIDE.md"), "INSTALLATION_GUIDE.md should not exist");
await assertMissing(join(root, "evals"), "evals should not exist");
await assertMissing(join(root, "agents", "grader.md"), "grader should not exist");
await assertMissing(join(root, "agents", "analyzer.md"), "analyzer should not exist");
await assertMissing(join(root, "agents", "comparator.md"), "comparator should not exist");
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
      skill: "forecast-os",
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

async function assertMissing(path, message) {
  try {
    await stat(path);
    assert(false, message);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
}
