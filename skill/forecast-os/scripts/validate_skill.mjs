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
const forbiddenSdkModuleEnv = "FORECASTOS" + "_SDK_MODULE";
const optionalReadOnlyMcpTools = [
  "forecastos_list_resources",
  "forecastos_get_resource",
  "forecastos_get_schema",
  "forecastos_get_template",
  "forecastos_validate_market_shape",
  "forecastos_explain_next_step",
  "forecastos_search_markets",
  "forecastos_get_market",
  "forecastos_get_market_prices",
  "forecastos_get_market_orderbook",
  "forecastos_get_precog_capabilities",
  "forecastos_get_config_defaults",
];
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);

assert(/^---\nname: forecast-os\n/m.test(skill), "SKILL.md needs hyphen-case forecast-os name frontmatter");
assert(
  /^description: ".+ForecastOS.+future-event probability.+decision\/planning uncertainty.+whether there is a prediction market.+market discovery.+Polymarket\/Kalshi\/Precog.+before guessing probabilities.+\.forecastos.+action bridge.+Precog.+fund.+no wallet custody.+no signing.*"$/m.test(skill),
  "SKILL.md description needs ForecastOS discovery, probability, boundaries, and action context",
);
assert(frontmatter, "SKILL.md needs YAML frontmatter");
assert(
  frontmatter[1].trim().split(/\r?\n/).map((line) => line.split(":")[0]).join(",") === "name,description",
  "SKILL.md frontmatter must only use name and description",
);
assert(agentMetadata.includes('display_name: "ForecastOS"'), "agents/openai.yaml needs ForecastOS display name");
assert(
  agentMetadata.includes("Search prediction markets and run human-approved ForecastOS workflows"),
  "agents/openai.yaml must mention prediction-market search/discovery",
);
assert(
  agentMetadata.includes("search prediction-market context") && agentMetadata.includes("avoid guessing future-event probabilities"),
  "agents/openai.yaml default prompt must mention market context before probability guesses",
);
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
const walletShimPath = join(root, "scripts", "wallets", "privy_resolve_create.mjs");
const walletShim = await readFile(walletShimPath, "utf8");
assert(
  walletShim.includes("adapters/wallets/privy/resolve_create.mjs"),
  "Privy skill script must be a compatibility shim to adapters/wallets/privy/resolve_create.mjs",
);
assert(!walletShim.includes("PRIVY_API_ROOT"), "Portable skill shim must not contain provider implementation details");
const scriptNames = await readdir(join(root, "scripts"));
for (const scriptName of scriptNames.filter((name) => name.endsWith(".mjs"))) {
  const script = await readFile(join(root, "scripts", scriptName), "utf8");
  const forbiddenChainConstant = "DEFAULT" + "_CHAIN_ID";
  assert(!script.includes(forbiddenChainConstant), `${scriptName} must not contain ${forbiddenChainConstant}`);
  assert(!script.includes(forbiddenSdkModuleEnv), `${scriptName} must use the bundled runtime`);
}
for (const docPath of [
  join(root, "SKILL.md"),
  join(root, "references", "actions.md"),
  join(root, "references", "install.md"),
  join(root, "references", "action-policy.md"),
  join(root, "references", "memory.md"),
]) {
  const doc = await readFile(docPath, "utf8");
  assert(!doc.includes(forbiddenSdkModuleEnv), `${docPath} must not document the SDK module override`);
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
assert(
  skill.includes("Use read-only external market MCP tools"),
  "SKILL.md must route external market data through read-only MCP tools",
);
assert(
  skill.includes("External market reads must never trade"),
  "SKILL.md must forbid trading through external market reads",
);
assert(
  skill.includes("Creation defaults to Precog"),
  "SKILL.md must state that creation defaults to Precog",
);
assert(
  skill.includes("External markets are read-only"),
  "SKILL.md must state that external markets are read-only",
);
assert(
  skill.includes("Wallet adapters do not choose the market venue"),
  "SKILL.md must state that wallet adapters do not choose the market venue",
);
assert(
  skill.includes("Prediction And Decision Support"),
  "SKILL.md must include prediction and decision support guidance",
);
assert(
  skill.includes("Before inventing or guessing a probability, search read-only"),
  "SKILL.md must tell agents not to guess probabilities before checking market context",
);
assert(
  skill.includes("forecastos_search_markets") && skill.includes("Do not substitute generic web search"),
  "SKILL.md must prefer API-backed market tools over generic web search",
);
assert(
  skill.includes("Always check Precog") && skill.includes("then Kalshi, then Polymarket"),
  "SKILL.md must require Precog-first market discovery order",
);
assert(
  skill.includes("whether there is a prediction market"),
  "SKILL.md must explicitly trigger on prediction-market existence questions",
);
assert(
  skill.includes('"is there a prediction market about..."'),
  "SKILL.md must include the literal prediction-market existence phrasing",
);
assert(
  skill.includes("decision/planning uncertainty"),
  "SKILL.md must explicitly trigger on future decision/planning uncertainty",
);

const actionsDoc = await readFile(join(root, "references", "actions.md"), "utf8");
const actionPolicyDoc = await readFile(join(root, "references", "action-policy.md"), "utf8");
const externalMarketsDoc = await readFile(join(root, "references", "external-markets.md"), "utf8");
const precogLiquidityDoc = await readFile(join(root, "references", "precog-liquidity.md"), "utf8");
const polymarketReadDoc = await readFile(join(root, "references", "providers", "polymarket-read.md"), "utf8");
assert(
  actionsDoc.includes("prepare_create_intent` creates the wallet-agnostic Precog `CREATE_UPCOMING_MARKET` intent"),
  "references/actions.md must lock prepare_create_intent to Precog CREATE_UPCOMING_MARKET",
);
assert(
  actionPolicyDoc.includes("create_market` always submits to the configured Precog API root"),
  "references/action-policy.md must lock create_market to the configured Precog API root",
);
assert(
  externalMarketsDoc.includes("Market Discovery Workflow"),
  "references/external-markets.md must document market discovery workflow",
);
assert(
  externalMarketsDoc.includes("search provider data before guessing a") && externalMarketsDoc.includes("Precog first, then Kalshi, then Polymarket"),
  "references/external-markets.md must route probability questions through read-only providers first",
);
assert(
  externalMarketsDoc.includes("provider API-backed tools") && externalMarketsDoc.includes("generic search-engine result pages"),
  "references/external-markets.md must prefer provider API-backed tools over web search pages",
);
assert(
  externalMarketsDoc.includes("/api/v1/markets/") && externalMarketsDoc.includes("status=OPEN"),
  "references/external-markets.md must document Precog discovery through /api/v1/markets/?status=OPEN",
);
assert(
  externalMarketsDoc.includes("FORECASTOS_STATE_DIR/config.local.json") && externalMarketsDoc.includes("before falling back"),
  "references/external-markets.md must document current ForecastOS config precedence for Precog reads",
);
assert(
  externalMarketsDoc.includes("do not use the upcoming-market lifecycle endpoint for ordinary market discovery"),
  "references/external-markets.md must keep upcoming-market lifecycle separate from Precog discovery",
);
assert(
  externalMarketsDoc.includes("avoid presenting a guessed probability as market-implied"),
  "references/external-markets.md must distinguish no-market findings from guessed probabilities",
);
assert(
  externalMarketsDoc.includes("Gamma `/public-search` endpoint") && polymarketReadDoc.includes("GET /public-search"),
  "Polymarket docs must document /public-search for keyword discovery",
);
assert(
  polymarketReadDoc.includes("search_profiles=false") && polymarketReadDoc.includes("search_tags=false"),
  "Polymarket docs must document trimmed public-search profile/tag behavior",
);
const liquidityDocs = [skill, actionsDoc, actionPolicyDoc, precogLiquidityDoc].join("\n");
assert(
  skill.includes("Liquidity And Creator Economics") && skill.includes("references/precog-liquidity.md"),
  "SKILL.md must route liquidity and creator economics questions to the Precog liquidity reference",
);
assert(
  liquidityDocs.includes("profit pool"),
  "skill docs must explain the Precog profit pool",
);
assert(
  liquidityDocs.includes("90% to LPs"),
  "skill docs must document 90% to LPs",
);
assert(
  liquidityDocs.includes("5% to the market creator"),
  "skill docs must document 5% to the market creator",
);
assert(
  liquidityDocs.includes("creator boost"),
  "skill docs must document current creator boost behavior",
);
assert(
  liquidityDocs.includes("LP positions are locked until market resolution"),
  "skill docs must state LP positions are locked until market resolution",
);
assert(
  liquidityDocs.toLowerCase().includes("funding still requires explicit approval"),
  "skill docs must state funding still requires explicit approval",
);
assert(
  precogLiquidityDoc.includes("Virtual liquidity") && precogLiquidityDoc.includes("Max Loss"),
  "references/precog-liquidity.md must explain virtual liquidity and Max Loss",
);
assert(
  precogLiquidityDoc.includes("not a permanent guarantee") && precogLiquidityDoc.includes("not guaranteed"),
  "references/precog-liquidity.md must avoid treating creator boost or earnings as guaranteed",
);

const forbidden = /(create|fund_market|draft_market|run_skill_step|wallet|sign|swap|approve|bridge)/;
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
  await assertDir(join(monorepoRoot, "adapters", "hosts"));
  await assertDir(join(monorepoRoot, "adapters", "hosts", "codex"));
  await assertDir(join(monorepoRoot, "adapters", "wallets"));
  await assertDir(join(monorepoRoot, "adapters", "wallets", "base-mcp"));
  await assertDir(join(monorepoRoot, "adapters", "wallets", "privy"));
  await assertDir(join(monorepoRoot, "adapters", "wallets", "test"));
  await assertFile(join(monorepoRoot, "adapters", "wallets", "contract.md"));
  await assertFile(join(monorepoRoot, "adapters", "wallets", "base-mcp", "resolve_funding.mjs"));
  await assertFile(join(monorepoRoot, "adapters", "wallets", "privy", "resolve_create.mjs"));
  await assertBaseMcpWalletAdapter(monorepoRoot);
  await assertMissing(join(monorepoRoot, "SKILL.md"), "root SKILL.md should move to skill/forecast-os");
  await assertMissing(join(monorepoRoot, "mcp.json"), "root mcp.json should move to adapters/hosts/codex/mcp.json");
  await assertMissing(join(monorepoRoot, "agents"), "root agents/ should move to skill/forecast-os");
  await assertMissing(join(monorepoRoot, "references"), "root references/ should move to skill/forecast-os");
  await assertMissing(join(monorepoRoot, "scripts"), "root scripts/ should move to skill/forecast-os");
  await assertMissing(join(monorepoRoot, "assets"), "root assets/ should move to skill/forecast-os");
  await assertMissing(join(monorepoRoot, "test"), "root test/ should move to skill/forecast-os");
  await assertMissing(join(monorepoRoot, ".forecastos"), "root .forecastos/ should move to skill/forecast-os");

  const codexConfig = JSON.parse(await readFile(join(monorepoRoot, "adapters", "hosts", "codex", "mcp.json"), "utf8"));
  assert(
    JSON.stringify(codexConfig.servers.forecastos.args) === JSON.stringify(["../../../mcp/forecast-os-mcp-server/dist/stdio.js"]),
    "adapters/hosts/codex/mcp.json must point at ../../../mcp/forecast-os-mcp-server/dist/stdio.js",
  );
  assert(
    codexConfig.servers.forecastos.env?.FORECASTOS_STATE_DIR === "../../../skill/forecast-os/.forecastos",
    "adapters/hosts/codex/mcp.json must point FORECASTOS_STATE_DIR at ../../../skill/forecast-os/.forecastos",
  );
}

async function assertBaseMcpWalletAdapter(monorepoRoot) {
  const basePlugin = await readFile(
    join(monorepoRoot, "adapters", "wallets", "base-mcp", "plugins", "forecast-os.md"),
    "utf8",
  );
  assert(
    basePlugin.includes("STOP - COMPLETE BASE MCP ONBOARDING BEFORE WALLET ACTIONS"),
    "Base plugin spec must include the Base MCP onboarding gate",
  );
  assert(
    basePlugin.includes("complementary to that") && basePlugin.includes("host adapter"),
    "Base MCP plugin spec must describe Base as complementary to host adapters",
  );
  assert(
    basePlugin.includes("get_wallets") && basePlugin.includes("send_calls") && basePlugin.includes('"chain": "base"'),
    "Base plugin spec must document get_wallets and send_calls chain mapping",
  );
  assert(
    basePlugin.includes("resolve_funding.mjs") && basePlugin.includes("unsigned calldata envelope"),
    "Base MCP plugin spec must document the funding resolver and prepared calldata requirement",
  );
  assert(
    basePlugin.includes("Creation is not a `send_calls` flow"),
    "Base plugin spec must not misrepresent ForecastOS creation as send_calls calldata",
  );
  assert(
    basePlugin.includes("If no unsigned calldata envelope or ordered transaction batch is available, do not invent calldata"),
    "Base plugin spec must guard funding calldata availability",
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

async function assertFile(path) {
  assert((await stat(path)).isFile(), `${path} must be a file`);
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
