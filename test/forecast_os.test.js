import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  DirectoryDraftStateStore,
  createForecastOS,
} from "../scripts/forecastos_runtime.mjs";

const execFileAsync = promisify(execFile);
const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const shippedConfig = JSON.parse(await readFile(join(skillRoot, ".forecastos", "config.json"), "utf8"));
const configChainId = shippedConfig.precog.chain_id;
const configCollateralAddress = shippedConfig.precog.default_collateral_address;
const configSignatureActions = shippedConfig.precog.signature_actions;

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
        ? [{ id: 123, chain_id: configChainId, deployed_master_address: "0xMaster", status: "VALIDATED" }]
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
        ? { upcoming_market: 123, status: "PENDING" }
        : { upcoming_market: 123, status: "FUNDED", funding_amount: 100.0 };
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
  const funded = await forecastos.fundMarket(
    { step: "fund", market_id: created.market_id, precog_approval: { status: "VALIDATED" } },
    {
      approved: true,
      funding_request: {
        amount: "1",
        tx_hash: "0xTransactionHash",
        funder_address: "0xFunder",
        funder_signature: "0xFunderSignature",
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

  assert.equal(created.market_id, 123);
  assert.equal(approved.precog_status, "VALIDATED");
  assert.equal(approved.ready_to_fund, true);
  assert.equal(funded.precog_status, "FUNDED");
  assert.equal(consumed.ready_to_finish, true);
  assert.deepEqual(consumed.signal.outcomes_prices, [0.4, 0.3, 0.2, 0.1]);
  assert.equal(requests[0].url, `${shippedConfig.precog.api_root}api/v1/create-upcoming-market/`);
  assert.equal(requests[1].url, `${shippedConfig.precog.api_root}api/v1/upcoming-markets/?chain_id=${configChainId}&id=123`);
  assert.ok(!requests[1].url.includes("deployed_master_address"));
  assert.equal(requests[2].url, `${shippedConfig.precog.api_root}api/v1/fund-upcoming-market/`);
  assert.equal(requests[3].url, `${shippedConfig.precog.api_root}api/v1/markets/?chain_id=${configChainId}&master_address=0xMaster&master_market_id=1`);
  assert.ok(requests[3].url.includes("master_address=0xMaster"));
  assert.equal(requests[0].options.headers["x-api-key"], "test-open-api-key");
  assert.equal(requests[0].body.outcomes, "Clawpump,Liquid,Virtuals,Other");
  assert.equal(requests[0].body.chain_id, configChainId);
  assert.equal(requests[0].body.collateral_address, configCollateralAddress);
  assert.equal(requests[2].body.upcoming_market, 123);
  assert.equal(requests[2].body.amount, "1");
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
  const forecastos = createForecastOS();
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

test("skill docs forbid raw JSON as normal chat output and require next step prompt", async () => {
  const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
  const workflow = await readFile(join(skillRoot, "references", "workflow.md"), "utf8");

  assert.ok(skill.includes("Do not hand-write or paste ForecastOS-looking JSON"));
  assert.ok(skill.includes("Every draft response must end with a next-step prompt"));
  assert.ok(skill.includes("Do not expose raw JSON"));
  assert.ok(workflow.includes("not raw JSON"));
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
  const forecastos = createForecastOS({
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
    assert.equal(intent.wallet_tool_hint.includes("configured wallet/action tool"), true);
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
    assert.equal(intent.precog_payload_template.amount, "1");
  }
});

test("skill guidance does not advertise named wallet provider support", async () => {
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
  for (const provider of ["bank" + "r", "pri" + "vy", "turn" + "key"]) {
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

  assert.equal(guidance.next_action, "create_market");
  assert.ok(!guidance.required_fields.includes("chain_id"));
  assert.ok(!guidance.required_fields.includes("collateral_address"));
  assert.ok(!guidance.required_fields.includes("creator_address"));
  assert.ok(!guidance.required_fields.includes("creator_signature"));
  assert.ok(guidance.notes.some((note) => note.includes("What wallet or wallet/action tool")));
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

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
