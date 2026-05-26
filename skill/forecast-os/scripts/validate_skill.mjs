#!/usr/bin/env node
// Validates that the ForecastOS skill package keeps its expected shape and safety boundaries.
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(root));
const skill = await readFile(join(root, "SKILL.md"), "utf8");
const precogConfig = JSON.parse(await readFile(join(root, ".forecastos", "config.json"), "utf8"));
const agentMetadata = await readFile(join(root, "agents", "openai.yaml"), "utf8");
const actionSchema = JSON.parse(await readFile(join(root, "assets", "schemas", "actions.json"), "utf8"));
const optionalReadOnlyMcpTools = [
  "forecastos_list_resources",
  "forecastos_get_resource",
  "forecastos_get_schema",
  "forecastos_get_template",
  "forecastos_validate_market_shape",
  "forecastos_explain_next_step",
  "forecastos_get_precog_capabilities",
  "forecastos_get_config_defaults",
];
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);

assert(/^---\nname: forecast-os\n/m.test(skill), "SKILL.md needs hyphen-case forecast-os name frontmatter");
assert(
  /^description: ".+ForecastOS.+multi-outcome.+\.forecastos.+read-only MCP.+action bridge.+Precog.+fund.+no wallet custody.+no signing.*"$/m.test(skill),
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
  precogConfig.precog?.api_root,
  ".forecastos/config.json needs precog.api_root",
);
assert(
  precogConfig.precog?.open_api_key,
  ".forecastos/config.json needs the public open_api_key",
);
assert(
  precogConfig.precog?.deployed_master_address,
  ".forecastos/config.json needs deployed_master_address",
);
assert(
  Number.isInteger(Number(precogConfig.precog?.chain_id)) && Number(precogConfig.precog?.chain_id) > 0,
  ".forecastos/config.json needs precog.chain_id",
);
assert(
  precogConfig.precog?.default_collateral_address,
  ".forecastos/config.json needs precog.default_collateral_address",
);
assert(
  precogConfig.precog?.signature_actions?.create_market && precogConfig.precog?.signature_actions?.fund_market,
  ".forecastos/config.json needs precog.signature_actions.create_market and fund_market",
);
assert(
  precogConfig.precog.signature_actions.create_market === "CREATE_UPCOMING_MARKET",
  ".forecastos/config.json precog.signature_actions.create_market must match backend CREATE_UPCOMING_MARKET",
);
await assertMissing(join(root, "mcp.json"), "mcp.json belongs in adapters/, not inside the portable skill");
await assertMissing(join(root, "mcp"), "MCP package belongs in repo mcp/, not inside the portable skill");
await assertMissing(join(root, "scripts", "sign_precog_message.mjs"), "sign_precog_message.mjs should not exist");
await assertMissing(join(root, "scripts", "sign_precog_ethers.mjs"), "sign_precog_ethers.mjs should not exist");
const scriptNames = await readdir(join(root, "scripts"));
for (const scriptName of scriptNames.filter((name) => name.endsWith(".mjs"))) {
  const script = await readFile(join(root, "scripts", scriptName), "utf8");
  const forbiddenChainConstant = "DEFAULT" + "_CHAIN_ID";
  assert(!script.includes(forbiddenChainConstant), `${scriptName} must not contain ${forbiddenChainConstant}`);
}
assert(!schemaContainsKey(actionSchema.definitions, "chain_id"), "actions schema must not expose chain_id inputs");
await assertMissing(join(root, "agents", "metadata.yaml"), "agents/metadata.yaml should not exist");
await assertMissing(join(root, ".forecastos", "config.local.json"), ".forecastos/config.local.json should not be shipped");
await assertMissing(join(root, "README.md"), "README.md should not exist in the skill artifact");
await assertMissing(join(root, "CHANGELOG.md"), "CHANGELOG.md should not exist");
await assertMissing(join(root, "QUICK_REFERENCE.md"), "QUICK_REFERENCE.md should not exist");
await assertMissing(join(root, "INSTALLATION_GUIDE.md"), "INSTALLATION_GUIDE.md should not exist");
await assertMissing(join(root, "evals"), "evals should not exist");
await assertMissing(join(root, "agents", "grader.md"), "grader should not exist");
await assertMissing(join(root, "agents", "analyzer.md"), "analyzer should not exist");
await assertMissing(join(root, "agents", "comparator.md"), "comparator should not exist");
assert(skill.includes("Do not require MCP for normal drafting or creation."), "SKILL.md must frame MCP as optional");
assert(skill.includes("Use `scripts/forecastos_action.mjs` for workflow execution"), "SKILL.md must keep action bridge as execution path");

const forbidden = /(create|fund|draft_market|run_skill_step|wallet|sign|swap)/;
for (const toolName of optionalReadOnlyMcpTools) {
  assert(!forbidden.test(toolName), `MCP tool is not read-only enough: ${toolName}`);
}

if (await exists(join(repoRoot, "mcp", "forecast-os-mcp-server"))) {
  await assertMonorepoShape(repoRoot);
}

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      skill: "forecast-os",
      artifact: "skill/forecast-os",
      mcp: "optional-read-only",
      read_only_mcp_tools: optionalReadOnlyMcpTools,
    },
    null,
    2,
  ) + "\n",
);

async function assertMonorepoShape(monorepoRoot) {
  await assertDir(join(monorepoRoot, "mcp", "forecast-os-mcp-server"));
  await assertDir(join(monorepoRoot, "adapters", "codex"));
  await assertMissing(join(monorepoRoot, "SKILL.md"), "root SKILL.md should move to skill/forecast-os");
  await assertMissing(join(monorepoRoot, "mcp.json"), "root mcp.json should move to adapters/codex/mcp.json");
  await assertMissing(join(monorepoRoot, "agents"), "root agents/ should move to skill/forecast-os");
  await assertMissing(join(monorepoRoot, "references"), "root references/ should move to skill/forecast-os");
  await assertMissing(join(monorepoRoot, "scripts"), "root scripts/ should move to skill/forecast-os");
  await assertMissing(join(monorepoRoot, "assets"), "root assets/ should move to skill/forecast-os");
  await assertMissing(join(monorepoRoot, "test"), "root test/ should move to skill/forecast-os");
  await assertMissing(join(monorepoRoot, ".forecastos"), "root .forecastos/ should move to skill/forecast-os");

  const codexConfig = JSON.parse(await readFile(join(monorepoRoot, "adapters", "codex", "mcp.json"), "utf8"));
  assert(
    JSON.stringify(codexConfig.servers.forecastos.args) === JSON.stringify(["../../mcp/forecast-os-mcp-server/dist/stdio.js"]),
    "adapters/codex/mcp.json must point at ../../mcp/forecast-os-mcp-server/dist/stdio.js",
  );
  assert(
    codexConfig.servers.forecastos.env?.FORECASTOS_STATE_DIR === "../../skill/forecast-os/.forecastos",
    "adapters/codex/mcp.json must point FORECASTOS_STATE_DIR at ../../skill/forecast-os/.forecastos",
  );
}

function schemaContainsKey(value, key) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((entry) => schemaContainsKey(entry, key));
  return Object.entries(value).some(([entryKey, entryValue]) =>
    entryKey === key || schemaContainsKey(entryValue, key),
  );
}
function assert(condition, message) {
  if (!condition) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
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
