import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  DirectoryDraftStateStore,
  formatMarketQuestionToURL,
  createForecastOS,
} from "../scripts/forecastos_runtime.mjs";

const execFileAsync = promisify(execFile);
const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const monorepoRoot = dirname(dirname(skillRoot));
const shippedConfig = JSON.parse(await readFile(join(skillRoot, ".forecastos", "config.json"), "utf8"));
const configChainId = shippedConfig.precog.chain_id;
const configCollateralAddress = shippedConfig.precog.default_collateral_address;
const configSignatureActions = shippedConfig.precog.signature_actions;

test("formatMarketQuestionToURL matches Precog launchpad slug rules", () => {
  assert.equal(
    formatMarketQuestionToURL("L2Beat: Which L2's will achieve Stage 2 by July 2026?"),
    "l2beat-which-l2s-will-achieve-stage-2-by-july-2026",
  );
  assert.equal(
    formatMarketQuestionToURL("Will `Foo`   win -- or lose?!"),
    "will-foo-win----or-lose",
  );
});

test("root VERSION is canonical and check_version works without skill artifact VERSION", async () => {
  await rm(join(skillRoot, "VERSION"), { force: true });
  const rootVersion = (await readFile(join(monorepoRoot, "VERSION"), "utf8")).trim();

  assert.equal(rootVersion, "0.1.0");

  const { stdout } = await execFileAsync(
    process.execPath,
    [join(skillRoot, "scripts", "check_version.mjs")],
    { cwd: monorepoRoot },
  );
  const report = JSON.parse(stdout);

  assert.equal(report.current_skill_version, "0.1.0");
  assert.equal(report.skill_artifact_version, null);
  assert.equal(report.repo_version, "0.1.0");
  assert.equal(report.repo_skill_version, null);
  assert.equal(report.versions_differ, false);
});

test("sync_version generates detached skill artifact VERSION from root VERSION", async () => {
  await rm(join(skillRoot, "VERSION"), { force: true });
  const { stdout } = await execFileAsync(
    process.execPath,
    [join(skillRoot, "scripts", "sync_version.mjs")],
    { cwd: monorepoRoot },
  );
  const report = JSON.parse(stdout);

  try {
    assert.equal(report.repo_version, "0.1.0");
    assert.equal((await readFile(join(skillRoot, "VERSION"), "utf8")).trim(), "0.1.0");
    const checked = JSON.parse(
      (
        await execFileAsync(
          process.execPath,
          [join(skillRoot, "scripts", "check_version.mjs")],
          { cwd: monorepoRoot },
        )
      ).stdout,
    );
    assert.equal(checked.skill_artifact_version, "0.1.0");
    assert.equal(checked.versions_differ, false);
  } finally {
    await rm(join(skillRoot, "VERSION"), { force: true });
  }
});

test("forecastos_action defaults to bundled skill config when run from repo root", async () => {
  const rootDir = join(skillRoot, "test-output", "repo-root-default-action");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(rootDir, { recursive: true });
  const inputPath = join(rootDir, "draft.json");
  await writeFile(
    inputPath,
    JSON.stringify({
      prompt: "Which launcher wins June 2026?",
      requested_outcomes: ["Clawpump", "Liquid", "Virtuals", "Other"],
      source_hints: ["Public launchpad dashboards"],
      requested_close_time: "2026-06-30T23:59:59Z",
      requested_resolution_time: "2026-07-03T00:00:00Z",
    }),
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      join(skillRoot, "scripts", "forecastos_action.mjs"),
      "draft_market",
      "--input",
      inputPath,
    ],
    { cwd: monorepoRoot, env: envWithoutForecastState() },
  );
  const result = JSON.parse(stdout);

  try {
    assert.equal(await exists(join(monorepoRoot, ".forecastos", "config.json")), false);
    assert.equal(result.status, "ok");
    assert.equal(result.result.market.collateral_symbol, "USDC");
    assert.equal(result.result.market.collateral_address, configCollateralAddress);
    assert.equal(
      await exists(join(skillRoot, ".forecastos", "drafts", `${result.result.draft_id}.json`)),
      true,
    );
  } finally {
    await rm(join(skillRoot, ".forecastos", "drafts", `${result.result.draft_id}.json`), {
      force: true,
    });
  }
});

test("check_pending_market defaults to skill-local state when run from repo root", async () => {
  const workflowId = "workflow_default_state_pending_test";
  const workflowPath = join(skillRoot, ".forecastos", "workflows", "all", `${workflowId}.json`);
  await mkdir(dirname(workflowPath), { recursive: true });
  await writeFile(
    workflowPath,
    JSON.stringify({
      workflow_id: workflowId,
      step: "await_precog_approval",
      market_id: 999,
      upcoming_market: 999,
    }),
  );

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        join(skillRoot, "scripts", "check_pending_market.mjs"),
        "--workflow-id",
        workflowId,
      ],
      {
        cwd: monorepoRoot,
        env: {
          ...envWithoutForecastState(),
          FORECASTOS_TEST_PRECOG_RESPONSE: JSON.stringify([
            { id: 999, chain_id: configChainId, status: "PENDING" },
          ]),
        },
      },
    );
    const report = JSON.parse(stdout);

    assert.equal(report.status, "pending");
    assert.equal(report.precog_status, "PENDING");
    assert.equal(report.state.step, "await_precog_approval");
  } finally {
    await rm(workflowPath, { force: true });
    await rm(join(skillRoot, ".forecastos", "workflows", "await_precog_approval", `${workflowId}.json`), {
      force: true,
    });
  }
});

test("scripts keep FORECASTOS_STATE_DIR override ahead of skill-local default", async () => {
  const rootDir = join(skillRoot, "test-output", "state-dir-override");
  const stateDir = join(rootDir, ".forecastos");
  const workflowId = "workflow_state_dir_override";
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(join(stateDir, "workflows", "all"), { recursive: true });
  await writeFile(
    join(stateDir, "workflows", "all", `${workflowId}.json`),
    JSON.stringify({ workflow_id: workflowId, step: "create_market" }),
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [join(skillRoot, "scripts", "next_step.mjs"), "--workflow-id", workflowId],
    {
      cwd: monorepoRoot,
      env: { ...envWithoutForecastState(), FORECASTOS_STATE_DIR: stateDir },
    },
  );
  const guidance = JSON.parse(stdout);

  assert.equal(guidance.workflow_id, workflowId);
  assert.equal(guidance.next_action, "prepare_create_intent");
});

test("forecastos_action creates and advances files in .forecastos", async () => {
  const rootDir = join(skillRoot, "test-output");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(rootDir, { recursive: true });

  const inputPath = join(rootDir, "input.json");
  await writeFile(
    inputPath,
    JSON.stringify(
      {
        state: {
          step: "intake",
          prompt: "Create a market on which launchpad wins June 2026 agent launches",
        },
        event: {
          input: {
            prompt: "Create a market on which launchpad wins June 2026 agent launches",
            requested_outcomes: ["Clawpump", "Liquid", "Virtuals", "Other"],
            source_hints: ["Public launchpad dashboards"],
            requested_close_time: "2026-06-30T23:59:59Z",
            requested_resolution_time: "2026-07-03T00:00:00Z",
          },
        },
      },
      null,
      2,
    ),
  );

  const drafted = await runActionBridge("run_skill_step", inputPath, stateDir);
  const draftId = drafted.result.state.draft_id;
  const workflowId = drafted.result.state.workflow_id;

  assert.equal(drafted.status, "ok");
  assert.equal(drafted.runtime, "bundled");
  assert.equal(drafted.result.state.step, "await_approval");
  assert.equal(
    (await readJson(join(stateDir, "drafts", `${draftId}.json`))).market.market_type,
    "multi_outcome",
  );
  assert.equal(
    (await readJson(join(stateDir, "workflows", "all", `${workflowId}.json`))).step,
    "await_approval",
  );
  assert.equal(
    (
      await readJson(
        join(stateDir, "workflows", "await_approval", `${workflowId}.json`),
      )
    ).workflow_id,
    workflowId,
  );

  const approvalInputPath = join(rootDir, "approval.json");
  await writeFile(
    approvalInputPath,
    JSON.stringify(
      {
        state: drafted.result.state,
        event: {
          approved: true,
          approved_by: "operator",
          approval: "yes",
        },
      },
      null,
      2,
    ),
  );

  const approved = await runActionBridge(
    "run_skill_step",
    approvalInputPath,
    stateDir,
  );

  assert.equal(approved.status, "ok");
  assert.equal(approved.result.state.step, "create_market");
  assert.ok(approved.result.agent_message.includes("What wallet or wallet/action tool"));
  assert.ok(approved.result.agent_message.includes("Bankr"));
  assert.ok(approved.result.agent_message.includes("Privy"));
  assert.ok(approved.result.agent_message.includes("EOA-compatible"));
  assert.ok(approved.result.agent_message.includes("https://core.precog.markets/launchpad/"));
  assert.equal(approved.result.state.approved_draft_id, draftId);
  assert.equal(approved.result.state.approved_draft_hash, drafted.result.state.draft_hash);
  assert.equal(
    (await readJson(join(stateDir, "workflows", "all", `${workflowId}.json`))).step,
    "create_market",
  );
  assert.equal(
    (
      await readJson(join(stateDir, "workflows", "create_market", `${workflowId}.json`))
    ).workflow_id,
    workflowId,
  );
  await assert.rejects(
    readFile(join(stateDir, "workflows", "await_approval", `${workflowId}.json`), "utf8"),
  );
});

test("forecastos_action accepts UTF-8 BOM input JSON", async () => {
  const rootDir = join(skillRoot, "test-output", "bom-input");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(rootDir, { recursive: true });

  const inputPath = join(rootDir, "input.json");
  await writeFile(
    inputPath,
    `\uFEFF${JSON.stringify({
      state: { step: "intake", prompt: "Which team wins the event?" },
      event: {
        input: {
          prompt: "Which team wins the event?",
          requested_outcomes: ["Team A", "Team B", "Other"],
          source_hints: ["Official event results"],
          requested_close_time: "2026-10-15T00:00:00Z",
          requested_resolution_time: "2026-11-15T12:00:00Z",
        },
      },
    })}`,
  );

  const result = await runActionBridge("run_skill_step", inputPath, stateDir);

  assert.equal(result.status, "ok");
  assert.equal(result.result.state.step, "await_approval");
});

test("bundled runtime builds Precog create and fund requests from local config", async () => {
  const rootDir = join(skillRoot, "api-test-output");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: shippedConfig.precog.api_root,
        open_api_key: "test-open-api-key",
        chain_id: configChainId,
        deployed_master_address: "0xMaster",
        default_collateral_address: configCollateralAddress,
        default_collateral_symbol: "USDC",
        signature_actions: configSignatureActions,
      },
    }),
  );

  const requests = [];
  const forecastos = createForecastOS({
    store: new DirectoryDraftStateStore(stateDir),
    fetch: async (url, options) => {
      requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      const body = url.includes("/upcoming-markets/")
        ? [{ id: 428, chain_id: configChainId, deployed_master_address: "0xMaster", status: "VALIDATED" }]
        : url.includes("/markets/")
        ? [{
            id: 1,
            status: "OPEN",
            oracle_status: "EOA",
            reported_result: null,
            funding_amount: 100,
            outcomes: "Clawpump,Liquid,Virtuals,Other",
            outcomes_prices: "0.4,0.3,0.2,0.1",
            master_address: "0xMaster",
            master_market_id: 1,
            contract_address: "0xContract",
          }]
        : url.endsWith("/create-upcoming-market/")
        ? {
            upcoming_market: 428,
            status: "CREATED",
            url: "https://backend.example/ignored",
          }
        : { upcoming_market: 428, status: "FUNDED", funding_amount: 100.0 };
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(body);
        },
      };
    },
    now: () => new Date("2026-06-01T12:00:00Z"),
  });
  const draft = await forecastos.draftMarket({
    prompt: "Which launchpad gets the most new agents in June 2026?",
    requested_outcomes: ["Clawpump", "Liquid", "Virtuals", "Other"],
    source_hints: ["Public launchpad dashboards"],
    requested_close_time: "2026-06-30T23:59:59Z",
    requested_resolution_time: "2026-07-03T00:00:00Z",
  });

  const createIntent = await forecastos.prepareCreateIntent({
    draft_id: draft.draft_id,
    approval_text: draft.approval_text,
    image_url: "https://example.com/image.png",
    chain_id: 999999,
  });
  assert.equal(createIntent.intent_type, "forecastos.create_market");
  assert.equal(createIntent.chain_id, configChainId);
  assert.equal(createIntent.network, undefined);
  assert.equal(createIntent.eip712_typed_data_template.primaryType, "PrecogMarketAuthorization");
  assert.deepEqual(createIntent.eip712_typed_data_template.domain, {
    name: "Precog Markets",
    version: "1",
    chainId: configChainId,
    verifyingContract: "0xMaster",
  });
  assert.deepEqual(createIntent.eip712_typed_data_template.message, {
    action: "CREATE_UPCOMING_MARKET",
    account: "<creator_address>",
    chainId: configChainId,
    nonce: "<next_pending_nonce>",
  });
  assert.equal(createIntent.precog_payload_template.chain_id, configChainId);
  assert.equal(createIntent.precog_payload_template.network, undefined);

  const created = await forecastos.createMarket({
    draft_id: draft.draft_id,
    approved: true,
    approved_by: "operator",
    approval_text: draft.approval_text,
    image_url: "https://example.com/image.png",
    chain_id: 999999,
    creator_address: "0xCreator",
    creator_signature: "0xCreatorSignature",
  });
  const approved = await forecastos.awaitPrecogApproval({
    step: "await_precog_approval",
    market_id: created.market_id,
  });
  const smartAccountFundingSignature = "0x" + "ab".repeat(96);
  const funded = await forecastos.fundMarket(
    { step: "fund", market_id: created.market_id, precog_approval: { status: "VALIDATED" } },
    {
      approved: true,
      funding_request: {
        amount: "1",
        tx_hash: "0xTransactionHash",
        funder_address: "0xFunder",
        funder_signature: smartAccountFundingSignature,
      },
    },
  );
  const consumed = await forecastos.consumePrediction(
    {
      step: "consume_prediction",
      market_id: created.market_id,
      deployed_market_id: 1,
      funding_result: funded,
    },
    {},
  );

  assert.equal(created.market_id, 428);
  assert.equal(created.chain_id, configChainId);
  assert.equal(
    created.url,
    `https://core.precog.markets/launchpad/${configChainId}/428/which-launchpad-gets-the-most-new-agents-in-june-2026`,
  );
  assert.equal(created.precog_response.url, "https://backend.example/ignored");
  assert.equal(approved.precog_status, "VALIDATED");
  assert.equal(approved.ready_to_fund, true);
  assert.equal(funded.precog_status, "FUNDED");
  assert.equal(consumed.ready_to_finish, true);
  assert.deepEqual(consumed.signal.outcomes_prices, [0.4, 0.3, 0.2, 0.1]);
  assert.equal(requests[0].url, `${shippedConfig.precog.api_root}api/v1/create-upcoming-market/`);
  assert.equal(requests[1].url, `${shippedConfig.precog.api_root}api/v1/upcoming-markets/?chain_id=${configChainId}&id=428`);
  assert.ok(!requests[1].url.includes("deployed_master_address"));
  assert.equal(requests[2].url, `${shippedConfig.precog.api_root}api/v1/fund-upcoming-market/`);
  assert.equal(requests[3].url, `${shippedConfig.precog.api_root}api/v1/markets/?chain_id=${configChainId}&master_address=0xMaster&master_market_id=1`);
  assert.ok(requests[3].url.includes("master_address=0xMaster"));
  assert.equal(requests[0].options.headers["x-api-key"], "test-open-api-key");
  assert.equal(requests[0].body.outcomes, "Clawpump,Liquid,Virtuals,Other");
  assert.equal(requests[0].body.chain_id, configChainId);
  assert.equal(requests[0].body.network, undefined);
  assert.equal(requests[0].body.collateral_address, configCollateralAddress);
  assert.equal(requests[0].body.start_timestamp, Date.parse("2026-06-01T12:00:00Z") / 1000);
  assert.equal(requests[0].body.end_timestamp, Date.parse("2026-06-30T23:59:59Z") / 1000);
  assert.notEqual(requests[0].body.end_timestamp, Date.parse("2026-07-03T00:00:00Z") / 1000);
  assert.equal(requests[2].body.upcoming_market, 428);
  assert.equal(requests[2].body.amount, "1");
  assert.equal(requests[2].body.funder_signature, smartAccountFundingSignature);
});

test("create_market sends comma-safe outcome labels", async () => {
  const rootDir = join(skillRoot, "api-test-output", "comma-safe-outcomes");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: shippedConfig.precog.api_root,
        open_api_key: "test-open-api-key",
        chain_id: configChainId,
        deployed_master_address: "0xMaster",
        default_collateral_address: configCollateralAddress,
        default_collateral_symbol: "USDC",
        signature_actions: configSignatureActions,
      },
    }),
  );

  const requests = [];
  const forecastos = createForecastOS({
    store: new DirectoryDraftStateStore(stateDir),
    fetch: async (url, options) => {
      requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ upcoming_market: 777, status: "CREATED" });
        },
      };
    },
    now: () => new Date("2026-05-28T00:00:00Z"),
  });
  const draft = await forecastos.draftMarket({
    prompt: "When will Strait of Hormuz traffic return to normal?",
    requested_outcomes: [
      "June 1-15, 2026",
      "June 16-30, 2026",
      "July 1-31, 2026",
      "No normal by Jul 31, 2026",
    ],
    source_hints: ["Official maritime traffic authority reports"],
    requested_close_time: "2026-06-30T23:00:00Z",
    requested_resolution_time: "2026-07-31T23:59:59Z",
  });

  await forecastos.createMarket({
    draft_id: draft.draft_id,
    approved: true,
    approved_by: "operator",
    approval_text: draft.approval_text,
    image_url: "https://example.com/image.png",
    creator_address: "0xCreator",
    creator_signature: "0xCreatorSignature",
  });

  assert.deepEqual(draft.market.outcomes, [
    "June 1-15 2026",
    "June 16-30 2026",
    "July 1-31 2026",
    "No normal by Jul 31 2026",
  ]);
  assert.equal(
    requests[0].body.outcomes,
    "June 1-15 2026,June 16-30 2026,July 1-31 2026,No normal by Jul 31 2026",
  );
  assert.equal(requests[0].body.outcomes.split(",").length, 4);
});

test("bundled runtime rejects Base MCP smart-account create signatures before API submission", async () => {
  const rootDir = join(skillRoot, "api-test-output", "base-mcp-create-signature");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: shippedConfig.precog.api_root,
        open_api_key: "test-open-api-key",
        chain_id: configChainId,
        deployed_master_address: "0xMaster",
        default_collateral_address: configCollateralAddress,
        default_collateral_symbol: "USDC",
        signature_actions: configSignatureActions,
      },
    }),
  );

  const requests = [];
  const forecastos = createForecastOS({
    store: new DirectoryDraftStateStore(stateDir),
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, async text() { return "{}"; } };
    },
  });
  const draft = await forecastos.draftMarket({
    prompt: "Will the test market resolve?",
    requested_outcomes: ["Yes", "No", "Other"],
    source_hints: ["Official source"],
    requested_close_time: "2026-06-30T23:59:59Z",
    requested_resolution_time: "2026-07-03T00:00:00Z",
  });

  await assert.rejects(
    forecastos.createMarket({
      draft_id: draft.draft_id,
      approved: true,
      approved_by: "operator",
      approval_text: draft.approval_text,
      image_url: "https://example.com/image.png",
      creator_address: "0x2222222222222222222222222222222222222222",
      creator_signature: "0x" + "ab".repeat(96),
      wallet_provider: "base-mcp",
    }),
    (error) => {
      assert.equal(error.code, "FORECASTOS_WALLET_SIGNATURE_UNSUPPORTED");
      assert.match(error.message, /smart-account\/WebAuthn signature/);
      return true;
    },
  );
  assert.equal(requests.length, 0);
});

test("wallet-resolved create through run_skill_step persists await_precog_approval", async () => {
  const rootDir = join(skillRoot, "api-test-output", "wallet-resolved-create-step");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: shippedConfig.precog.api_root,
        open_api_key: "test-open-api-key",
        chain_id: configChainId,
        deployed_master_address: "0xMaster",
        default_collateral_address: configCollateralAddress,
        default_collateral_symbol: "USDC",
        signature_actions: configSignatureActions,
      },
    }),
  );

  const forecastos = createForecastOS({
    store: new DirectoryDraftStateStore(stateDir),
    fetch: async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ upcoming_market: 456, status: "CREATED" });
      },
    }),
  });
  const draft = await forecastos.draftMarket({
    prompt: "Which launcher gets the most new agents in June 2026?",
    requested_outcomes: ["Clawpump", "Liquid", "Virtuals", "Other"],
    source_hints: ["Public launchpad dashboards"],
    requested_close_time: "2026-06-30T23:59:59Z",
    requested_resolution_time: "2026-07-03T00:00:00Z",
  });
  const workflowId = "workflow_wallet_resolved_create";
  const result = await forecastos.runSkillStep(
    {
      workflow_id: workflowId,
      step: "create_market",
      draft_id: draft.draft_id,
      draft_hash: draft.draft_hash,
      approval_text: draft.approval_text,
      approved_by: "operator",
      approved_draft_id: draft.draft_id,
      approved_draft_hash: draft.draft_hash,
    },
    {
      image_url: "https://example.com/image.png",
      creator_address: "0xCreator",
      creator_signature: "0xCreatorSignature",
    },
  );

  assert.equal(result.state.step, "await_precog_approval");
  assert.equal(result.state.market_id, 456);
  assert.equal(
    result.state.market_url,
    `https://core.precog.markets/launchpad/${configChainId}/456/which-launcher-gets-the-most-new-agents-in-june-2026`,
  );
  assert.ok(result.agent_message.includes("Which launcher gets the most new agents in June 2026?"));
  assert.ok(result.agent_message.includes(result.state.market_url));
  assert.equal(
    (await readJson(join(stateDir, "workflows", "all", `${workflowId}.json`))).step,
    "await_precog_approval",
  );
  assert.equal(
    (
      await readJson(
        join(stateDir, "workflows", "await_precog_approval", `${workflowId}.json`),
      )
    ).market_id,
    456,
  );
});

test("forecastos_action merges wallet output for create submission", async () => {
  const rootDir = join(skillRoot, "test-output", "create-wallet-output-merge");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(rootDir, { recursive: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: shippedConfig.precog.api_root,
        open_api_key: "test-open-api-key",
        chain_id: configChainId,
        deployed_master_address: "0xMaster",
        default_collateral_address: configCollateralAddress,
        default_collateral_symbol: "USDC",
        signature_actions: configSignatureActions,
      },
    }),
  );
  const inputPath = join(rootDir, "create.json");
  const walletOutputPath = join(rootDir, "wallet-output.json");
  await writeFile(
    inputPath,
    JSON.stringify({
      approved: true,
      image_url: "https://example.com/image.png",
      creator_address: "0xCreator",
      approved_draft_hash: "hash",
    }),
  );
  await writeFile(
    walletOutputPath,
    JSON.stringify({
      event: {
        creator_signature: "0xCreatorSignature",
        wallet_provider: "privy",
      },
    }),
  );

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        join(skillRoot, "scripts", "forecastos_action.mjs"),
        "create_market",
        "--input",
        inputPath,
        "--wallet-output",
        walletOutputPath,
      ],
      { env: { ...process.env, FORECASTOS_STATE_DIR: stateDir } },
    ),
    (error) => {
      const stderr = String(error.stderr ?? "");
      assert.ok(stderr.includes("Draft not found"));
      assert.ok(!stderr.includes("creator_signature"));
      return true;
    },
  );
});

test("draft_market blocks binary yes/no drafts under multi-outcome default", async () => {
  const rootDir = join(skillRoot, "test-output", "binary-outcomes-blocked");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });

  const forecastos = createForecastOS({
    store: new DirectoryDraftStateStore(stateDir),
  });
  const draft = await forecastos.draftMarket({
    prompt: "Will Bilibili Gaming reach the 2026 Worlds Grand Final?",
    requested_outcomes: ["Yes", "No"],
    source_hints: ["Official Riot Games / LoL Esports results"],
    requested_close_time: "2026-10-15T00:00:00Z",
    requested_resolution_time: "2026-11-15T12:00:00Z",
  });

  assert.equal(draft.status, "blocked");
  assert.ok(draft.missing_fields.includes("at_least_three_outcomes"));
  assert.ok(
    draft.quality.blocking_issues.some((issue) =>
      issue.includes("requires at least three explicit outcomes"),
    ),
  );
});

test("draft_market turns missing info into human-friendly questions", async () => {
  const forecastos = await createIsolatedForecastOS("friendly-missing-info");
  const draft = await forecastos.draftMarket({
    prompt: "Will Bilibili Gaming reach the 2026 Worlds Grand Final?",
    requested_outcomes: ["Yes", "No"],
  });

  assert.equal(draft.status, "blocked");
  assert.ok(draft.suggest_next_questions.some((question) => question.includes("official source")));
  assert.ok(draft.suggest_next_questions.some((question) => question.includes("trading close")));
  assert.ok(draft.suggest_next_questions.some((question) => question.includes("market resolve")));
  assert.ok(draft.suggest_next_questions.some((question) => question.includes("three concrete outcomes")));
  assert.ok(draft.review_message.includes("I need a little more before this draft can be approved."));
  assert.ok(draft.review_message.includes("Questions:"));
  assert.ok(draft.review_message.includes("Next: answer the questions above"));
  assert.ok(!draft.review_message.includes("Missing source_of_truth"));
  assert.ok(!draft.review_message.includes("at_least_three_outcomes"));
  assert.ok(!draft.review_message.includes("{"));
  assert.ok(!draft.review_message.includes("draft_"));
  assert.ok(!draft.review_message.includes("hash_"));
});

test("skill docs tell agents to use the action bridge and split yes/no prompts", async () => {
  const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
  const template = await readFile(
    join(skillRoot, "assets", "templates", "multi-outcome-market.md"),
    "utf8",
  );

  assert.ok(skill.includes("Do not hand-write or paste ForecastOS-looking JSON"));
  assert.ok(skill.includes("run_skill_step"));
  assert.ok(skill.includes("Do not use only `Yes` / `No` outcomes"));
  assert.ok(template.includes("at least three explicit outcome labels"));
  assert.ok(template.includes("Team X qualifies but is eliminated before the final"));
});

test("draft review is chat-facing and ends with next steps", async () => {
  const forecastos = await createIsolatedForecastOS("chat-facing-review");
  const draft = await forecastos.draftMarket({
    prompt: "Which team wins the event?",
    requested_outcomes: ["Team A", "Team B", "Other"],
    source_hints: ["Official event results"],
    requested_close_time: "2026-10-15T00:00:00Z",
    requested_resolution_time: "2026-11-15T12:00:00Z",
  });

  assert.ok(draft.review_message.includes("Draft ready for review."));
  assert.ok(draft.review_message.includes("Next: reply yes to approve"));
  assert.ok(!draft.review_message.includes("{"));
  assert.ok(!draft.review_message.includes("draft_"));
  assert.ok(!draft.review_message.includes("hash_"));
});

test("draft_market generates detailed default resolution criteria", async () => {
  const forecastos = await createIsolatedForecastOS("detailed-resolution-criteria");
  const draft = await forecastos.draftMarket({
    prompt: "When will Strait of Hormuz traffic return to normal?",
    requested_outcomes: [
      "June 1-15, 2026",
      "June 16-30, 2026",
      "Not returned to normal by July 31, 2026 / no reliable resolution",
    ],
    source_hints: ["Official maritime traffic authority reports"],
    requested_close_time: "2026-06-30T23:00:00Z",
    requested_resolution_time: "2026-07-31T23:59:59Z",
  });

  assert.deepEqual(draft.market.outcomes, [
    "June 1-15 2026",
    "June 16-30 2026",
    "Not returned to normal by July 31 2026 / no reliable resolution",
  ]);
  assert.ok(draft.market.resolution_criteria.includes("Official maritime traffic authority reports"));
  assert.ok(draft.market.resolution_criteria.includes("Resolve to exactly one listed outcome"));
  assert.ok(draft.market.resolution_criteria.includes("2026-07-31T23:59:59.000Z UTC"));
  assert.ok(
    draft.market.resolution_criteria.includes(
      'resolve to "Not returned to normal by July 31 2026 / no reliable resolution"',
    ),
  );
  assert.ok(draft.review_message.includes("Resolution criteria:"));
});

test("skill docs forbid raw JSON as normal chat output and require next step prompt", async () => {
  const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
  const workflow = await readFile(join(skillRoot, "references", "workflow.md"), "utf8");

  assert.ok(skill.includes("Do not hand-write or paste ForecastOS-looking JSON"));
  assert.ok(skill.includes("Every draft response must end with a next-step prompt"));
  assert.ok(skill.includes("Do not expose raw JSON"));
  assert.ok(workflow.includes("not raw JSON"));
});

test("skill triggers for prediction-market discovery before probability guesses", async () => {
  const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
  const externalMarkets = await readFile(join(skillRoot, "references", "external-markets.md"), "utf8");
  const polymarketRead = await readFile(join(skillRoot, "references", "providers", "polymarket-read.md"), "utf8");
  const agentMetadata = await readFile(join(skillRoot, "agents", "openai.yaml"), "utf8");

  assert.ok(skill.includes("future-event probability"));
  assert.ok(skill.includes("decision/planning uncertainty"));
  assert.ok(skill.includes("whether there is a prediction market"));
  assert.ok(skill.includes('"is there a prediction market about..."'));
  assert.ok(skill.includes("Before inventing or guessing a probability, search read-only"));
  assert.ok(skill.includes("forecastos_search_markets"));
  assert.ok(skill.includes("Do not substitute generic web search"));
  assert.ok(skill.includes("Always check Precog"));
  assert.ok(skill.includes("then Kalshi, then Polymarket"));
  assert.ok(externalMarkets.includes("Market Discovery Workflow"));
  assert.ok(externalMarkets.includes("search provider data before guessing a"));
  assert.ok(externalMarkets.includes("Precog first, then Kalshi, then Polymarket"));
  assert.ok(externalMarkets.includes("provider API-backed tools"));
  assert.ok(externalMarkets.includes("generic search-engine result pages"));
  assert.ok(externalMarkets.includes("/api/v1/markets/"));
  assert.ok(externalMarkets.includes("status=OPEN"));
  assert.ok(externalMarkets.includes("FORECASTOS_STATE_DIR/config.local.json"));
  assert.ok(externalMarkets.includes("before falling back"));
  assert.ok(externalMarkets.includes("do not use the upcoming-market lifecycle endpoint"));
  assert.ok(externalMarkets.includes("Gamma `/public-search` endpoint"));
  assert.ok(polymarketRead.includes("GET /public-search"));
  assert.ok(polymarketRead.includes("search_profiles=false"));
  assert.ok(polymarketRead.includes("search_tags=false"));
  assert.ok(externalMarkets.includes("avoid presenting a guessed probability as market-implied"));
  assert.ok(agentMetadata.includes("Search prediction markets"));
  assert.ok(agentMetadata.includes("avoid guessing future-event probabilities"));
});

test("skill documents Precog liquidity and creator economics", async () => {
  const files = [
    "SKILL.md",
    "references/actions.md",
    "references/action-policy.md",
    "references/tool-schemas.md",
    "references/workflow.md",
    "references/precog-liquidity.md",
  ];
  const combined = (await Promise.all(files.map((file) => readFile(join(skillRoot, file), "utf8")))).join("\n");
  const liquidity = await readFile(join(skillRoot, "references", "precog-liquidity.md"), "utf8");

  assert.ok(combined.includes("Liquidity And Creator Economics"));
  assert.ok(combined.includes("profit pool"));
  assert.ok(combined.includes("90% to LPs"));
  assert.ok(combined.includes("5% to the market creator"));
  assert.ok(combined.includes("creator boost"));
  assert.ok(combined.includes("LP positions are locked until market resolution"));
  assert.ok(combined.toLowerCase().includes("funding still requires explicit approval"));
  assert.ok(liquidity.includes("Virtual liquidity"));
  assert.ok(liquidity.includes("Max Loss"));
  assert.ok(liquidity.includes("not guaranteed"));
});

test("skill treats MCP as optional read-only context, not the production gate", async () => {
  const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
  const mcpDoc = await readFile(join(skillRoot, "references", "mcp.md"), "utf8");
  const remoteMcpDoc = await readFile(join(skillRoot, "references", "remote-mcp.md"), "utf8");
  const mcpConfigPath = join(monorepoRoot, "adapters", "hosts", "codex", "mcp.json");

  assert.ok(skill.includes("Do not require MCP for normal drafting or creation."));
  assert.ok(skill.includes("Use `scripts/forecastos_action.mjs` for workflow execution"));
  assert.ok(mcpDoc.includes("optional read-only context"));
  assert.ok(mcpDoc.includes("adapters/hosts/codex/mcp.json"));
  assert.ok(remoteMcpDoc.includes("future or advanced infrastructure planning"));
  if (await exists(mcpConfigPath)) {
    const mcpConfig = JSON.parse(await readFile(mcpConfigPath, "utf8"));
    assert.deepEqual(mcpConfig.servers.forecastos.args, [
      "../../../mcp/forecast-os-mcp-server/dist/stdio.js",
    ]);
    assert.equal(
      mcpConfig.servers.forecastos.env.FORECASTOS_STATE_DIR,
      "../../../skill/forecast-os/.forecastos",
    );
  }
});

test("Claude host adapter uses Claude MCP shape and keeps host boundaries", async () => {
  const claudeRoot = join(monorepoRoot, "adapters", "hosts", "claude");
  const claudeConfig = JSON.parse(await readFile(join(claudeRoot, ".mcp.json"), "utf8"));
  const claudeReadme = await readFile(join(claudeRoot, "README.md"), "utf8");
  const claudeSkill = await readFile(join(claudeRoot, "forecast-os", "SKILL.md"), "utf8");
  const claudeWorkflow = await readFile(join(claudeRoot, "forecast-os", "references", "claude-workflow.md"), "utf8");
  const combined = [claudeReadme, claudeSkill, claudeWorkflow].join("\n");

  assert.ok(claudeConfig.mcpServers.forecastos);
  assert.equal(claudeConfig.servers, undefined);
  assert.ok(claudeConfig.mcpServers.forecastos.args.some((arg) => arg.includes("mcp/forecast-os-mcp-server/dist/stdio.js")));
  assert.ok(claudeConfig.mcpServers.forecastos.env.FORECASTOS_STATE_DIR.includes("skill/forecast-os/.forecastos"));
  assert.match(claudeSkill, /^---\nname: forecast-os\ndescription: /);
  assert.ok(claudeSkill.includes("Use ForecastOS whenever"));
  assert.ok(combined.includes("read-only"));
  assert.ok(combined.includes("does not add wallet signing"));
  assert.ok(combined.includes("wallet/action providers stay"));
  assert.ok(!combined.includes("/wallet/sign"));
  assert.ok(!combined.includes("/wallet/submit"));
});

test("Cursor host adapter exposes a native Agent Skill package", async () => {
  const cursorSkillRoot = join(monorepoRoot, "adapters", "hosts", "cursor", "forecast-os");
  const cursorSkill = await readFile(join(cursorSkillRoot, "SKILL.md"), "utf8");
  const cursorWorkflow = await readFile(join(cursorSkillRoot, "references", "cursor-workflow.md"), "utf8");
  const setupScript = await readFile(join(cursorSkillRoot, "scripts", "check-cursor-setup.mjs"), "utf8");
  const forwarder = await readFile(join(cursorSkillRoot, "scripts", "forecastos-action.mjs"), "utf8");
  const topLevel = (await readdir(cursorSkillRoot)).sort();
  const combined = [cursorSkill, cursorWorkflow, setupScript, forwarder].join("\n");

  assert.deepEqual(topLevel, ["SKILL.md", "references", "scripts"]);
  assert.match(cursorSkill, /^---\nname: forecast-os\ndescription: /);
  assert.ok(!cursorSkill.includes("paths:"));
  assert.ok(!cursorSkill.includes("disable-model-invocation"));
  assert.ok(cursorSkill.includes("Use ForecastOS whenever"));
  assert.ok(cursorSkill.includes("scripts/check-cursor-setup.mjs"));
  assert.ok(cursorSkill.includes("scripts/forecastos-action.mjs"));
  assert.ok(cursorWorkflow.includes(".cursor/skills/forecast-os"));
  assert.ok(cursorWorkflow.includes(".agents/skills/forecast-os"));
  assert.ok(cursorWorkflow.includes("~/.cursor/skills/forecast-os"));
  assert.ok(cursorWorkflow.includes("~/.agents/skills/forecast-os"));
  assert.ok(cursorWorkflow.includes("Codex and Claude skill folders"));
  assert.ok(combined.includes("FORECASTOS_REPO_ROOT"));
  assert.ok(combined.includes("skill/forecast-os/scripts/forecastos_action.mjs"));
  assert.ok(combined.includes("adapters/wallets"));
  assert.ok(combined.includes("explicit approval") || combined.includes("approval"));
  assert.ok(combined.includes("private keys"));
  assert.ok(combined.includes("raw signatures"));
  assert.ok(combined.includes("token approval"));
  assert.ok(!combined.includes("/wallet/sign"));
  assert.ok(!combined.includes("/wallet/submit"));
  assert.ok(!combined.includes("BANKR_API_KEY"));

  const setupResult = await execFileAsync(
    process.execPath,
    [join(cursorSkillRoot, "scripts", "check-cursor-setup.mjs")],
    { cwd: monorepoRoot },
  );
  const setup = JSON.parse(setupResult.stdout);
  assert.equal(setup.ok, true);
  assert.equal(setup.forecastos_repo_root, monorepoRoot);
  assert.ok(setup.checks.some((check) => check.name === "forecastos_action" && check.ok));

  const cursorRoot = join(skillRoot, "test-output", "cursor-adapter");
  const cursorStateDir = join(cursorRoot, ".forecastos");
  const cursorInput = join(cursorRoot, "draft-input.json");
  await rm(cursorRoot, { recursive: true, force: true });
  await mkdir(cursorStateDir, { recursive: true });
  await writeFile(
    cursorInput,
    JSON.stringify({
      prompt: "Which launcher leads June agents?",
      requested_outcomes: ["Clawpump", "Liquid", "Virtuals", "Other"],
      requested_close_time: "2026-06-30T23:00:00Z",
      requested_resolution_time: "2026-07-01T12:00:00Z",
      source_hints: ["Official public leaderboard"],
    }),
  );
  const forwarded = await execFileAsync(
    process.execPath,
    [join(cursorSkillRoot, "scripts", "forecastos-action.mjs"), "draft_market", "--input", cursorInput],
    { cwd: monorepoRoot, env: { ...process.env, FORECASTOS_STATE_DIR: cursorStateDir } },
  );
  const draft = JSON.parse(forwarded.stdout);
  assert.equal(draft.status, "ok");
  assert.ok(draft.result.review_message.includes("Which launcher leads June agents?"));
});

test("Hermes host adapter exposes a normal skill package and optional plugin wrapper", async () => {
  const hermesRoot = join(monorepoRoot, "adapters", "hosts", "hermes");
  const hermesSkillRoot = join(hermesRoot, "skills", "prediction", "forecast-os");
  const hermesSkill = await readFile(join(hermesSkillRoot, "SKILL.md"), "utf8");
  const hermesWorkflow = await readFile(join(hermesSkillRoot, "references", "hermes-workflow.md"), "utf8");
  const hermesReadme = await readFile(join(hermesRoot, "README.md"), "utf8");
  const setupScript = await readFile(join(hermesSkillRoot, "scripts", "check-hermes-setup.mjs"), "utf8");
  const pluginYaml = await readFile(join(hermesRoot, "forecast-os", "plugin.yaml"), "utf8");
  const topLevel = (await readdir(hermesSkillRoot)).sort();
  const combined = [hermesSkill, hermesWorkflow, hermesReadme].join("\n");

  assert.deepEqual(topLevel, ["SKILL.md", "references", "scripts"]);
  assert.match(hermesSkill, /^---\nname: forecast-os\ndescription: /);
  assert.ok(hermesSkill.includes("version: 0.1.0"));
  assert.ok(hermesSkill.includes("author: ForecastOS"));
  assert.ok(hermesSkill.includes("license: UNLICENSED"));
  assert.ok(hermesSkill.includes("metadata:\n  hermes:"));
  assert.ok(hermesSkill.includes("## When to Use"));
  assert.ok(hermesSkill.includes("## Quick Reference"));
  assert.ok(hermesSkill.includes("## Procedure"));
  assert.ok(hermesSkill.includes("## Pitfalls"));
  assert.ok(hermesSkill.includes("## Verification"));
  assert.ok(hermesSkill.includes("${HERMES_SKILL_DIR}/scripts/check-hermes-setup.mjs"));
  assert.ok(!hermesSkill.includes("required_environment_variables"));
  assert.ok(!hermesSkill.includes("BANKR_API_KEY"));
  assert.ok(combined.includes("~/.hermes/skills/prediction/forecast-os"));
  assert.ok(combined.includes("skills.external_dirs"));
  assert.ok(combined.includes("skill/forecast-os/scripts/forecastos_action.mjs"));
  assert.ok(combined.includes("approval rules"));
  assert.ok(combined.includes("does not replace the skill package"));
  assert.ok(pluginYaml.includes("provides_tools"));
  assert.ok(pluginYaml.includes("forecastos_action"));
  assert.ok(setupScript.includes("FORECASTOS_REPO_ROOT"));

  const { stdout } = await execFileAsync(
    process.execPath,
    [join(hermesSkillRoot, "scripts", "check-hermes-setup.mjs")],
    { cwd: monorepoRoot },
  );
  const setup = JSON.parse(stdout);
  assert.equal(setup.ok, true);
  assert.equal(setup.forecastos_repo_root, monorepoRoot);
  assert.ok(setup.checks.some((check) => check.name === "forecastos_action" && check.ok));
});

test("create_market allows explicit collateral override while keeping config chain", async () => {
  const rootDir = join(skillRoot, "api-test-output", "collateral-override");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: shippedConfig.precog.api_root,
        open_api_key: "test-open-api-key",
        chain_id: configChainId,
        default_collateral_address: configCollateralAddress,
        default_collateral_symbol: "USDC",
        signature_actions: configSignatureActions,
      },
    }),
  );

  const requests = [];
  const forecastos = createForecastOS({
    store: new DirectoryDraftStateStore(stateDir),
    fetch: async (url, options) => {
      requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ upcoming_market: 123, status: "PENDING" });
        },
      };
    },
    now: () => new Date("2026-06-01T12:00:00Z"),
  });
  const draft = await forecastos.draftMarket({
    prompt: "Which launchpad gets the most new agents in June 2026?",
    requested_outcomes: ["Clawpump", "Liquid", "Virtuals", "Other"],
    source_hints: ["Public launchpad dashboards"],
    requested_close_time: "2026-06-30T23:59:59Z",
    requested_resolution_time: "2026-07-03T00:00:00Z",
  });

  await forecastos.createMarket({
    draft_id: draft.draft_id,
    approved: true,
    approved_by: "operator",
    approval_text: draft.approval_text,
    image_url: "https://example.com/image.png",
    collateral_address: "0xCustomCollateral",
    chain_id: 999999,
    creator_address: "0xCreator",
    creator_signature: "0xCreatorSignature",
  });

  assert.equal(requests[0].body.chain_id, configChainId);
  assert.equal(requests[0].body.collateral_address, "0xCustomCollateral");
});

test("non-AI draft categories are not silently overwritten", async () => {
  const rootDir = join(skillRoot, "api-test-output", "non-ai-category");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: shippedConfig.precog.api_root,
        open_api_key: "test-open-api-key",
        chain_id: configChainId,
        default_collateral_address: configCollateralAddress,
        default_collateral_symbol: "USDC",
        signature_actions: configSignatureActions,
      },
    }),
  );

  const requests = [];
  const forecastos = createForecastOS({
    store: new DirectoryDraftStateStore(stateDir),
    fetch: async (url, options) => {
      requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ upcoming_market: 123, status: "PENDING" });
        },
      };
    },
  });
  const draft = await forecastos.draftMarket({
    prompt: "Which licensed toy brand gets announced next?",
    preferred_category: "culture",
    requested_outcomes: ["Brand A", "Brand B", "Other"],
    source_hints: ["Official announcements"],
    requested_close_time: "2026-06-30T23:59:59Z",
    requested_resolution_time: "2026-07-03T00:00:00Z",
  });

  await forecastos.createMarket({
    draft_id: draft.draft_id,
    approved: true,
    approved_by: "operator",
    approval_text: draft.approval_text,
    image_url: "https://example.com/image.png",
    creator_address: "0xCreator",
    creator_signature: "0xCreatorSignature",
  });

  assert.equal(requests[0].body.category, "culture");
});

test("create_market fails clearly without config default collateral or override", async () => {
  const rootDir = join(skillRoot, "api-test-output", "missing-collateral");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: shippedConfig.precog.api_root,
        open_api_key: "test-open-api-key",
        chain_id: configChainId,
        signature_actions: configSignatureActions,
      },
    }),
  );

  const forecastos = createForecastOS({
    store: new DirectoryDraftStateStore(stateDir),
    fetch: async () => {
      throw new Error("missing collateral must not call the network");
    },
  });
  const draft = await forecastos.draftMarket({
    prompt: "Which launchpad gets the most new agents in June 2026?",
    requested_outcomes: ["Clawpump", "Liquid", "Virtuals", "Other"],
    source_hints: ["Public launchpad dashboards"],
    requested_close_time: "2026-06-30T23:59:59Z",
    requested_resolution_time: "2026-07-03T00:00:00Z",
  });

  await assert.rejects(
    forecastos.createMarket({
      draft_id: draft.draft_id,
      approved: true,
      approved_by: "operator",
      approval_text: draft.approval_text,
      image_url: "https://example.com/image.png",
      creator_address: "0xCreator",
      creator_signature: "0xCreatorSignature",
    }),
    /Missing \.forecastos\/config\.json precog\.default_collateral_address/,
  );
});

test("await_precog_approval omits deployed_master_address and does not require it", async () => {
  const rootDir = join(skillRoot, "api-test-output", "await-no-master");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: shippedConfig.precog.api_root,
        open_api_key: "test-open-api-key",
        chain_id: configChainId,
        default_collateral_address: configCollateralAddress,
        default_collateral_symbol: "USDC",
        signature_actions: configSignatureActions,
      },
    }),
  );

  const requests = [];
  const forecastos = createForecastOS({
    store: new DirectoryDraftStateStore(stateDir),
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify([{ id: 123, chain_id: configChainId, status: "VALIDATED" }]);
        },
      };
    },
  });

  const approved = await forecastos.awaitPrecogApproval({
    step: "await_precog_approval",
    market_id: 123,
  });

  assert.equal(approved.ready_to_fund, true);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.includes("/api/v1/upcoming-markets/?"));
  assert.ok(requests[0].url.includes(`chain_id=${configChainId}`));
  assert.ok(requests[0].url.includes("id=123"));
  assert.ok(!requests[0].url.includes("deployed_master_address"));
});

test("consume_prediction can check upcoming deployment without deployed_master_address", async () => {
  const rootDir = join(skillRoot, "api-test-output", "consume-no-master-waiting");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: shippedConfig.precog.api_root,
        open_api_key: "test-open-api-key",
        chain_id: configChainId,
        default_collateral_address: configCollateralAddress,
        default_collateral_symbol: "USDC",
        signature_actions: configSignatureActions,
      },
    }),
  );

  const requests = [];
  const forecastos = createForecastOS({
    store: new DirectoryDraftStateStore(stateDir),
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify([{ id: 123, chain_id: configChainId, status: "FUNDED" }]);
        },
      };
    },
  });

  const result = await forecastos.consumePrediction({
    step: "consume_prediction",
    market_id: 123,
  });

  assert.equal(result.ready_to_fetch_market, false);
  assert.equal(result.waiting_for_deployment, true);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.includes("/api/v1/upcoming-markets/?"));
  assert.ok(!requests[0].url.includes("deployed_master_address"));
});

test("consume_prediction requires deployed_master_address only before deployed market fetch", async () => {
  const rootDir = join(skillRoot, "api-test-output", "consume-no-master-deployed");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: shippedConfig.precog.api_root,
        open_api_key: "test-open-api-key",
        chain_id: configChainId,
        default_collateral_address: configCollateralAddress,
        default_collateral_symbol: "USDC",
        signature_actions: configSignatureActions,
      },
    }),
  );

  const requests = [];
  const forecastos = createForecastOS({
    store: new DirectoryDraftStateStore(stateDir),
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify([
            { id: 123, chain_id: configChainId, status: "DEPLOYED", deployed_market_id: 1 },
          ]);
        },
      };
    },
  });

  await assert.rejects(
    forecastos.consumePrediction({
      step: "consume_prediction",
      market_id: 123,
    }),
    /Missing \.forecastos\/config\.json precog\.deployed_master_address/,
  );
  assert.equal(requests.length, 1);
  assert.ok(!requests[0].url.includes("deployed_master_address"));
});
test("prepare_funding_intent creates generic wallet-tool handoff intents", async () => {
  const rootDir = join(skillRoot, "api-test-output", "prepare-funding-intent");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: shippedConfig.precog.api_root,
        open_api_key: "test-open-api-key",
        chain_id: configChainId,
        deployed_master_address: shippedConfig.precog.deployed_master_address,
        default_collateral_address: configCollateralAddress,
        default_collateral_symbol: "USDC",
        signature_actions: configSignatureActions,
      },
    }),
  );
  const forecastos = createForecastOS({
    store: new DirectoryDraftStateStore(stateDir),
    fetch: async () => {
      throw new Error("prepare_funding_intent must not call the network");
    },
  });
  for (const provider of ["configured-wallet-tool", "external-wallet-flow", "operator-tool"]) {
    const intent = await forecastos.prepareFundingIntent(
      {
        step: "fund",
        market_id: 493,
        collateral_symbol: "MATE",
        precog_approval: { status: "VALIDATED" },
      },
      { provider, amount: "1", funding_asset: "MATE", chain_id: 999999 },
    );
    assert.equal(intent.wallet_provider, provider);
    assert.equal(intent.wallet_tool_hint.includes("Bankr"), true);
    assert.equal(intent.wallet_tool_hint.includes("Privy"), true);
    assert.equal(intent.wallet_tool_hint.includes("Base MCP"), true);
    assert.equal(intent.launchpad_fallback_url, "https://core.precog.markets/launchpad/");
    assert.equal(intent.amount, "1");
    assert.equal(intent.chain_id, configChainId);
    assert.equal(intent.amount_format, "precog_display_units_decimal_string");
    assert.equal(intent.signature_method, "eip712_typed_data");
    assert.equal(intent.eip712_typed_data_template.primaryType, "PrecogMarketAuthorization");
    assert.equal(intent.eip712_typed_data_template.domain.name, "Precog Markets");
    assert.equal(intent.eip712_typed_data_template.domain.chainId, configChainId);
    assert.equal(intent.eip712_typed_data_template.domain.verifyingContract, shippedConfig.precog.deployed_master_address);
    assert.equal(intent.eip712_typed_data_template.message.action, configSignatureActions.fund_market);
    assert.equal(intent.eip712_typed_data_template.message.account, "<funder_address>");
    assert.equal(intent.eip712_typed_data_template.message.nonce, "<next_pending_nonce>");
    assert.deepEqual(intent.wallet_policy_required, [
      "eip712_typed_data_signing",
      "transaction_signing",
      "transaction_sending",
    ]);
    assert.equal(intent.token_approval_required_if_needed, true);
    assert.ok(intent.token_approval_note.includes("approve collateral token allowance"));
    assert.deepEqual(intent.wallet_resolution_required, ["tx_hash", "funder_address", "funder_signature"]);
    assert.ok(intent.notes.some((note) => note.includes("Bankr funding") && note.includes("Bankr adapter docs")));
    assert.ok(intent.notes.some((note) => note.includes("EIP-1271/ERC-6492") && note.includes("accepted for funding")));
    assert.equal(intent.precog_payload_template.amount, "1");
  }
});

test("legacy Privy skill shim delegates to top-level wallet adapter", async () => {
  const shim = await import("../scripts/wallets/privy_resolve_create.mjs");
  const template = buildCreateIntentFixture().eip712_typed_data_template;
  const typedData = await shim.buildPrivyTypedData(template, "0xCreator", 12);

  assert.equal(template.primaryType, "PrecogMarketAuthorization");
  assert.equal(template.primary_type, undefined);
  assert.equal(typedData.primaryType, undefined);
  assert.equal(typedData.primary_type, "PrecogMarketAuthorization");
  assert.equal(typedData.message.account, "0xCreator");
  assert.equal(typedData.message.nonce, 12);
});

test("draft validation blocks long questions and outcomes", async () => {
  const forecastos = await createIsolatedForecastOS("draft-length-limits");
  const baseInput = {
    requested_outcomes: ["June 1-15 2026", "June 16-30 2026", "Other"],
    source_hints: ["Official source"],
    requested_close_time: "2026-06-30T23:59:59Z",
    requested_resolution_time: "2026-07-03T00:00:00Z",
  };
  const longQuestion = await forecastos.draftMarket({
    ...baseInput,
    prompt: "Which launchpad will have the most newly launched production AI agents by the end of June 2026?",
  });
  const longOutcome = await forecastos.draftMarket({
    ...baseInput,
    prompt: "Which launchpad wins June 2026?",
    requested_outcomes: [
      "June 1-15 2026",
      "June 16-30 2026",
      "Not returned to normal by July 31 2026",
    ],
  });

  assert.equal(longQuestion.status, "blocked");
  assert.ok(longQuestion.missing_fields.includes("question_length"));
  assert.ok(longQuestion.review_message.includes("65 characters or fewer"));
  assert.equal(longOutcome.status, "blocked");
  assert.ok(longOutcome.missing_fields.includes("outcome_length"));
  assert.ok(longOutcome.review_message.includes("32 characters or fewer"));
});

test("draft review displays configured collateral token", async () => {
  const rootDir = join(skillRoot, "test-output", "draft-token-review");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  await writeTestConfig(stateDir);

  const forecastos = createForecastOS({ store: new DirectoryDraftStateStore(stateDir) });
  const draft = await forecastos.draftMarket({
    prompt: "Which launchpad wins June 2026?",
    requested_outcomes: ["Clawpump", "Liquid", "Virtuals", "Other"],
    source_hints: ["Public launchpad dashboards"],
    requested_close_time: "2026-06-30T23:59:59Z",
    requested_resolution_time: "2026-07-03T00:00:00Z",
  });

  assert.equal(draft.market.collateral_symbol, "USDC");
  assert.equal(draft.market.collateral_address, configCollateralAddress);
  assert.ok(draft.review_message.includes(`Token: USDC (${configCollateralAddress})`));
});

test("check_pending_market classifies pending, approved, and rejected statuses", async () => {
  for (const [precogStatus, expectedStatus, expectedStep] of [
    ["CREATED", "pending", "await_precog_approval"],
    ["PENDING", "pending", "await_precog_approval"],
    ["VALIDATED", "approved", "fund"],
    ["REJECTED", "rejected", "rejected"],
    ["FAILED", "rejected", "rejected"],
    ["DENIED", "rejected", "rejected"],
  ]) {
    const rootDir = join(skillRoot, "test-output", `pending-${precogStatus.toLowerCase()}`);
    const stateDir = join(rootDir, ".forecastos");
    const workflowId = `workflow_pending_${precogStatus.toLowerCase()}`;
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(join(stateDir, "workflows", "all"), { recursive: true });
    await writeTestConfig(stateDir);
    await writeFile(
      join(stateDir, "workflows", "all", `${workflowId}.json`),
      JSON.stringify({
        workflow_id: workflowId,
        step: "await_precog_approval",
        market_id: 888,
        upcoming_market: 888,
      }),
    );

    const { stdout } = await execFileAsync(
      process.execPath,
      [
        join(skillRoot, "scripts", "check_pending_market.mjs"),
        "--workflow-id",
        workflowId,
      ],
      {
        env: {
          ...process.env,
          FORECASTOS_STATE_DIR: stateDir,
          FORECASTOS_TEST_PRECOG_RESPONSE: JSON.stringify([
            { id: 888, chain_id: configChainId, status: precogStatus },
          ]),
        },
      },
    );
    const report = JSON.parse(stdout);

    assert.equal(report.status, expectedStatus);
    assert.equal(report.precog_status, precogStatus);
    assert.equal(report.state.step, expectedStep);
  }
});

test("skill guidance does not advertise unrelated named wallet provider support", async () => {
  const files = [
    "SKILL.md",
    "references/actions.md",
    "references/tool-schemas.md",
    "references/action-policy.md",
    "references/safety.md",
    "references/architecture.md",
    "references/workflow.md",
    "scripts/forecastos_runtime.mjs",
    "scripts/next_step.mjs",
    "assets/schemas/actions.json",
  ];
  const combined = (await Promise.all(files.map((file) => readFile(join(skillRoot, file), "utf8")))).join("\n").toLowerCase();
  for (const provider of ["turn" + "key"]) {
    assert.ok(!combined.includes(provider), `provider-specific guidance leaked: ${provider}`);
  }
});
test("docs preserve wallet and token approval boundaries", async () => {
  const files = [
    "SKILL.md",
    "references/actions.md",
    "references/action-policy.md",
    "references/safety.md",
  ];
  const combined = (await Promise.all(files.map((file) => readFile(join(skillRoot, file), "utf8")))).join("\n");
  assert.ok(combined.includes("approve tokens"));
  assert.ok(combined.includes("fetch nonces"));
  assert.ok(combined.includes("sign/send transactions"));
});
test("docs and runtime do not use legacy string signing guidance", async () => {
  const files = [
    "SKILL.md",
    "references/actions.md",
    "references/tool-schemas.md",
    "references/action-policy.md",
    "references/safety.md",
    "scripts/forecastos_runtime.mjs",
  ];
  const forbidden = ["EIP" + "-191", "sign" + "Message", "message_to_sign_template", "precog.markets|"];
  for (const file of files) {
    const content = await readFile(join(skillRoot, file), "utf8");
    for (const pattern of forbidden) {
      assert.ok(!content.includes(pattern), `${file} still contains ${pattern}`);
    }
  }
});
test("next_step presents human create guidance without chain or collateral as normal asks", async () => {
  const rootDir = join(skillRoot, "test-output", "next-step-create");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(join(stateDir, "workflows", "all"), { recursive: true });
  const workflowId = "workflow_next_step_create";
  await writeFile(
    join(stateDir, "workflows", "all", `${workflowId}.json`),
    JSON.stringify({ workflow_id: workflowId, step: "create_market" }),
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [join(skillRoot, "scripts", "next_step.mjs"), "--workflow-id", workflowId],
    { env: { ...process.env, FORECASTOS_STATE_DIR: stateDir } },
  );
  const guidance = JSON.parse(stdout);

  assert.equal(guidance.next_action, "prepare_create_intent");
  assert.ok(!guidance.required_fields.includes("chain_id"));
  assert.ok(!guidance.required_fields.includes("collateral_address"));
  assert.ok(!guidance.required_fields.includes("creator_address"));
  assert.ok(!guidance.required_fields.includes("creator_signature"));
  assert.ok(guidance.notes.some((note) => note.includes("What wallet or wallet/action tool")));
  assert.ok(guidance.notes.some((note) => note.includes("Bankr")));
  assert.ok(guidance.notes.some((note) => note.includes("Privy") && note.includes("EOA-compatible")));
  assert.ok(guidance.notes.some((note) => note.includes("Base MCP smart-account/WebAuthn signatures")));
  assert.ok(guidance.notes.some((note) => note.includes("[Precog creation area](https://core.precog.markets/launchpad/)")));
  assert.ok(guidance.notes.some((note) => note.includes("https://core.precog.markets/launchpad/")));
  assert.ok(guidance.notes.some((note) => note.includes("Base USDC")));
  assert.ok(guidance.notes.some((note) => note.includes("EIP-712 typed-data signing")));
});
test("next_step funding guidance mentions wallet policy and token approval", async () => {
  const rootDir = join(skillRoot, "test-output", "next-step-fund");
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(join(stateDir, "workflows", "all"), { recursive: true });
  const workflowId = "workflow_next_step_fund";
  await writeFile(
    join(stateDir, "workflows", "all", `${workflowId}.json`),
    JSON.stringify({ workflow_id: workflowId, step: "fund" }),
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [join(skillRoot, "scripts", "next_step.mjs"), "--workflow-id", workflowId],
    { env: { ...process.env, FORECASTOS_STATE_DIR: stateDir } },
  );
  const guidance = JSON.parse(stdout);

  assert.equal(guidance.next_action, "prepare_funding_intent");
  assert.ok(guidance.notes.some((note) => note.includes("what wallet or wallet/action tool")));
  assert.ok(guidance.notes.some((note) => note.includes("Bankr") && note.includes("Privy") && note.includes("Base MCP")));
  assert.ok(guidance.notes.some((note) => note.includes("[Precog creation area](https://core.precog.markets/launchpad/)")));
  assert.ok(guidance.notes.some((note) => note.includes("wallet policy")));
  assert.ok(guidance.notes.some((note) => note.includes("approve the token before funding")));
});
test("fund_market rejects ambiguous or non-display amount strings", async () => {
  const forecastos = createForecastOS({
    fetch: async () => {
      throw new Error("invalid funding amounts must not call the network");
    },
  });
  const state = { step: "fund", market_id: 493, precog_approval: { status: "VALIDATED" } };
  for (const amount of ["1 MATE", "1000000000000000000 wei", "1e18", "1,000", "0", "-1"]) {
    await assert.rejects(
      forecastos.fundMarket(state, {
        approved: true,
        funding_request: {
          amount,
          tx_hash: "0xTransactionHash",
          funder_address: "0xFunder",
          funder_signature: "0xFunderSignature",
        },
      }),
      /amount must be a positive plain decimal string/,
    );
  }
});
async function runActionBridge(action, inputPath, stateDir) {
  const scriptPath = join(skillRoot, "scripts", "forecastos_action.mjs");
  const { stdout } = await execFileAsync(
    process.execPath,
    [scriptPath, action, "--input", inputPath],
    {
      env: {
        ...process.env,
        FORECASTOS_STATE_DIR: stateDir,
      },
    },
  );
  return JSON.parse(stdout);
}

function buildCreateIntentFixture() {
  return {
    intent_type: "forecastos.create_market",
    chain_id: 8453,
    eip712_typed_data_template: {
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        PrecogMarketAuthorization: [
          { name: "action", type: "string" },
          { name: "account", type: "address" },
          { name: "chainId", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      },
      primaryType: "PrecogMarketAuthorization",
      domain: {
        name: "Precog Markets",
        version: "1",
        chainId: 8453,
        verifyingContract: "0x00000000000c109080dfa976923384b97165a57a",
      },
      message: {
        action: "CREATE_UPCOMING_MARKET",
        account: "<creator_address>",
        chainId: 8453,
        nonce: "<next_pending_nonce>",
      },
    },
    precog_payload_template: {
      image_url: "https://example.com/image.png",
      category: "culture",
    },
  };
}

async function createIsolatedForecastOS(name) {
  const rootDir = join(skillRoot, "test-output", name);
  const stateDir = join(rootDir, ".forecastos");
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  return createForecastOS({
    store: new DirectoryDraftStateStore(stateDir),
  });
}

async function writeTestConfig(stateDir) {
  await writeFile(
    join(stateDir, "config.json"),
    JSON.stringify({
      precog: {
        api_root: shippedConfig.precog.api_root,
        open_api_key: "test-open-api-key",
        chain_id: configChainId,
        deployed_master_address: "0xMaster",
        default_collateral_address: configCollateralAddress,
        default_collateral_symbol: "USDC",
        signature_actions: configSignatureActions,
      },
    }),
  );
}

function envWithoutForecastState(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.FORECASTOS_STATE_DIR;
  return env;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
