// Provides the bundled local ForecastOS runtime used by the action bridge by default.
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const STATUS_FOLDERS = Object.freeze([
  "needs_info",
  "await_approval",
  "create_market",
  "await_precog_approval",
  "rejected",
  "funded",
  "consume_prediction",
  "done",
]);

const PRECOG_LAUNCHPAD_BASE_URL = "https://core.precog.markets/launchpad";
const MAX_QUESTION_LENGTH = 65;
const MAX_OUTCOME_LENGTH = 32;

export class DirectoryDraftStateStore {
  constructor(rootDir = ".forecastos") {
    this.rootDir = rootDir;
  }

  async save(draft) {
    await writeJson(join(this.rootDir, "drafts", `${draft.draft_id}.json`), draft);
    return draft;
  }

  async get(draftId) {
    return readJsonOrNull(join(this.rootDir, "drafts", `${draftId}.json`));
  }

  async saveWorkflow(state) {
    const status = workflowStatusFolder(state.step);
    await writeJson(
      join(this.rootDir, "workflows", "all", `${state.workflow_id}.json`),
      state,
    );
    await writeJson(
      join(this.rootDir, "workflows", status, `${state.workflow_id}.json`),
      state,
    );
    await Promise.all(
      STATUS_FOLDERS.filter((folder) => folder !== status).map((folder) =>
        rm(join(this.rootDir, "workflows", folder, `${state.workflow_id}.json`), {
          force: true,
        }),
      ),
    );
    return state;
  }

  async getWorkflow(workflowId) {
    return readJsonOrNull(join(this.rootDir, "workflows", "all", `${workflowId}.json`));
  }

  async listWorkflowsByStatus(status) {
    return readJsonDir(join(this.rootDir, "workflows", workflowStatusFolder(status)));
  }

  async listDrafts() {
    return readJsonDir(join(this.rootDir, "drafts"));
  }

  async getConfig() {
    const config = await readJsonOrNull(join(this.rootDir, "config.json"));
    const localConfig = await readJsonOrNull(join(this.rootDir, "config.local.json"));
    return mergeConfig(config, localConfig);
  }
}

export function createForecastOS(options = {}) {
  return new ForecastOSLocalRuntime(options.store ?? new DirectoryDraftStateStore(), {
    fetch: options.fetch,
    now: options.now,
  });
}

export function workflowStatusFolder(step) {
  return step === "fund" ? "funded" : step;
}

class ForecastOSLocalRuntime {
  constructor(store, options = {}) {
    this.store = store;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? (() => new Date());
  }

  async draftMarket(input) {
    const config = typeof this.store.getConfig === "function"
      ? await this.store.getConfig()
      : {};
    const draft = buildDraft(input, { config });
    await this.store.save(draft);
    return draft;
  }

  async createMarket(input) {
    if (input.approved !== true) fail("create_market requires approved: true.");
    const config = await readPrecogConfig(this.store);
    const createInput = {
      ...input,
      chain_id: config.chain_id,
      collateral_address: input.collateral_address ?? requireDefaultCollateralAddress(config),
      collateral_symbol: input.collateral_symbol ?? config.default_collateral_symbol,
    };
    requireFields(createInput, [
      "image_url",
      "creator_address",
      "creator_signature",
    ], "create_market");
    const approvalContext = await resolveApprovalContext(this.store, createInput);
    const draftId = createInput.draft_id ?? approvalContext?.draft_id ?? approvalContext?.approved_draft_id;
    const draft = await this.store.get(draftId);
    if (!draft) fail(`Draft not found: ${draftId}`);
    if (draft.quality.blocking_issues.length) {
      fail(`Draft has blocking issues: ${draft.quality.blocking_issues.join(", ")}`);
    }
    validateDraftApproval(draft, createInput, approvalContext);
    validateCreatorSignatureCompatibility(createInput);
    const response = await this.#postPrecog(
      "/api/v1/create-upcoming-market/",
      buildCreatePayload(draft, createInput, this.now),
    );
    return normalizeCreateResponse(response, draft, createInput);
  }

  async prepareCreateIntent(input) {
    const config = await readPrecogConfig(this.store, { requireDeployedMasterAddress: true });
    const createInput = {
      ...input,
      chain_id: config.chain_id,
      collateral_address: input.collateral_address ?? requireDefaultCollateralAddress(config),
      collateral_symbol: input.collateral_symbol ?? config.default_collateral_symbol,
    };
    requireFields(createInput, ["image_url"], "prepare_create_intent");
    const approvalContext = await resolveApprovalContext(this.store, createInput);
    const draftId = createInput.draft_id ?? approvalContext?.draft_id ?? approvalContext?.approved_draft_id;
    const draft = await this.store.get(draftId);
    if (!draft) fail(`Draft not found: ${draftId}`);
    if (draft.quality.blocking_issues.length) {
      fail(`Draft has blocking issues: ${draft.quality.blocking_issues.join(", ")}`);
    }
    validateDraftApproval(draft, createInput, approvalContext);
    const payloadTemplate = buildCreatePayload(
      draft,
      {
        ...createInput,
        creator_address: "<wallet_address>",
        creator_signature: "<wallet_signature>",
      },
      this.now,
    );
    return withoutUndefined({
      intent_type: "forecastos.create_market",
      wallet_tool_hint: "Use Privy, another EOA-compatible wallet/action tool, or the Precog creation area instead of asking the user for raw signatures. Use Base MCP for creation only if it returns a 65-byte EOA signature.",
      launchpad_fallback_url: "https://core.precog.markets/launchpad/",
      wallet_runtime_candidates: ["codex", "claude_code", "openclaw"],
      wallet_policy_required: ["eip712_typed_data_signing"],
      chain_id: config.chain_id,
      collateral_symbol: createInput.collateral_symbol,
      collateral_address: createInput.collateral_address,
      signature_method: "eip712_typed_data",
      eip712_typed_data_template: buildPrecogAuthorizationTypedDataTemplate({
        config,
        action: config.signature_actions.create_market,
        account: "<creator_address>",
        nonce: "<next_pending_nonce>",
      }),
      wallet_resolution_required: ["creator_address", "creator_signature"],
      resolved_action: "create_market",
      precog_payload_template: payloadTemplate,
      notes: [
        "ForecastOS does not fetch nonces, sign EIP-712 typed data, custody wallets, or ask users to paste raw signatures in normal chat.",
        "Use a configured wallet/action tool with policy permission for EOA-compatible EIP-712 typed-data signing.",
        "Base MCP smart-account/WebAuthn signatures are not accepted by the current Precog create endpoint; use Privy, another EOA-compatible wallet/action tool, or the Precog creation area for creation.",
        "The wallet/action tool resolves this intent into creator_address and creator_signature.",
        "If no wallet/action tool is configured, direct the user to the [Precog creation area](https://core.precog.markets/launchpad/).",
      ],
    });
  }

  async runSkillStep(state = {}, event = {}) {
    const current = ensureState(state, event);

    if (["intake", "draft", "needs_info"].includes(current.step) && event.input) {
      const draft = await this.draftMarket(event.input);
      const nextStep = draft.quality.blocking_issues.length ? "needs_info" : "await_approval";
      return this.#saveResult({
        state: transition(current, {
          ...current,
          step: nextStep,
          prompt: event.input.prompt ?? current.prompt,
          draft_id: draft.draft_id,
          draft_hash: draft.draft_hash,
          approval_prompt: draft.approval_prompt,
          approval_text: draft.approval_text,
          missing_fields: draft.missing_fields,
          last_result: draft,
        }, "draft_evaluated"),
        tool_result: draft,
        needs_human_input: nextStep !== "await_approval" || true,
        agent_message: draft.review_message,
      });
    }

    if (current.step === "await_approval") {
      if (!isApprovalEvent(event, current)) {
        return {
          state: current,
          needs_human_input: true,
          agent_message: "Ask the operator to reply yes to approve this draft.",
        };
      }
      const approvedAt = new Date().toISOString();
      return this.#saveResult({
        state: transition(current, {
          ...current,
          step: "create_market",
          approved_by: event.approved_by ?? "operator",
          approved_at: approvedAt,
          approved_draft_id: current.draft_id,
          approved_draft_hash: current.draft_hash,
          approval_response: approvalResponseText(event),
          approval_text: event.approval_text ?? current.approval_text,
        }, "approval_recorded"),
        needs_human_input: true,
        agent_message: "Approval recorded. What wallet or wallet/action tool would you like to use to publish this? Options include Privy, another EOA-compatible wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/). Use Base MCP for creation only if it returns a 65-byte EOA signature.",
      });
    }

    if (current.step === "create_market") {
      try {
        const result = await this.createMarket({
          ...event,
          draft_id: current.draft_id,
          approved: true,
          approved_by: current.approved_by ?? event.approved_by ?? "operator",
          approval_text: current.approval_text,
          approved_draft_id: current.approved_draft_id,
          approved_draft_hash: current.approved_draft_hash,
          state: current,
        });
        return this.#saveResult({
          state: transition(current, {
            ...current,
            step: "await_precog_approval",
            market_id: result.market_id,
            upcoming_market: result.upcoming_market,
            market_url: result.url,
            precog_status: result.precog_status,
            chain_id: result.chain_id,
            collateral_address: result.collateral_address,
            creator_address: result.creator_address,
            last_result: result,
          }, "market_created"),
          tool_result: result,
          needs_human_input: false,
          agent_message: [
            "Precog upcoming market created.",
            `Title: ${result.title}`,
            `Link: ${result.url}`,
            "Next step is await_precog_approval.",
          ].join("\n"),
        });
      } catch (error) {
        const missingSignature = String(error?.message ?? "").includes("creator_signature");
        return this.#saveResult({
          state: markWorkflowError(current, error),
          tool_result: serializeError(error),
          needs_human_input: true,
          agent_message: missingSignature
            ? "The draft is approved, but the create submission is missing the wallet signature. Resolve the create intent with Privy or another EOA-compatible wallet/action tool, then rerun run_skill_step with --wallet-output <wallet-adapter-output-json>."
            : "The draft is approved, but live publishing still needs a compatible wallet/action tool. Ask whether the user wants to use Privy, another EOA-compatible wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/).",
        });
      }
    }

    if (current.step === "await_precog_approval") {
      try {
        const result = await this.awaitPrecogApproval(current, event);
        if (result.ready_to_fund) {
          return this.#saveResult({
            state: transition(current, {
              ...current,
              step: "fund",
              precog_approval: result,
              precog_status: result.precog_status,
              last_result: result,
            }, "precog_approval_validated"),
            tool_result: result,
            needs_human_input: false,
            agent_message: "Precog status is VALIDATED. Funding is now allowed.",
          });
        }
        if (result.rejected) {
          return this.#saveResult({
            state: transition(current, {
              ...current,
              step: "rejected",
              precog_approval: result,
              precog_status: result.precog_status,
              last_result: result,
            }, "precog_approval_rejected"),
            tool_result: result,
            needs_human_input: false,
            agent_message: `Precog status is ${result.precog_status ?? "unknown"}. Market was rejected or cannot be funded.`,
          });
        }
        return this.#saveResult({
          state: transition(current, {
            ...current,
            step: "await_precog_approval",
            precog_approval: result,
            precog_status: result.precog_status,
            last_result: result,
          }, "precog_approval_checked"),
          tool_result: result,
          needs_human_input: false,
          agent_message: `Precog status is ${result.precog_status ?? "unknown"}. Funding is not valid yet; check again in about one hour.`,
        });
      } catch (error) {
        return this.#saveResult({
          state: markWorkflowError(current, error),
          tool_result: serializeError(error),
          needs_human_input: true,
          agent_message: "Precog approval check failed. The workflow remains at await_precog_approval.",
        });
      }
    }

    if (current.step === "fund") {
      try {
        const result = await this.fundMarket(current, event);
        return this.#saveResult({
          state: transition(current, {
            ...current,
            step: "consume_prediction",
            funding_result: result,
            precog_status: result.precog_status,
            last_result: result,
          }, "funding_recorded"),
          tool_result: result,
          needs_human_input: false,
          agent_message: "Precog upcoming market funded. Next step is consume_prediction.",
        });
      } catch (error) {
        return this.#saveResult({
          state: markWorkflowError(current, error),
          tool_result: serializeError(error),
          needs_human_input: true,
          agent_message: "Precog fund_market failed. The workflow remains at fund.",
        });
      }
    }

    if (current.step === "consume_prediction") {
      try {
        const result = await this.consumePrediction(current, event);
        if (result.ready_to_finish) {
          return this.#saveResult({
            state: transition(current, {
              ...current,
              step: "done",
              market_id: result.market_id ?? current.market_id,
              upcoming_market: result.upcoming_market ?? current.upcoming_market,
              deployed_master_address:
                result.deployed_master_address ?? current.deployed_master_address,
              deployed_market_id: result.deployed_market_id ?? current.deployed_market_id,
              prediction_result: result,
              last_result: result,
            }, "prediction_consumed"),
            tool_result: result,
            needs_human_input: false,
            agent_message: "Deployed Precog market found. Workflow is done.",
          });
        }
        return this.#saveResult({
          state: transition(current, {
            ...current,
            step: "consume_prediction",
            precog_status: result.precog_status ?? current.precog_status,
            deployed_master_address:
              result.deployed_master_address ?? current.deployed_master_address,
            deployed_market_id: result.deployed_market_id ?? current.deployed_market_id,
            prediction_result: result,
            last_result: result,
          }, "prediction_waiting_for_deployment"),
          tool_result: result,
          needs_human_input: false,
          agent_message: "Precog market is not deployed yet. Workflow remains at consume_prediction.",
        });
      } catch (error) {
        return this.#saveResult({
          state: markWorkflowError(current, error),
          tool_result: serializeError(error),
          needs_human_input: true,
          agent_message: "Prediction consumption failed. The workflow remains at consume_prediction.",
        });
      }
    }

    return { state: current, needs_human_input: false, agent_message: "No workflow action taken." };
  }

  async awaitPrecogApproval(state, event = {}) {
    const config = await readPrecogConfig(this.store);
    const upcomingMarket = getUpcomingMarketId(state, event);
    const chainId = getChainId(state, event, "await_precog_approval", config);
    const response = await this.#getPrecog("/api/v1/upcoming-markets/", {
      chain_id: chainId,
      id: upcomingMarket,
    }, config);
    return normalizeApprovalResponse(response, upcomingMarket);
  }

  async prepareFundingIntent(state, event = {}) {
    const approvalStatus = state.precog_approval?.precog_status ?? state.precog_approval?.status;
    if (approvalStatus !== "VALIDATED") {
      fail("prepare_funding_intent requires Precog status VALIDATED.");
    }
    const request = event.funding_request ?? event;
    requireFields(request, ["amount"], "prepare_funding_intent");
    const amount = normalizePrecogFundingAmount(request.amount);
    const upcomingMarket = request.upcoming_market ?? state.market_id ?? state.upcoming_market;
    if (upcomingMarket === undefined || upcomingMarket === null || upcomingMarket === "") {
      fail("prepare_funding_intent requires upcoming_market or state.market_id.");
    }
    const config = await readPrecogConfig(this.store, { requireDeployedMasterAddress: true });
    const chainId = config.chain_id;
    const provider = normalizeWalletProvider(request.provider ?? request.wallet_provider ?? request.wallet_tool);
    const fundingAsset = request.funding_asset ?? request.asset ?? request.collateral_symbol ?? state.collateral_symbol;
    return withoutUndefined({
      intent_type: "forecastos.fund_market",
      wallet_provider: provider,
      wallet_tool_hint: "Use Privy, Base MCP, another configured wallet/action tool, or the Precog creation area instead of asking the user for raw signatures.",
      launchpad_fallback_url: "https://core.precog.markets/launchpad/",
      wallet_runtime_candidates: ["codex", "claude_code", "openclaw"],
      wallet_policy_required: [
        "eip712_typed_data_signing",
        "transaction_signing",
        "transaction_sending",
      ],
      token_approval_required_if_needed: true,
      token_approval_note: "Before funding, the wallet flow must approve collateral token allowance if current allowance is insufficient. ForecastOS does not approve tokens.",
      upcoming_market: upcomingMarket,
      chain_id: chainId,
      amount,
      amount_format: "precog_display_units_decimal_string",
      funding_asset: fundingAsset,
      collateral_symbol: request.collateral_symbol ?? state.collateral_symbol,
      collateral_address: request.collateral_address ?? state.collateral_address ?? config.default_collateral_address,
      signature_method: "eip712_typed_data",
      eip712_typed_data_template: buildPrecogAuthorizationTypedDataTemplate({
        config,
        action: config.signature_actions.fund_market,
        account: "<funder_address>",
        nonce: "<next_pending_nonce>",
      }),
      wallet_resolution_required: ["tx_hash", "funder_address", "funder_signature"],
      resolved_action: "fund_market",
      precog_payload_template: {
        upcoming_market: upcomingMarket,
        amount,
        tx_hash: "<wallet_tx_hash>",
        funder_address: "<wallet_address>",
        funder_signature: "<wallet_signature>",
      },
      notes: [
        "ForecastOS does not choose token decimals, approve tokens, sign EIP-712 typed data, sign/send transactions, fetch nonces, or move funds.",
        "Use a configured wallet/action tool with policy permission for EIP-712 signing and funding transactions.",
        "Base MCP funding may return Base Account smart-wallet signatures verified through EIP-1271/ERC-6492; those are accepted for funding but not for creation.",
        "If collateral allowance is insufficient, the wallet/action tool approves the token before funding.",
        "The wallet/action tool resolves this intent into tx_hash, funder_address, and funder_signature.",
        "If no wallet/action tool is configured, direct the user to the [Precog creation area](https://core.precog.markets/launchpad/) instead of asking for raw signatures.",
        "Submit the resolved payload with fund_market only after operator approval.",
      ],
    });
  }
  async fundMarket(state, event = {}) {
    if (event.approved !== true) fail("fund_market requires explicit operator approval with approved: true.");
    const approvalStatus = state.precog_approval?.precog_status ?? state.precog_approval?.status;
    if (approvalStatus !== "VALIDATED") {
      fail("fund_market requires Precog status VALIDATED.");
    }
    const request = event.funding_request ?? event;
    requireFields(request, ["amount", "tx_hash", "funder_address", "funder_signature"], "fund_market");
    const amount = normalizePrecogFundingAmount(request.amount);
    const upcomingMarket = request.upcoming_market ?? state.market_id;
    if (upcomingMarket === undefined || upcomingMarket === null || upcomingMarket === "") {
      fail("fund_market requires upcoming_market or state.market_id.");
    }
    const response = await this.#postPrecog("/api/v1/fund-upcoming-market/", {
      upcoming_market: upcomingMarket,
      amount,
      tx_hash: request.tx_hash,
      funder_address: request.funder_address,
      funder_signature: request.funder_signature,
    });
    return normalizeFundResponse(response, {
      upcoming_market: upcomingMarket,
      amount,
      tx_hash: request.tx_hash,
      funder_address: request.funder_address,
    });
  }

  async consumePrediction(state, event = {}) {
    const config = await readPrecogConfig(this.store);
    const request = getPredictionRequest(event);
    const upcomingMarket = getUpcomingMarketId(state, event);
    const chainId = getChainId(state, event, "consume_prediction", config);
    let deployedMarketId = getDeployedMarketId(state, request);

    let upcomingStatus = null;
    if (deployedMarketId === undefined || deployedMarketId === null || deployedMarketId === "") {
      const response = await this.#getPrecog("/api/v1/upcoming-markets/", {
        chain_id: chainId,
        id: upcomingMarket,
      }, config);
      const deployment = normalizeDeploymentResponse(response, upcomingMarket);
      upcomingStatus = deployment.upcoming_market_status;
      deployedMarketId = deployment.deployed_market_id;

      if (!deployment.ready_to_fetch_market) {
        return deployment;
      }
    }

    const deployedMasterAddress = requireDeployedMasterAddress(config);
    const response = await this.#getPrecog("/api/v1/markets/", {
      chain_id: chainId,
      master_address: deployedMasterAddress,
      master_market_id: deployedMarketId,
    }, config);
    const market = normalizeDeployedMarketResponse(response, {
      chain_id: chainId,
      master_address: deployedMasterAddress,
      master_market_id: deployedMarketId,
    });
    return normalizePredictionResponse(market, {
      chain_id: chainId,
      upcoming_market: upcomingMarket,
      upcoming_market_status: upcomingStatus,
    });
  }

  async #saveResult(result) {
    await this.store.saveWorkflow(result.state);
    return result;
  }

  async #postPrecog(path, payload) {
    if (typeof this.fetch !== "function") {
      throw new PrecogApiError("Fetch API is not available in this runtime.", {
        code: "FETCH_UNAVAILABLE",
        endpoint: path,
      });
    }
    const config = await readPrecogConfig(this.store);
    const endpoint = buildPrecogUrl(config.api_root, path);
    const response = await this.fetch(endpoint, {
      method: "POST",
      headers: {
        "x-api-key": config.open_api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await readResponseBody(response);
    if (!response.ok) {
      throw new PrecogApiError("Precog API request failed.", {
        code: "PRECOG_API_ERROR",
        status: response.status,
        endpoint,
        body,
      });
    }
    return body;
  }

  async #getPrecog(path, params, config = null) {
    if (typeof this.fetch !== "function") {
      throw new PrecogApiError("Fetch API is not available in this runtime.", {
        code: "FETCH_UNAVAILABLE",
        endpoint: path,
      });
    }
    const precogConfig = config ?? await readPrecogConfig(this.store);
    const endpoint = buildPrecogUrl(precogConfig.api_root, path, params);
    const response = await this.fetch(endpoint, {
      method: "GET",
      headers: {
        "x-api-key": precogConfig.open_api_key,
        "Content-Type": "application/json",
      },
    });
    const body = await readResponseBody(response);
    if (!response.ok) {
      throw new PrecogApiError("Precog API request failed.", {
        code: "PRECOG_API_ERROR",
        status: response.status,
        endpoint,
        body,
      });
    }
    return body;
  }
}

function buildDraft(input = {}, context = {}) {
  const draftId = `draft_${randomUUID()}`;
  const draftHash = `hash_${randomUUID()}`;
  const outcomes = normalizeDraftOutcomes(input.requested_outcomes ?? input.outcomes ?? []);
  const missingFields = [];
  const warnings = [];
  const closeTime = normalizeUtcIso(input.requested_close_time, "close_time", warnings);
  const resolutionTime = normalizeUtcIso(
    input.requested_resolution_time,
    "resolution_time",
    warnings,
  );
  if (!input.prompt) missingFields.push("prompt");
  if (!outcomes.length) missingFields.push("outcomes");
  if (!input.source_hints?.length && !input.source_of_truth) missingFields.push("source_of_truth");
  if (!closeTime) missingFields.push("close_time");
  if (!resolutionTime) missingFields.push("resolution_time");

  const question = input.question ?? input.prompt ?? "ForecastOS market question";
  const sourceOfTruth = input.source_of_truth ?? input.source_hints?.[0] ?? null;
  const collateralContext = buildDraftCollateralContext(input, context.config);
  const blockingIssues = missingFields.map((field) => `Missing ${field}.`);
  if (outcomes.length > 0 && outcomes.length < 3) {
    missingFields.push("at_least_three_outcomes");
    blockingIssues.push(
      "ForecastOS defaults to multi-outcome markets and requires at least three explicit outcomes. Split yes/no-shaped prompts into concrete mutually exclusive outcomes.",
    );
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    missingFields.push("question_length");
    blockingIssues.push(
      `Question must be ${MAX_QUESTION_LENGTH} characters or fewer for Launchpad display.`,
    );
  }
  const longOutcomes = outcomes.filter((outcome) => outcome.length > MAX_OUTCOME_LENGTH);
  if (longOutcomes.length) {
    missingFields.push("outcome_length");
    blockingIssues.push(
      `Each outcome must be ${MAX_OUTCOME_LENGTH} characters or fewer for Launchpad display.`,
    );
  }
  const suggestNextQuestions = buildSuggestNextQuestions(missingFields);
  const market = {
    market_type: "multi_outcome",
    title: input.title ?? titleFromPrompt(input.prompt),
    question,
    outcomes,
    description: input.description ?? "ForecastOS multi-outcome market draft.",
    resolution_criteria:
      input.resolution_criteria ??
      buildDefaultResolutionCriteria({
        question,
        outcomes,
        sourceOfTruth,
        resolutionTime,
      }),
    close_time: closeTime,
    resolution_time: resolutionTime,
    time_zone: "UTC",
    source_of_truth: sourceOfTruth,
    collateral_symbol: collateralContext.symbol,
    collateral_address: collateralContext.address,
    category: input.preferred_category ?? "other",
    tags: ["forecastos", "multi_outcome"],
  };

  return {
    draft_id: draftId,
    draft_hash: draftHash,
    status: blockingIssues.length ? "blocked" : "pass",
    market,
    quality: {
      score: blockingIssues.length ? 50 : 90,
      blocking_issues: blockingIssues,
      warnings,
      duplicate_warning: null,
    },
    missing_fields: missingFields,
    suggest_next_questions: suggestNextQuestions,
    approval_text: `I approve ForecastOS draft ${draftId} at hash ${draftHash}.`,
    approval_prompt: "Reply yes to approve this draft.",
    review_message: buildFriendlyReviewMessage({
      market,
      quality: { blocking_issues: blockingIssues, warnings },
      suggest_next_questions: suggestNextQuestions,
    }),
    created_at: new Date().toISOString(),
  };
}

function buildSuggestNextQuestions(missingFields = []) {
  const unique = [...new Set(missingFields)];
  const questions = {
    prompt: "What market should ForecastOS draft?",
    outcomes: "What are the possible outcomes? Please provide at least three clear options.",
    at_least_three_outcomes:
      "Can you split this into at least three concrete outcomes instead of a simple Yes/No?",
    question_length:
      `Can you shorten the question to ${MAX_QUESTION_LENGTH} characters or fewer?`,
    outcome_length:
      `Can you shorten each outcome to ${MAX_OUTCOME_LENGTH} characters or fewer?`,
    source_of_truth: "What official source should resolve this market?",
    close_time: "When should trading close? Please use UTC or include a timezone.",
    resolution_time: "When should the market resolve? Please use UTC or include a timezone.",
  };
  return unique.map((field) => questions[field] ?? `Please provide ${field}.`);
}

function buildDraftCollateralContext(input = {}, config = {}) {
  const precog = config?.precog ?? {};
  return {
    symbol: input.collateral_symbol ?? precog.default_collateral_symbol ?? null,
    address: input.collateral_address ?? precog.default_collateral_address ?? null,
  };
}

function normalizeDraftOutcomes(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeOutcomeLabel).filter(Boolean);
  }
  return String(value ?? "")
    .split(",")
    .map(sanitizeOutcomeLabel)
    .filter(Boolean);
}

function sanitizeOutcomeLabel(value) {
  return String(value ?? "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDefaultResolutionCriteria({
  question,
  outcomes = [],
  sourceOfTruth,
  resolutionTime,
} = {}) {
  const source = sourceOfTruth ?? "the stated source of truth";
  const outcomeList = outcomes.length ? outcomes.join(" / ") : "the listed outcomes";
  const fallbackOutcome = outcomes.find(isFallbackOutcomeLabel);
  const lines = [
    `Resolution source: ${source}.`,
    `Resolve to exactly one listed outcome: ${outcomeList}.`,
    `Use the first official result, announcement, or data update from ${source} that unambiguously answers: "${question}". Do not use unofficial reports, speculation, or secondary summaries unless ${source} cites them as official.`,
  ];
  if (resolutionTime) {
    lines.push(`Resolve at or after ${formatUtcForReview(resolutionTime)} once the official result is available.`);
  }
  if (fallbackOutcome) {
    lines.push(`If no listed non-fallback outcome is confirmed by the resolution time, resolve to "${fallbackOutcome}".`);
  } else {
    lines.push("If the official source does not confirm any listed outcome by the resolution time, resolve to the listed outcome that best matches the final official result.");
  }
  return lines.join("\n");
}

function isFallbackOutcomeLabel(value) {
  return /(?:no official|cancel|invalid|ambiguous|fallback|no reliable|not returned|other)/i.test(
    String(value ?? ""),
  );
}

function ensureState(state, event) {
  const timestamp = new Date().toISOString();
  return {
    step: state.step ?? "intake",
    prompt: state.prompt ?? event.input?.prompt,
    ...state,
    workflow_id: state.workflow_id ?? `workflow_${randomUUID()}`,
    created_at: state.created_at ?? timestamp,
    updated_at: state.updated_at ?? timestamp,
    history: Array.isArray(state.history) ? state.history : [],
  };
}

function buildCreatePayload(draft, input, now) {
  const startTimestamp = toUnixTimestamp(input.start_timestamp ?? now());
  const endTimestampSource =
    input.end_timestamp ??
    input.close_time ??
    draft.market.close_time;
  if (endTimestampSource === undefined || endTimestampSource === null || endTimestampSource === "") {
    fail("create_market requires end_timestamp or draft close_time.");
  }
  const endTimestamp = toUnixTimestamp(endTimestampSource);
  if (startTimestamp >= endTimestamp) {
    fail("create_market requires start_timestamp to be before end_timestamp.");
  }

  const payload = withoutUndefined({
    question: normalizePrecogQuestion(input.question ?? draft.market.question),
    resolution_criteria: input.resolution_criteria ?? draft.market.resolution_criteria,
    image_url: normalizeUrl(input.image_url, "image_url"),
    category: normalizePrecogCategory(input.category ?? draft.market.category),
    outcomes: normalizePrecogOutcomes(input.outcomes ?? draft.market.outcomes),
    start_timestamp: startTimestamp,
    end_timestamp: endTimestamp,
    collateral_address: input.collateral_address,
    chain_id: input.chain_id,
    creator_address: input.creator_address,
    creator_signature: input.creator_signature,
    creator_email: input.creator_email,
  });
  requireFields(payload, [
    "question",
    "resolution_criteria",
    "image_url",
    "category",
    "outcomes",
    "start_timestamp",
    "end_timestamp",
    "collateral_address",
    "chain_id",
    "creator_address",
    "creator_signature",
  ], "Precog create payload");
  return payload;
}

function normalizeCreateResponse(response, draft, input = {}) {
  const marketId =
    response.upcoming_market ?? response.upcoming_market_id ?? response.market_id ?? response.id;
  const url = buildLaunchpadMarketUrl({
    chainId: input.chain_id,
    marketId,
    question: draft.market.question,
  });
  return {
    market_id: marketId,
    upcoming_market: response.upcoming_market ?? marketId,
    precog_status: response.status,
    status: response.status,
    chain_id: input.chain_id,
    collateral_address: input.collateral_address,
    creator_address: input.creator_address,
    title: draft.market.title,
    close_time: draft.market.close_time,
    resolution_time: draft.market.resolution_time,
    url,
    precog_response: response,
  };
}

export function formatMarketQuestionToURL(question) {
  return String(question ?? "")
    .replace(/\?$/, "")
    .replace(/[''`]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export function buildLaunchpadMarketUrl({ chainId, marketId, question }) {
  const slug = formatMarketQuestionToURL(question);
  const baseUrl = `${PRECOG_LAUNCHPAD_BASE_URL}/${chainId}/${marketId}`;
  return slug ? `${baseUrl}/${slug}` : baseUrl;
}

function normalizeApprovalResponse(response, expectedId) {
  if (Array.isArray(response)) {
    const market =
      response.find((entry) => String(entry.id) === String(expectedId)) ?? response[0];
    if (!market) {
      throw new PrecogApiError("Upcoming market was not found.", {
        code: "PRECOG_UPCOMING_MARKET_NOT_FOUND",
        status: 404,
        body: [],
      });
    }
    const status = normalizePrecogStatus(market.status);
    return {
      ready_to_fund: status === "VALIDATED",
      rejected: isRejectedPrecogStatus(status),
      pending: !isFinalPrecogApprovalStatus(status),
      market_id: market.id,
      upcoming_market: market.id,
      precog_status: status,
      status: status,
      upcoming_market_status: market,
      precog_response: market,
    };
  }
  if (response?.detail) {
    throw new PrecogApiError("Precog upcoming market lookup failed.", {
      code: "PRECOG_UPCOMING_MARKET_LOOKUP_ERROR",
      status: response.detail === "Not found." ? 404 : 403,
      body: response,
    });
  }
  throw new PrecogApiError("Unexpected Precog upcoming market response.", {
    code: "PRECOG_UNEXPECTED_RESPONSE",
    body: response,
  });
}

function normalizePrecogStatus(value) {
  return String(value ?? "").trim().toUpperCase();
}

function isRejectedPrecogStatus(status) {
  return ["REJECTED", "FAILED", "DENIED"].includes(normalizePrecogStatus(status));
}

function isFinalPrecogApprovalStatus(status) {
  const normalized = normalizePrecogStatus(status);
  return normalized === "VALIDATED" || isRejectedPrecogStatus(normalized);
}

function normalizeDeploymentResponse(response, expectedId) {
  if (Array.isArray(response)) {
    const market =
      response.find((entry) => String(entry.id) === String(expectedId)) ?? response[0];
    if (!market) {
      throw new PrecogApiError("Upcoming market was not found.", {
        code: "PRECOG_UPCOMING_MARKET_NOT_FOUND",
        status: 404,
        body: [],
      });
    }
    const deployedMasterAddress = market.deployed_master_address;
    const deployedMarketId = market.deployed_market_id;
    const ready =
      market.status === "DEPLOYED" &&
      deployedMarketId !== undefined &&
      deployedMarketId !== null &&
      deployedMarketId !== "";
    return {
      ready_to_finish: false,
      ready_to_fetch_market: ready,
      waiting_for_deployment: !ready,
      market_id: market.id,
      upcoming_market: market.id,
      chain_id: market.chain_id,
      deployed_master_address: deployedMasterAddress,
      deployed_market_id: deployedMarketId,
      precog_status: market.status,
      status: market.status,
      upcoming_market_status: market,
      precog_response: market,
      reason: ready
        ? "Upcoming market is deployed."
        : "Upcoming market is not deployed yet or is missing deployed_market_id.",
    };
  }
  if (response?.detail) {
    throw new PrecogApiError("Precog upcoming market deployment lookup failed.", {
      code: "PRECOG_UPCOMING_MARKET_LOOKUP_ERROR",
      status: response.detail === "Not found." ? 404 : 403,
      body: response,
    });
  }
  throw new PrecogApiError("Unexpected Precog upcoming market response.", {
    code: "PRECOG_UNEXPECTED_RESPONSE",
    body: response,
  });
}

function normalizeDeployedMarketResponse(response, expected = {}) {
  if (Array.isArray(response)) {
    const market =
      response.find((entry) =>
        String(entry.master_market_id) === String(expected.master_market_id) &&
        String(entry.chain_id) === String(expected.chain_id) &&
        normalizeAddress(entry.master_address) === normalizeAddress(expected.master_address),
      ) ?? response[0];
    if (!market) {
      throw new PrecogApiError("Deployed market was not found.", {
        code: "PRECOG_DEPLOYED_MARKET_NOT_FOUND",
        status: 404,
        body: [],
      });
    }
    return market;
  }
  if (response?.detail) {
    throw new PrecogApiError("Precog deployed market lookup failed.", {
      code: "PRECOG_DEPLOYED_MARKET_LOOKUP_ERROR",
      status: response.detail === "Not found." ? 404 : 403,
      body: response,
    });
  }
  if (response && typeof response === "object") {
    throw new PrecogApiError("Precog deployed market lookup failed.", {
      code: "PRECOG_DEPLOYED_MARKET_LOOKUP_ERROR",
      status: 400,
      body: response,
    });
  }
  throw new PrecogApiError("Unexpected Precog deployed market response.", {
    code: "PRECOG_UNEXPECTED_RESPONSE",
    body: response,
  });
}

function normalizePredictionResponse(market, context = {}) {
  const outcomes = parseList(market.outcomes);
  const outcomePrices = parseList(market.outcomes_prices).map((value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  });
  return {
    ready_to_finish: true,
    market_id: market.id,
    upcoming_market: context.upcoming_market,
    deployed_market_id: market.master_market_id,
    deployed_master_address: market.master_address,
    chain_id: market.chain_id ?? context.chain_id,
    status: market.status,
    market,
    parsed: {
      outcomes,
      outcomes_prices: outcomePrices,
    },
    signal: {
      status: market.status,
      oracle_status: market.oracle_status,
      reported_result: market.reported_result,
      funding_amount: market.funding_amount,
      outcomes,
      outcomes_prices: outcomePrices,
      chain_id: market.chain_id ?? context.chain_id,
      master_address: market.master_address,
      master_market_id: market.master_market_id,
      contract_address: market.contract_address,
    },
    upcoming_market_status: context.upcoming_market_status,
    precog_response: market,
  };
}

function normalizeWalletProvider(value) {
  const provider = String(value ?? "configured_wallet_tool").trim();
  if (!provider) {
    fail("Funding wallet/action tool name must be a non-empty string when provided.");
  }
  return provider;
}

function validateCreatorSignatureCompatibility(input = {}) {
  const provider = String(
    input.wallet_provider ??
    input.wallet_audit?.provider ??
    input.operator_wallet_reference ??
    "",
  ).trim().toLowerCase();
  if (provider !== "base-mcp") return;
  if (isEoaEip712Signature(input.creator_signature)) return;

  const error = new Error(
    "Base MCP returned a smart-account/WebAuthn signature, but the current Precog create endpoint requires an EOA-style 65-byte EIP-712 signature. Use Privy, another EOA-compatible wallet/action tool, or the Precog creation area for market creation.",
  );
  error.code = "FORECASTOS_WALLET_SIGNATURE_UNSUPPORTED";
  throw error;
}

function isEoaEip712Signature(value) {
  return /^0x[0-9a-fA-F]{130}$/.test(String(value ?? ""));
}

function normalizePrecogFundingAmount(value) {
  const raw = String(value ?? "");
  const amount = raw.trim();
  if (raw !== amount || /\s/.test(raw)) {
    fail("fund_market amount must be a positive plain decimal string in Precog display units, for example \"1\". Do not include spaces or token symbols.");
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount) || /^0(?:\.0+)?$/.test(amount)) {
    fail("fund_market amount must be a positive plain decimal string in Precog display units, for example \"1\" or \"100.5\". Do not use wei/base units, commas, token symbols, or exponent notation.");
  }
  return amount;
}
function normalizeFundResponse(response, request) {
  return {
    market_id: response.upcoming_market ?? request.upcoming_market,
    upcoming_market: response.upcoming_market ?? request.upcoming_market,
    precog_status: response.status,
    status: response.status,
    funding_amount: response.funding_amount,
    tx_hash: response.tx_hash ?? request.tx_hash,
    amount: request.amount,
    funder_address: request.funder_address,
    precog_response: response,
  };
}

async function resolveApprovalContext(store, input = {}) {
  if (input.state) return input.state;
  if (input.workflow) return input.workflow;
  if (input.workflow_id && typeof store.getWorkflow === "function") {
    return store.getWorkflow(input.workflow_id);
  }
  return null;
}

function validateDraftApproval(draft, input = {}, approvalContext = null) {
  const approvedDraftId =
    input.approved_draft_id ??
    approvalContext?.approved_draft_id ??
    approvalContext?.draft_id;
  const approvedDraftHash =
    input.approved_draft_hash ?? approvalContext?.approved_draft_hash;

  if (approvedDraftHash) {
    if (approvedDraftId && approvedDraftId !== draft.draft_id) {
      fail("Approved draft id does not match the draft being created.");
    }
    if (approvedDraftHash !== draft.draft_hash) {
      fail("Approved draft hash does not match the draft being created.");
    }
    return;
  }

  if (
    input.approval_text &&
    input.approval_text.includes(draft.draft_id) &&
    input.approval_text.includes(draft.draft_hash)
  ) {
    return;
  }

  fail("create_market requires approved_draft_hash from workflow state or legacy matching approval_text.");
}

function isApprovalEvent(event = {}, state = {}) {
  if (event.approved === true) return true;
  const text = approvalResponseText(event);
  if (!text) return false;
  if (state.draft_id && state.draft_hash && text.includes(state.draft_id) && text.includes(state.draft_hash)) {
    return true;
  }
  return /^(y|yes|approve|approved|ok|okay|looks good|go ahead|ship it)$/i.test(
    text.trim(),
  );
}

function approvalResponseText(event = {}) {
  return String(
    event.approval_response ??
      event.approval ??
      event.response ??
      event.text ??
      event.message ??
      event.approval_text ??
      "",
  ).trim();
}

function buildFriendlyReviewMessage(draft) {
  const market = draft.market ?? {};
  const quality = draft.quality ?? {};
  const needs = quality.blocking_issues?.length;
  const questions = Array.isArray(draft.suggest_next_questions)
    ? draft.suggest_next_questions
    : [];
  const lines = [
    needs ? "I need a little more before this draft can be approved." : "Draft ready for review.",
    market.title ? `Market: ${market.title}` : null,
    market.question ? `Question: ${market.question}` : null,
    Array.isArray(market.outcomes) ? `Outcomes: ${market.outcomes.join(" / ")}` : null,
    market.close_time ? `Close: ${formatUtcForReview(market.close_time)}` : null,
    market.resolution_time ? `Resolution: ${formatUtcForReview(market.resolution_time)}` : null,
    market.source_of_truth ? `Source: ${market.source_of_truth}` : null,
    formatTokenLine(market),
    market.resolution_criteria ? `Resolution criteria: ${market.resolution_criteria}` : null,
    needs && questions.length ? `Questions: ${questions.join(" ")}` : null,
    quality.warnings?.length ? `Warnings: ${quality.warnings.join(" ")}` : null,
    needs
      ? "Next: answer the questions above or tell me what you want changed."
      : "Next: reply yes to approve, or tell me what you want changed.",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatTokenLine(market = {}) {
  if (market.collateral_symbol && market.collateral_address) {
    return `Token: ${market.collateral_symbol} (${market.collateral_address})`;
  }
  if (market.collateral_symbol) return `Token: ${market.collateral_symbol}`;
  if (market.collateral_address) return `Token: ${market.collateral_address}`;
  return null;
}

function formatUtcForReview(value) {
  const date = parseUtcDate(value);
  return `${date.toISOString()} UTC`;
}

function normalizePrecogQuestion(question) {
  const value = String(question ?? "").trim();
  if (!value) fail("Precog create payload missing required field: question.");
  return value.endsWith("?") ? value : `${value}?`;
}

function normalizePrecogCategory(category) {
  const value = String(category ?? "").trim();
  if (!value) fail("Precog create payload missing required field: category.");
  const categoryMap = {
    agent_launch: "AI",
    integration: "AI",
    strategy: "AI",
    sentiment: "AI",
    revenue: "AI",
    other: "AI",
  };
  return categoryMap[value] ?? value;
}

function normalizePrecogOutcomes(outcomes) {
  const input = Array.isArray(outcomes) ? outcomes : String(outcomes ?? "").split(",");
  const normalized = input.map(sanitizeOutcomeLabel);
  if (normalized.length < 2 || normalized.some((outcome) => !outcome)) {
    fail("Precog create payload requires at least two non-empty outcomes.");
  }
  return normalized.join(",");
}

function normalizeUrl(value, label) {
  const url = String(value ?? "").trim();
  if (!url) fail(`create_market missing required field(s): ${label}.`);
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      fail(`${label} must be an http(s) URL.`);
    }
    return parsed.toString();
  } catch {
    fail(`${label} must be a valid URL.`);
  }
}

function getUpcomingMarketId(state = {}, event = {}) {
  const request = getPredictionRequest(event);
  const upcomingMarket =
    event.upcoming_market ??
    event.id ??
    request.upcoming_market ??
    request.market_id ??
    state.upcoming_market ??
    state.market_id;
  if (upcomingMarket === undefined || upcomingMarket === null || upcomingMarket === "") {
    fail("ForecastOS requires state.market_id or upcoming_market.");
  }
  return upcomingMarket;
}

function getChainId(state = {}, event = {}, label = "ForecastOS action", config = {}) {
  const request = getPredictionRequest(event);
  return config.chain_id;
}

function getPredictionRequest(event = {}) {
  return event.prediction_request ?? event ?? {};
}

function getDeployedMarketId(state = {}, request = {}) {
  return request.master_market_id ?? request.deployed_market_id ?? state.deployed_market_id;
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string") return [value];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to comma parsing.
    }
  }
  return trimmed.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function normalizeAddress(value) {
  return value ? String(value).toLowerCase() : "";
}

async function readPrecogConfig(store, options = {}) {
  const config = typeof store.getConfig === "function" ? await store.getConfig() : null;
  const precog = config?.precog ?? {};
  if (!precog.open_api_key) {
    throw new PrecogApiError("Missing .forecastos/config.json precog.open_api_key.", {
      code: "PRECOG_CONFIG_ERROR",
      endpoint: null,
      body: { error: "Missing precog.open_api_key" },
    });
  }
  if (!precog.api_root) {
    throw new PrecogApiError("Missing .forecastos/config.json precog.api_root.", {
      code: "PRECOG_CONFIG_ERROR",
      endpoint: null,
      body: { error: "Missing precog.api_root" },
    });
  }
  if (options.requireDeployedMasterAddress && !precog.deployed_master_address) {
    throw new PrecogApiError(
      "Missing .forecastos/config.json precog.deployed_master_address.",
      {
        code: "PRECOG_CONFIG_ERROR",
        endpoint: null,
        body: { error: "Missing precog.deployed_master_address" },
      },
    );
  }
  return {
    api_root: precog.api_root,
    open_api_key: precog.open_api_key,
    deployed_master_address: precog.deployed_master_address,
    chain_id: requireConfigChainId(precog),
    default_collateral_address: precog.default_collateral_address,
    default_collateral_symbol: precog.default_collateral_symbol,
    signature_actions: requireConfigSignatureActions(precog),
  };
}

function requireConfigChainId(precog) {
  const chainId = Number(precog.chain_id);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new PrecogApiError("Missing .forecastos/config.json precog.chain_id.", {
      code: "PRECOG_CONFIG_ERROR",
      endpoint: null,
      body: { error: "Missing precog.chain_id" },
    });
  }
  return chainId;
}

function requireConfigSignatureActions(precog) {
  const actions = precog.signature_actions ?? {};
  if (!actions.create_market || !actions.fund_market) {
    throw new PrecogApiError("Missing .forecastos/config.json precog.signature_actions create_market/fund_market.", {
      code: "PRECOG_CONFIG_ERROR",
      endpoint: null,
      body: { error: "Missing precog.signature_actions.create_market or precog.signature_actions.fund_market" },
    });
  }
  return {
    create_market: actions.create_market,
    fund_market: actions.fund_market,
  };
}

function buildPrecogAuthorizationTypedDataTemplate({ config, action, account, nonce }) {
  return {
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
      chainId: config.chain_id,
      verifyingContract: requireDeployedMasterAddress(config),
    },
    message: {
      action,
      account,
      chainId: config.chain_id,
      nonce,
    },
  };
}

function requireDefaultCollateralAddress(config) {
  if (!config.default_collateral_address) {
    throw new PrecogApiError(
      "Missing .forecastos/config.json precog.default_collateral_address.",
      {
        code: "PRECOG_CONFIG_ERROR",
        endpoint: null,
        body: { error: "Missing precog.default_collateral_address" },
      },
    );
  }
  return config.default_collateral_address;
}

function requireDeployedMasterAddress(config) {
  if (!config.deployed_master_address) {
    throw new PrecogApiError(
      "Missing .forecastos/config.json precog.deployed_master_address.",
      {
        code: "PRECOG_CONFIG_ERROR",
        endpoint: null,
        body: { error: "Missing precog.deployed_master_address" },
      },
    );
  }
  return config.deployed_master_address;
}

function mergeConfig(config, localConfig) {
  return {
    ...(config ?? {}),
    ...(localConfig ?? {}),
    precog: {
      ...(config?.precog ?? {}),
      ...(localConfig?.precog ?? {}),
    },
  };
}

function buildPrecogUrl(root, path, params = null) {
  const url = new URL(`${root.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function normalizeUtcIso(value, label, warnings = []) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && !hasExplicitTimeZone(value)) {
    warnings.push(`${label} had no timezone; treated as UTC.`);
  }
  return parseUtcDate(value).toISOString();
}

function parseUtcDate(value) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) fail(`Invalid timestamp: ${value}`);
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(Math.floor(value) * 1000);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return new Date(Number(value) * 1000);
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    const parseTarget = hasExplicitTimeZone(normalized)
      ? normalized
      : normalizeTimezoneLessUtcString(normalized);
    const parsed = Date.parse(parseTarget);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  fail(`Invalid timestamp: ${value}`);
}

function hasExplicitTimeZone(value) {
  return /(?:z|[+-]\d{2}:?\d{2})$/i.test(String(value).trim());
}

function normalizeTimezoneLessUtcString(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00Z`;
  return `${value}Z`;
}

function toUnixTimestamp(value) {
  return Math.floor(parseUtcDate(value).getTime() / 1000);
}

function requireFields(value, fields, label) {
  const missing = fields.filter(
    (field) => value[field] === undefined || value[field] === null || value[field] === "",
  );
  if (missing.length) fail(`${label} missing required field(s): ${missing.join(", ")}.`);
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function markWorkflowError(state, error) {
  return {
    ...state,
    updated_at: new Date().toISOString(),
    last_error: serializeError(error),
  };
}

export function serializeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    code: error?.code,
    status: error?.status,
    endpoint: error?.endpoint,
    body: error?.body,
  };
}

export class PrecogApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PrecogApiError";
    this.code = details.code;
    this.status = details.status;
    this.endpoint = details.endpoint;
    this.body = details.body;
  }
}

function transition(previousState, nextState, eventType) {
  const updatedAt = new Date().toISOString();
  return {
    ...nextState,
    workflow_id: previousState.workflow_id,
    created_at: previousState.created_at,
    updated_at: updatedAt,
    history: [
      ...(previousState.history ?? []),
      {
        at: updatedAt,
        event_type: eventType,
        from_step: previousState.step,
        to_step: nextState.step,
      },
    ],
  };
}

function titleFromPrompt(prompt = "") {
  const clean = prompt.trim().replace(/\s+/g, " ");
  if (!clean) return "ForecastOS multi-outcome market";
  return clean.length > 90 ? `${clean.slice(0, 87)}...` : clean;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}
`, "utf8");
}

async function readJsonOrNull(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readJsonDir(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => readJsonOrNull(join(path, entry.name))),
    );
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function fail(message) {
  throw new Error(message);
}
