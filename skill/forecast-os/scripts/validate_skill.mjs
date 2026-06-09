#!/usr/bin/env node
// Validates that the ForecastOS skill package keeps its expected shape and safety boundaries.
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(root));
const skill = await readFile(join(root, "SKILL.md"), "utf8");
const repoVersion = await readTextOrNull(join(repoRoot, "VERSION"));
const skillArtifactVersion = await readTextOrNull(join(root, "VERSION"));
const effectiveVersion = (repoVersion ?? skillArtifactVersion ?? "").trim();
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
const mcpResourceCopies = [
  ["SKILL.md", "docs/skill.md"],
  ["references/architecture.md", "docs/architecture.md"],
  ["references/workflow.md", "docs/workflow.md"],
  ["references/safety.md", "docs/safety.md"],
  ["references/memory.md", "docs/memory.md"],
  ["references/mcp.md", "docs/mcp.md"],
  ["references/install.md", "docs/install.md"],
  ["references/remote-mcp.md", "docs/remote-mcp.md"],
  ["references/actions.md", "docs/actions.md"],
  ["references/action-policy.md", "docs/action-policy.md"],
  ["references/precog-liquidity.md", "docs/precog-liquidity.md"],
  ["references/tool-schemas.md", "docs/tool-schemas.md"],
  ["references/wallet-adapters.md", "docs/wallet-adapters.md"],
  ["references/external-markets.md", "docs/external-markets.md"],
  ["references/providers/polymarket-read.md", "docs/providers/polymarket-read.md"],
  ["references/providers/kalshi-read.md", "docs/providers/kalshi-read.md"],
  ["assets/templates/multi-outcome-market.md", "templates/multi-outcome-market.md"],
  ["assets/schemas/actions.json", "schemas/actions.json"],
  ["references/examples/agent-launch.md", "examples/agent-launch.md"],
  ["references/examples/funding-handoff.md", "examples/funding-handoff.md"],
  ["references/examples/full-workflow.md", "examples/full-workflow.md"],
  [".forecastos/config.json", "precog/config-defaults.json"],
];
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);

assert(/^---\nname: forecast-os\n/m.test(skill), "SKILL.md needs hyphen-case forecast-os name frontmatter");
assert(
  /^description: ".+ForecastOS.+future-event probability.+decision\/planning uncertainty.+whether there is a prediction market.+market discovery.+Polymarket\/Kalshi\/Precog.+before guessing probabilities.+\.forecastos.+action bridge.+Precog.+fund.+no wallet custody.+no signing.*"$/m.test(skill),
  "SKILL.md description needs ForecastOS discovery, probability, boundaries, and action context",
);
assert(
  /^description: ".+Base\/Arbitrum.+USDC.+collateral.*"$/m.test(skill),
  "SKILL.md description must include Base/Arbitrum USDC collateral trigger terms",
);
assert(frontmatter, "SKILL.md needs YAML frontmatter");
assert(/^\d+\.\d+\.\d+$/.test(effectiveVersion), "ForecastOS VERSION must contain semver like 0.1.0");
if (repoVersion !== null && skillArtifactVersion !== null) {
  assert(
    repoVersion.trim() === skillArtifactVersion.trim(),
    "generated skill VERSION must match repo root VERSION when both exist",
  );
}
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
await assertFile(join(root, "scripts", "check_version.mjs"));
await assertFile(join(root, "scripts", "check_pending_market.mjs"));
await assertFile(join(root, "scripts", "sync_version.mjs"));
assert(
  precogConfig.precog?.api_root,
  ".forecastos/config.json needs precog.api_root",
);
assert(
  precogConfig.precog?.open_api_key,
  ".forecastos/config.json needs the public open_api_key",
);
assert(
  Number.isInteger(Number(precogConfig.precog?.chain_id)) && Number(precogConfig.precog?.chain_id) > 0,
  ".forecastos/config.json needs precog.chain_id",
);
assert(
  precogConfig.precog?.supported_chains?.["8453"]?.name === "base" &&
    precogConfig.precog?.supported_chains?.["42161"]?.name === "arbitrum",
  ".forecastos/config.json must declare supported_chains entries for Base (8453) and Arbitrum (42161)",
);
assert(
  precogConfig.precog.supported_chains["8453"].default_collateral_address === "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" &&
    precogConfig.precog.supported_chains["42161"].default_collateral_address === "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  ".forecastos/config.json must declare chain-specific default_collateral_address values for Base and Arbitrum",
);
assert(
  precogConfig.precog.supported_chains["8453"].deployed_master_address === "0x00000000000c109080dfa976923384b97165a57a" &&
    precogConfig.precog.supported_chains["42161"].deployed_master_address === "0x0000000000990400E12543B7f400136e8672E2F0",
  ".forecastos/config.json must declare chain-specific deployed_master_address values for Base and Arbitrum",
);
assert(
  Array.isArray(precogConfig.precog?.default_collateral_options) &&
    precogConfig.precog.default_collateral_options.some((option) => option.label === "USDC on Base") &&
    precogConfig.precog.default_collateral_options.some((option) => option.label === "USDC on Arbitrum"),
  ".forecastos/config.json must declare default_collateral_options for USDC on Base and USDC on Arbitrum",
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
  skill.includes("USDC on Base") && skill.includes("USDC on Arbitrum"),
  "SKILL.md must include explicit chain/collateral selection defaults for Base and Arbitrum",
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
  actionsDoc.includes("`publish_approved_market`") &&
    actionsDoc.includes("Do not create or edit `.forecastos/workflows/*` files by hand"),
  "references/actions.md must document publish_approved_market as the host-safe create wrapper and forbid manual workflow files",
);
assert(
  actionsDoc.includes("Base MCP request id is not the signature") &&
    actionsDoc.includes("not being a compact 65-byte EOA signature"),
  "references/actions.md must clarify Base MCP smart-account signature envelopes",
);
assert(
  actionsDoc.includes("Base (`8453`) and Arbitrum (`42161`)"),
  "references/actions.md must document Base and Arbitrum chain support",
);
assert(
  actionsDoc.includes("With collateral from which chain?") &&
    actionsDoc.includes("USDC on Base") &&
    actionsDoc.includes("USDC on Arbitrum"),
  "references/actions.md must document ask-if-missing chain/collateral guidance with Base/Arbitrum USDC defaults",
);
assert(
  skill.includes("pending_check") &&
    skill.includes("--auto-redraft") &&
    skill.includes("linked replacement draft for user approval"),
  "SKILL.md must require hourly pending checks and approval-gated auto-redrafts",
);
assert(
  actionsDoc.includes("pending_check") &&
    actionsDoc.includes("continue_schedule") &&
    actionsDoc.includes("--auto-redraft") &&
    actionsDoc.includes("never auto-submits the replacement"),
  "references/actions.md must document pending_check scheduling and no-auto-submit redrafts",
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
  await assertDir(join(monorepoRoot, "adapters", "hosts", "claude"));
  await assertDir(join(monorepoRoot, "adapters", "hosts", "codex"));
  await assertDir(join(monorepoRoot, "adapters", "hosts", "cursor"));
  await assertDir(join(monorepoRoot, "adapters", "hosts", "bankr"));
  await assertDir(join(monorepoRoot, "adapters", "wallets"));
  await assertDir(join(monorepoRoot, "adapters", "wallets", "base-mcp"));
  await assertDir(join(monorepoRoot, "adapters", "wallets", "bankr"));
  await assertDir(join(monorepoRoot, "adapters", "wallets", "privy"));
  await assertDir(join(monorepoRoot, "adapters", "wallets", "test"));
  await assertFile(join(monorepoRoot, "adapters", "wallets", "contract.md"));
  await assertFile(join(monorepoRoot, "adapters", "wallets", "base-mcp", "resolve_funding.mjs"));
  await assertFile(join(monorepoRoot, "adapters", "wallets", "bankr", "resolve_create.mjs"));
  await assertFile(join(monorepoRoot, "adapters", "wallets", "bankr", "resolve_funding.mjs"));
  await assertFile(join(monorepoRoot, "adapters", "wallets", "privy", "resolve_create.mjs"));
  await assertBaseMcpWalletAdapter(monorepoRoot);
  await assertClaudeHostAdapter(monorepoRoot);
  await assertCursorHostAdapter(monorepoRoot);
  await assertBankrCompatibility(monorepoRoot);
  await assertHermesHostAdapter(monorepoRoot);
  await assertMcpResourcesInSync(monorepoRoot);
  await assertGeneratedOutputsExcluded(monorepoRoot);
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

async function assertMcpResourcesInSync(monorepoRoot) {
  const resourceRoot = join(monorepoRoot, "mcp", "forecast-os-mcp-server", "resources");
  for (const [source, target] of mcpResourceCopies) {
    const sourcePath = join(root, source);
    const targetPath = join(resourceRoot, target);
    const sourceText = await readFile(sourcePath, "utf8");
    const targetText = await readFile(targetPath, "utf8");
    assert(
      sourceText === targetText,
      `MCP resource ${target} is stale; run npm run sync:resources from mcp/forecast-os-mcp-server`,
    );
  }
}

async function assertGeneratedOutputsExcluded(monorepoRoot) {
  const gitignore = await readTextOrNull(join(monorepoRoot, ".gitignore"));
  assert(gitignore !== null, ".gitignore must exclude generated skill test outputs");
  for (const ignoredPath of ["skill/forecast-os/test-output/", "skill/forecast-os/api-test-output/"]) {
    assert(
      gitignore.includes(ignoredPath),
      `${ignoredPath} must stay ignored so generated test output is not packaged as skill content`,
    );
  }
  const installDoc = await readFile(join(root, "references", "install.md"), "utf8");
  assert(
    installDoc.includes("Do not include generated test-output or api-test-output folders"),
    "install docs must tell packagers to exclude generated test output folders",
  );
}

async function assertClaudeHostAdapter(monorepoRoot) {
  const claudeRoot = join(monorepoRoot, "adapters", "hosts", "claude");
  const claudeSkillRoot = join(claudeRoot, "forecast-os");
  await assertFile(join(claudeRoot, ".mcp.json"));
  await assertFile(join(claudeSkillRoot, "SKILL.md"));
  await assertDir(join(claudeSkillRoot, "references"));
  await assertDir(join(claudeSkillRoot, "scripts"));

  const claudeMcp = JSON.parse(await readFile(join(claudeRoot, ".mcp.json"), "utf8"));
  assert(
    Boolean(claudeMcp.mcpServers?.forecastos) && !claudeMcp.servers,
    "Claude MCP template must use mcpServers and not Codex-style servers",
  );
  assert(
    claudeMcp.mcpServers.forecastos.args?.some((arg) => String(arg).includes("mcp/forecast-os-mcp-server/dist/stdio.js")),
    "Claude MCP template must point at the read-only ForecastOS stdio server",
  );
  assert(
    claudeMcp.mcpServers.forecastos.env?.FORECASTOS_STATE_DIR?.includes("skill/forecast-os/.forecastos"),
    "Claude MCP template must point FORECASTOS_STATE_DIR at the skill-local state dir",
  );

  const topLevel = (await readdir(claudeSkillRoot)).sort();
  assert(
    topLevel.every((entry) => ["SKILL.md", "references", "scripts"].includes(entry)),
    "Claude export package must contain only SKILL.md, references/, and scripts/",
  );
  const claudeSkill = await readFile(join(claudeSkillRoot, "SKILL.md"), "utf8");
  assert(
    /^---\nname: forecast-os\ndescription: /m.test(claudeSkill),
    "Claude SKILL.md must have valid skill frontmatter",
  );
  assert(
    claudeSkill.includes("Use ForecastOS whenever") && claudeSkill.includes("prediction-market workflows"),
    "Claude SKILL.md description must be specific enough to trigger ForecastOS workflows",
  );
  assert(
    !claudeSkill.includes("/wallet/sign") && !claudeSkill.includes("/wallet/submit"),
    "Claude SKILL.md must keep wallet-provider endpoint details out of host guidance",
  );

  const claudeDocs = [
    await readFile(join(claudeRoot, "README.md"), "utf8"),
    await readFile(join(claudeSkillRoot, "references", "claude-workflow.md"), "utf8"),
  ].join("\n");
  assert(
    claudeDocs.includes("mcpServers") && claudeDocs.includes("project-scoped"),
    "Claude docs must describe project-scoped MCP setup with mcpServers",
  );
  assert(
    claudeDocs.includes("read-only") && claudeDocs.includes("does not add wallet signing"),
    "Claude docs must preserve read-only MCP and wallet-boundary guidance",
  );
  assert(
    claudeDocs.includes("not a standalone ForecastOS runtime") &&
      claudeDocs.includes("full ForecastOS repo/runtime") &&
      claudeDocs.includes("installed equivalent"),
    "Claude docs must clearly require the ForecastOS runtime or installed equivalent",
  );
  assert(
    !claudeDocs.includes("/wallet/sign") && !claudeDocs.includes("/wallet/submit"),
    "Claude docs must not contain wallet-provider endpoint details",
  );
}

async function assertCursorHostAdapter(monorepoRoot) {
  const cursorSkillRoot = join(monorepoRoot, "adapters", "hosts", "cursor", "forecast-os");
  await assertFile(join(cursorSkillRoot, "SKILL.md"));
  await assertDir(join(cursorSkillRoot, "references"));
  await assertDir(join(cursorSkillRoot, "scripts"));
  await assertFile(join(cursorSkillRoot, "scripts", "check-cursor-setup.mjs"));
  await assertFile(join(cursorSkillRoot, "scripts", "forecastos-action.mjs"));

  const topLevel = (await readdir(cursorSkillRoot)).sort();
  assert(
    topLevel.every((entry) => ["SKILL.md", "references", "scripts"].includes(entry)),
    "Cursor export package must contain only SKILL.md, references/, and scripts/",
  );

  const cursorSkill = await readFile(join(cursorSkillRoot, "SKILL.md"), "utf8");
  const frontmatterMatch = cursorSkill.match(/^---\n([\s\S]*?)\n---/);
  assert(frontmatterMatch, "Cursor SKILL.md must have YAML frontmatter");
  const cursorFrontmatter = frontmatterMatch[1];
  assert(
    /^name: forecast-os$/m.test(cursorFrontmatter) &&
      /^description: ".+ForecastOS.+Cursor.+prediction-market.+pending Precog approval.+future-event probability.+market context.*"$/m.test(cursorFrontmatter),
    "Cursor SKILL.md must have forecast-os name and a strong Cursor ForecastOS description",
  );
  assert(
    !/^paths:/m.test(cursorFrontmatter) && !/^disable-model-invocation:/m.test(cursorFrontmatter),
    "Cursor SKILL.md must not set paths or disable-model-invocation",
  );
  assert(
    cursorSkill.includes("scripts/forecastos-action.mjs") && cursorSkill.includes("scripts/check-cursor-setup.mjs"),
    "Cursor SKILL.md must point agents at the bundled Cursor helper scripts",
  );

  const cursorDocs = [
    await readFile(join(cursorSkillRoot, "references", "cursor-workflow.md"), "utf8"),
    await readFile(join(cursorSkillRoot, "scripts", "check-cursor-setup.mjs"), "utf8"),
    await readFile(join(cursorSkillRoot, "scripts", "forecastos-action.mjs"), "utf8"),
  ].join("\n");
  assert(
    cursorDocs.includes(".cursor/skills/forecast-os") &&
      cursorDocs.includes(".agents/skills/forecast-os") &&
      cursorDocs.includes("~/.cursor/skills/forecast-os") &&
      cursorDocs.includes("~/.agents/skills/forecast-os"),
    "Cursor docs must document project and user skill install paths",
  );
  assert(
    cursorDocs.includes("Codex and Claude skill folders") && cursorDocs.includes("native Cursor package"),
    "Cursor docs must mention compatibility discovery while preferring the native Cursor adapter",
  );
  assert(
    cursorDocs.includes("FORECASTOS_REPO_ROOT") && cursorDocs.includes("skill/forecast-os/scripts/forecastos_action.mjs"),
    "Cursor docs/scripts must support FORECASTOS_REPO_ROOT and the canonical action bridge",
  );
  assert(
    cursorDocs.includes("private keys") &&
      cursorDocs.includes("raw signatures") &&
      cursorDocs.includes("token approval") &&
      cursorDocs.includes("adapters/wallets"),
    "Cursor docs must preserve wallet and custody boundaries",
  );
  assert(
    !cursorDocs.includes("/wallet/sign") &&
      !cursorDocs.includes("/wallet/submit") &&
      !cursorDocs.includes("BANKR_API_KEY") &&
      !cursorDocs.includes("PRIVY_API_KEY"),
    "Cursor docs must not contain wallet-provider endpoint details or secrets",
  );
}

async function assertHermesHostAdapter(monorepoRoot) {
  const hermesRoot = join(monorepoRoot, "adapters", "hosts", "hermes");
  const hermesSkillRoot = join(hermesRoot, "skills", "prediction", "forecast-os");
  const hermesPluginRoot = join(hermesRoot, "forecast-os");
  await assertFile(join(hermesRoot, "README.md"));
  await assertFile(join(hermesSkillRoot, "SKILL.md"));
  await assertDir(join(hermesSkillRoot, "references"));
  await assertDir(join(hermesSkillRoot, "scripts"));
  await assertFile(join(hermesSkillRoot, "scripts", "check-hermes-setup.mjs"));
  await assertFile(join(hermesSkillRoot, "scripts", "forecastos-action.mjs"));
  await assertFile(join(hermesSkillRoot, "scripts", "forecastos-runtime.mjs"));
  await assertFile(join(hermesSkillRoot, "scripts", "prepare-create-intent.mjs"));
  await assertFile(join(hermesSkillRoot, "scripts", "resolve-privy-create.mjs"));
  await assertFile(join(hermesPluginRoot, "plugin.yaml"));
  await assertFile(join(hermesPluginRoot, "__init__.py"));

  const topLevel = (await readdir(hermesSkillRoot)).sort();
  assert(
    topLevel.every((entry) => ["SKILL.md", "references", "scripts"].includes(entry)),
    "Hermes skill export package must contain only SKILL.md, references/, and scripts/",
  );

  const hermesSkill = await readFile(join(hermesSkillRoot, "SKILL.md"), "utf8");
  assert(
    /^---\nname: forecast-os\ndescription: [\s\S]+?\nversion: 0\.1\.0\nauthor: ForecastOS\nlicense: UNLICENSED\nmetadata:\n  hermes:/m.test(hermesSkill),
    "Hermes SKILL.md must have Hermes-style frontmatter with version, author, license, and metadata.hermes",
  );
  assert(
    ["## When to Use", "## Quick Reference", "## Procedure", "## Pitfalls", "## Verification"].every((text) =>
      hermesSkill.includes(text),
    ),
    "Hermes SKILL.md must use the expected Hermes sections",
  );
  assert(
    hermesSkill.includes("${HERMES_SKILL_DIR}") && hermesSkill.includes("check-hermes-setup.mjs"),
    "Hermes SKILL.md must reference bundled scripts through HERMES_SKILL_DIR",
  );
  assert(
    hermesSkill.includes("prepare-create-intent.mjs") &&
      hermesSkill.includes("resolve-privy-create.mjs") &&
      hermesSkill.includes("run_skill_step") &&
      hermesSkill.includes("--wallet-output") &&
      hermesSkill.includes("Do not call direct `create_market` first") &&
      hermesSkill.includes("Do not use `preview_market`"),
    "Hermes SKILL.md must document the wallet-resolved publish flow and forbid preview/direct create mistakes",
  );
  assert(
    !hermesSkill.includes("required_environment_variables") &&
      !hermesSkill.includes("BANKR_API_KEY") &&
      !hermesSkill.includes("PRIVY"),
    "Hermes core skill must not prompt for wallet-provider secrets on load",
  );

  const hermesDocs = [
    await readFile(join(hermesRoot, "README.md"), "utf8"),
    await readFile(join(hermesSkillRoot, "references", "hermes-workflow.md"), "utf8"),
  ].join("\n");
  assert(
    hermesDocs.includes("Skill-First") &&
      hermesDocs.includes("~/.hermes/skills/prediction/forecast-os") &&
      hermesDocs.includes("skills.external_dirs"),
    "Hermes docs must recommend the skill-first install path and external_dirs for repo development",
  );
  assert(
    hermesDocs.includes("plugin wrapper") &&
      hermesDocs.includes("optional") &&
      hermesDocs.includes("does not replace the skill package"),
    "Hermes docs must frame the Python plugin as optional advanced integration",
  );
  assert(
    hermesDocs.includes("ForecastOS repo/runtime") &&
      hermesDocs.includes("skill/forecast-os/scripts/forecastos_action.mjs"),
    "Hermes docs must clearly require the ForecastOS runtime and action bridge",
  );
  assert(
    hermesDocs.includes("prepare-create-intent.mjs") &&
      hermesDocs.includes("resolve-privy-create.mjs") &&
      hermesDocs.includes("run_skill_step") &&
      hermesDocs.includes("--wallet-output") &&
      hermesDocs.includes("Do not call direct `create_market` before wallet resolution") &&
      hermesDocs.includes("Do not use `preview_market`") &&
      hermesDocs.includes("FORECASTOS_REPO_ROOT") &&
      hermesDocs.includes("--input -"),
    "Hermes docs must document the publish sequence, stdin support, and unsupported preview/direct create path",
  );
  assert(
    hermesDocs.includes("does not replace the skill package") ||
      hermesSkill.includes("plugin wrapper is only for users who"),
    "Hermes docs must avoid plugin-only install language as the primary path",
  );

  const pluginYaml = await readFile(join(hermesPluginRoot, "plugin.yaml"), "utf8");
  assert(
    pluginYaml.includes("provides_tools") && pluginYaml.includes("forecastos_action"),
    "Hermes plugin wrapper must remain separated as a tool provider",
  );
  const hermesSetupScript = await readFile(join(hermesSkillRoot, "scripts", "check-hermes-setup.mjs"), "utf8");
  assert(
    hermesSetupScript.includes("privy_create_adapter") &&
      hermesSetupScript.includes("hermes_action_wrapper") &&
      hermesSetupScript.includes("hermes_prepare_create_wrapper") &&
      hermesSetupScript.includes('actionBridgeSupportCheck("prepare_create_intent")') &&
      hermesSetupScript.includes("hermes_privy_wrapper"),
    "Hermes setup check must verify Privy adapter and Hermes wrapper paths",
  );
}

async function assertBankrCompatibility(monorepoRoot) {
  const bankrSkillRoot = join(monorepoRoot, "adapters", "hosts", "bankr", "forecast-os");
  await assertFile(join(bankrSkillRoot, "SKILL.md"));
  await assertDir(join(bankrSkillRoot, "references"));
  await assertDir(join(bankrSkillRoot, "scripts"));
  const topLevel = (await readdir(bankrSkillRoot)).sort();
  assert(
    topLevel.every((entry) => ["SKILL.md", "references", "scripts"].includes(entry)),
    "Bankr export package must contain only SKILL.md, references/, and scripts/",
  );
  const bankrSkill = await readFile(join(bankrSkillRoot, "SKILL.md"), "utf8");
  assert(
    /^---\nname: forecast-os\ndescription: /m.test(bankrSkill),
    "Bankr SKILL.md must have valid skill frontmatter",
  );
  assert(
    ["Draft a market", "Publish through Bankr", "Check pending approval", "Fund after validation"].every((text) =>
      bankrSkill.includes(text),
    ),
    "Bankr SKILL.md must include the required usage examples",
  );
  assert(
    bankrSkill.includes("requires the ForecastOS repo/runtime") && bankrSkill.includes("not the full runtime by itself"),
    "Bankr SKILL.md must clearly require the ForecastOS runtime or installed equivalent",
  );
  assert(
    !bankrSkill.toLowerCase().includes("codex") && !bankrSkill.toLowerCase().includes("restart"),
    "Bankr SKILL.md must avoid Codex-specific install/restart language",
  );

  const bankrDocs = [
    await readFile(join(monorepoRoot, "adapters", "hosts", "bankr", "forecast-os", "references", "bankr-workflow.md"), "utf8"),
    await readFile(join(monorepoRoot, "adapters", "wallets", "bankr", "README.md"), "utf8"),
  ].join("\n");
  assert(
    bankrDocs.includes("ForecastOS repo/runtime") && bankrDocs.includes("adapters/wallets/bankr"),
    "Bankr docs must clearly require the ForecastOS runtime and Bankr wallet adapter",
  );
  assert(
    bankrDocs.includes("/wallet/sign") && bankrDocs.includes("/wallet/submit"),
    "Bankr docs must document current wallet endpoints",
  );
  assert(
    bankrDocs.includes("must not invent funding calldata") || bankrDocs.includes("does not invent funding calldata"),
    "Bankr docs must guard against invented funding calldata",
  );
  const genericDocs = [
    await readFile(join(root, "references", "actions.md"), "utf8"),
    await readFile(join(root, "references", "action-policy.md"), "utf8"),
    await readFile(join(root, "references", "safety.md"), "utf8"),
    await readFile(join(root, "references", "tool-schemas.md"), "utf8"),
    await readFile(join(root, "references", "wallet-adapters.md"), "utf8"),
    await readFile(join(root, "scripts", "forecastos_runtime.mjs"), "utf8"),
  ].join("\n");
  assert(
    !genericDocs.includes("/wallet/sign") && !genericDocs.includes("/wallet/submit"),
    "Generic ForecastOS docs must keep Bankr endpoint details in Bankr-specific files",
  );
}

async function readTextOrNull(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
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
