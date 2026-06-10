// Provides the bundled local ForecastOS runtime used by the action bridge by default.
import { randomUUID } from "node:crypto";
import {
  buildPrecogAuthorizationTypedDataTemplate,
  buildPrecogUrl,
  chainConfigFor,
  chainHintsFrom,
  readPrecogConfig,
  requireDefaultCollateralAddress,
  requireDeployedMasterAddress,
  resolveWorkflowChainId,
} from "./lib/config.mjs";
import { buildCreatePayload } from "./lib/create_payload.mjs";
import { fail, PrecogApiError, serializeError as serializeRuntimeError } from "./lib/errors.mjs";
import { normalizeEvmChecksumAddress } from "./lib/evm.mjs";
import { validateResolutionCriteriaOutcomes } from "./lib/resolution_criteria.mjs";
import { requireFields, withoutUndefined } from "./lib/object_utils.mjs";
import {
  DirectoryDraftStateStore,
  workflowStatusFolder,
} from "./lib/state_store.mjs";
import { normalizeUtcIso, parseUtcDate, toUnixTimestamp } from "./lib/time.mjs";

const PRECOG_LAUNCHPAD_BASE_URL = "https://core.precog.markets/launchpad";
const MAX_QUESTION_LENGTH = 65;
const MAX_OUTCOME_LENGTH = 32;

export { DirectoryDraftStateStore, workflowStatusFolder };

export function createForecastOS(options = {}) {
  return new ForecastOSLocalRuntime(options.store ?? new DirectoryDraftStateStore(), {
    fetch: options.fetch,
    now: options.now,
  });
}

class ForecastOSLocalRuntime {
  constructor(store, options = {}) {
    this.store = store;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? (() => new Date());
  }

  async draftMarket(input) {
    const config = typeof this.store.getConfig === "function"
      ? await this.store.getConfig(process.env)
      : {};
    const draft = buildDraft(input, { config });
    await this.store.save(draft);
    return draft;
  }

  async createMarket(input) {
    if (input.approved !== true) fail("create_market requires approved: true.");
    const config = await readPrecogConfig(this.store, { chainHints: chainHintsFrom(input) });
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
    const payload = buildCreatePayload(draft, createInput, this.now);
    const response = await this.#postPrecog(
      "/api/v1/create-upcoming-market/",
      payload,
      { signatureDiagnostic: buildSignatureDiagnostic(payload, { ...createInput, deployed_master_address: config.deployed_master_address }, config.signature_actions.create_market) },
    );
    return normalizeCreateResponse(response, draft, createInput);
  }

  async prepareCreateIntent(input) {
    const config = await readPrecogConfig(this.store, {
      requireDeployedMasterAddress: true,
      chainHints: chainHintsFrom(input),
    });
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
      wallet_tool_hint: "If chain/collateral is missing, ask: With collateral from which chain? Default options: USDC on Base or USDC on Arbitrum. Then use Bankr, Privy, Base MCP (Base), another configured wallet/action tool, or the Precog creation area instead of asking the user for raw signatures. Adapter-returned hex signatures are trusted wallet/action outputs.",
      launchpad_fallback_url: "https://core.precog.markets/launchpad/",
      wallet_runtime_candidates: ["bankr", "codex", "claude_code", "openclaw"],
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
        "Use a configured wallet/action tool with policy permission for EIP-712 typed-data signing.",
        "Base MCP smart-account/WebAuthn signatures are valid Precog authorization signatures when they are produced over the canonical Precog typed data and current pending nonce; long EIP-1271/ERC-6492 hex envelopes must not be rejected for not being compact EOA signatures.",
        "The wallet/action tool resolves this intent into creator_address and creator_signature.",
        "After wallet resolution, use publish_approved_market with the persisted workflow_id and --wallet-output so ForecastOS loads stored create_market state.",
        "If no wallet/action tool is configured, direct the user to the [Precog creation area](https://core.precog.markets/launchpad/).",
      ],
    });
  }

  async runSkillStep(state = {}, event = {}) {
    const current = ensureState(state, event);

    if (["intake", "draft", "needs_info"].includes(current.step) && event.input) {
      const draft = await this.draftMarket(event.input);
      const nextStep = draft.quality.blocking_issues.length ? "needs_info" : "await_approval";
      const chainContext = await resolveChainContextFromStore(this.store, event, current);
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
          chain_id: chainContext.chain_id,
          collateral_address: chainContext.collateral_address,
          collateral_symbol: chainContext.collateral_symbol,
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
      const chainContext = await resolveChainContextFromStore(this.store, event, current);
      await patchDraftChainOnApproval(this.store, current.draft_id, chainContext);
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
          chain_id: chainContext.chain_id,
          collateral_address: chainContext.collateral_address,
          collateral_symbol: chainContext.collateral_symbol,
        }, "approval_recorded"),
        needs_human_input: true,
        agent_message: "Approval recorded. If chain/collateral is not already specified, ask: With collateral from which chain? Default options are USDC on Base or USDC on Arbitrum. Then ask which wallet or wallet/action tool to use (Bankr, Privy, Base MCP for Base, another configured wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/)).",
      });
    }

    if (current.step === "create_market") {
      if (!event.creator_address || !event.creator_signature) {
        try {
          const intent = await this.prepareCreateIntent({
            ...event,
            draft_id: current.draft_id,
            approved: true,
            approved_by: current.approved_by ?? event.approved_by ?? "operator",
            approval_text: current.approval_text,
            approved_draft_id: current.approved_draft_id,
            approved_draft_hash: current.approved_draft_hash,
            chain_id: event.chain_id ?? current.chain_id,
            collateral_address: event.collateral_address ?? current.collateral_address,
            collateral_symbol: event.collateral_symbol ?? current.collateral_symbol,
            state: current,
          });
          return this.#saveResult({
            state: transition(current, {
              ...current,
              step: "create_market",
              create_intent: intent,
              last_result: intent,
            }, "create_intent_prepared"),
            tool_result: intent,
            needs_human_input: true,
            agent_message: "The draft is approved. If chain/collateral is still missing, ask: With collateral from which chain? (USDC on Base or USDC on Arbitrum). Then resolve this create intent with Privy, Bankr, Base MCP (Base), or another configured wallet/action adapter, and submit with publish_approved_market --input <workflow-id-json> --wallet-output <wallet-adapter-output-json>. Do not hand-write workflow files.",
          });
        } catch (error) {
          return this.#saveResult({
            state: markWorkflowError(current, error),
            tool_result: serializeError(error),
            needs_human_input: true,
            agent_message: "The draft is approved, but preparing the wallet create intent failed. Confirm the image URL, ForecastOS config, and selected wallet/action adapter before retrying.",
          });
        }
      }
      const persistedWorkflow = await readPersistedWorkflow(this.store, current.workflow_id);
      if (persistedWorkflow && persistedWorkflow.step !== "create_market") {
        return {
          state: persistedWorkflow,
          tool_result: persistedWorkflow.last_result ?? {
            already_submitted: true,
            workflow_id: persistedWorkflow.workflow_id,
            market_id: persistedWorkflow.market_id ?? persistedWorkflow.upcoming_market ?? null,
            step: persistedWorkflow.step,
          },
          needs_human_input: false,
          agent_message: persistedWorkflow.market_id || persistedWorkflow.upcoming_market
            ? `This workflow was already submitted to Precog as market ${persistedWorkflow.market_id ?? persistedWorkflow.upcoming_market}. Continuing at ${persistedWorkflow.step}; no duplicate create API call was sent.`
            : `This workflow already advanced to ${persistedWorkflow.step}; no duplicate create API call was sent.`,
        };
      }
      try {
        const result = await this.createMarket({
          ...event,
          draft_id: current.draft_id,
          approved: true,
          approved_by: current.approved_by ?? event.approved_by ?? "operator",
          approval_text: current.approval_text,
          approved_draft_id: current.approved_draft_id,
          approved_draft_hash: current.approved_draft_hash,
          chain_id: event.chain_id ?? current.chain_id,
          collateral_address: event.collateral_address ?? current.collateral_address,
          collateral_symbol: event.collateral_symbol ?? current.collateral_symbol,
          state: current,
        });
        const pendingCheck = buildPendingCheck({
          workflowId: current.workflow_id,
          marketId: result.market_id,
          upcomingMarket: result.upcoming_market,
        });
        const createdResult = {
          ...result,
          pending_check: pendingCheck,
        };
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
            pending_check: pendingCheck,
            last_result: createdResult,
          }, "market_created"),
          tool_result: createdResult,
          needs_human_input: false,
          agent_message: [
            "Precog upcoming market created.",
            `Title: ${result.title}`,
            `Link: ${result.url}`,
            `Schedule hourly pending checks now: ${pendingCheck.command}`,
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
            ? "The draft is approved, but the create submission is missing the wallet signature. If chain/collateral is missing, ask first (USDC on Base or USDC on Arbitrum), then resolve the create intent with Bankr, Privy, Base MCP (Base), or another configured wallet/action tool, and publish with publish_approved_market --input <workflow-id-json> --wallet-output <wallet-adapter-output-json>."
            : "The draft is approved, but live publishing still needs a compatible wallet/action tool. If chain/collateral is missing, ask first (USDC on Base or USDC on Arbitrum), then ask whether the user wants to use Bankr, Privy, Base MCP (Base), another configured wallet/action tool, or the [Precog creation area](https://core.precog.markets/launchpad/).",
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
              pending_check: updatePendingCheck(current.pending_check, result),
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
              validator_feedback: result.validator_feedback,
              pending_check: updatePendingCheck(current.pending_check, result),
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
            pending_check: updatePendingCheck(current.pending_check, result),
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

  async autoRedraftFromRejection(state = {}, approvalResult = {}) {
    if (!approvalResult.rejected) fail("auto_redraft requires a rejected Precog approval result.");
    const originalDraftId = state.approved_draft_id ?? state.draft_id;
    const originalDraft = await this.store.get(originalDraftId);
    if (!originalDraft) fail(`Original draft not found: ${originalDraftId}`);
    const validatorFeedback = approvalResult.validator_feedback?.length
      ? approvalResult.validator_feedback
      : extractValidatorFeedback(approvalResult.precog_response);
    const reflectionPrompt = buildRejectionReflectionPrompt({
      originalDraft,
      validatorFeedback,
      marketId: approvalResult.market_id ?? state.market_id ?? state.upcoming_market,
    });
    const config = typeof this.store.getConfig === "function"
      ? await this.store.getConfig(process.env)
      : {};
    const replacementInput = buildReplacementDraftInput(originalDraft, {
      validatorFeedback,
      reflectionPrompt,
    });
    const replacementDraft = buildDraft(replacementInput, { config });
    replacementDraft.replaces = {
      workflow_id: state.workflow_id,
      draft_id: originalDraft.draft_id,
      market_id: approvalResult.market_id ?? state.market_id ?? state.upcoming_market,
      precog_status: approvalResult.precog_status,
      validator_feedback: validatorFeedback,
      reflection_prompt: reflectionPrompt,
    };
    replacementDraft.review_message = [
      "Auto-redraft prepared after Precog rejection.",
      validatorFeedback.length ? `Validator feedback: ${validatorFeedback.join(" ")}` : null,
      replacementDraft.review_message,
    ].filter(Boolean).join("\n");
    await this.store.save(replacementDraft);
    const timestamp = new Date().toISOString();
    const replacementWorkflow = await this.store.saveWorkflow({
      workflow_id: `workflow_${randomUUID()}`,
      step: "await_approval",
      prompt: replacementInput.prompt,
      draft_id: replacementDraft.draft_id,
      draft_hash: replacementDraft.draft_hash,
      approval_prompt: replacementDraft.approval_prompt,
      approval_text: replacementDraft.approval_text,
      last_result: replacementDraft,
      replaces: replacementDraft.replaces,
      created_at: timestamp,
      updated_at: timestamp,
      history: [
        {
          event: "auto_redraft_created",
          at: timestamp,
          previous_workflow_id: state.workflow_id,
          previous_market_id: replacementDraft.replaces.market_id,
        },
      ],
    });
    return {
      action: "auto_redraft",
      created: true,
      original_workflow_id: state.workflow_id,
      original_market_id: replacementDraft.replaces.market_id,
      validator_feedback: validatorFeedback,
      reflection_prompt: reflectionPrompt,
      draft: replacementDraft,
      workflow: replacementWorkflow,
      next_step: "show_replacement_draft_for_user_approval",
      auto_submit: false,
    };
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
    const config = await readPrecogConfig(this.store, {
      requireDeployedMasterAddress: true,
      chainHints: chainHintsFrom({ state, ...request }),
    });
    const chainId = config.chain_id;
    const provider = normalizeWalletProvider(request.provider ?? request.wallet_provider ?? request.wallet_tool);
    const fundingAsset = request.funding_asset ?? request.asset ?? request.collateral_symbol ?? state.collateral_symbol;
    return withoutUndefined({
      intent_type: "forecastos.fund_market",
      wallet_provider: provider,
      wallet_tool_hint: "If chain/collateral is missing, ask: With collateral from which chain? Default options: USDC on Base or USDC on Arbitrum. Then use Bankr, Privy, Base MCP (Base), another configured wallet/action tool, or the Precog creation area instead of asking the user for raw signatures. For Base MCP funding, send the prepared calls first, then sign FUND_UPCOMING_MARKET with the post-transaction pending nonce before submitting to Precog.",
      launchpad_fallback_url: "https://core.precog.markets/launchpad/",
      wallet_runtime_candidates: ["bankr", "codex", "claude_code", "openclaw"],
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
        "Bankr funding is supported through the Bankr wallet adapter; keep Bankr endpoint details in the Bankr adapter docs.",
        "Base MCP create and funding may return Base Account smart-wallet signatures verified through EIP-1271/ERC-6492; those are valid when signed over the canonical Precog typed data and current pending nonce.",
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
    const payload = {
      upcoming_market: upcomingMarket,
      amount,
      tx_hash: request.tx_hash,
      funder_address: request.funder_address,
      funder_signature: request.funder_signature,
    };
    const config = await readPrecogConfig(this.store);
    const response = await this.#postPrecog(
      "/api/v1/fund-upcoming-market/",
      payload,
      { signatureDiagnostic: buildSignatureDiagnostic(payload, { ...request, deployed_master_address: config.deployed_master_address }, config.signature_actions.fund_market) },
    );
    return normalizeFundResponse(response, {
      upcoming_market: upcomingMarket,
      amount,
      tx_hash: request.tx_hash,
      funder_address: request.funder_address,
    });
  }

  async consumePrediction(state, event = {}) {
    const config = await readPrecogConfig(this.store, { chainHints: chainHintsFrom({ state, event }) });
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

  async #postPrecog(path, payload, options = {}) {
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
      throw new PrecogApiError(buildPrecogFailureMessage(response.status, body, options.signatureDiagnostic), {
        code: "PRECOG_API_ERROR",
        status: response.status,
        endpoint,
        body,
        signature_diagnostic: options.signatureDiagnostic,
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
  const prompt = input.prompt ?? input.question;
  const closeTime = normalizeUtcIso(input.requested_close_time ?? input.close_time, "close_time", warnings);
  const resolutionTime = normalizeUtcIso(
    input.requested_resolution_time ?? input.resolution_time,
    "resolution_time",
    warnings,
  );
  const sourceOfTruth =
    input.source_of_truth ??
    input.source ??
    input.source_hints?.[0] ??
    extractResolutionSource(input.resolution_criteria);
  if (!prompt) missingFields.push("prompt");
  if (!outcomes.length) missingFields.push("outcomes");
  if (!sourceOfTruth) missingFields.push("source_of_truth");
  if (!closeTime) missingFields.push("close_time");
  if (!resolutionTime) missingFields.push("resolution_time");

  const question = input.question ?? input.prompt ?? "ForecastOS market question";
  const precog = context.config?.precog ?? {};
  const chainExplicit = chainSelectionExplicit(input, precog);
  const collateralContext = buildDraftCollateralContext(input, context.config);
  const resolvedChainId = chainExplicit
    ? (collateralContext.chain_id ?? chainIdFromInput(input, precog))
    : null;
  const blockingIssues = missingFields.map((field) => `Missing ${field}.`);
  if (!chainExplicit) {
    missingFields.push("chain_id");
    blockingIssues.push(
      "Chain not selected. Ask: With collateral from which chain? USDC on Base (8453) or USDC on Arbitrum (42161).",
    );
  }
  if (outcomes.length > 0 && outcomes.length < 3) {
    missingFields.push("at_least_three_outcomes");
    blockingIssues.push(
      "ForecastOS requires at least three concrete outcomes. Do not use only Yes/No; split binary prompts into mutually exclusive outcomes such as target happens, target misses the date, or no official result.",
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
  const resolutionCriteria =
    normalizeResolutionCriteria(input.resolution_criteria) ??
    buildDefaultResolutionCriteria({
      question,
      outcomes,
      sourceOfTruth,
      resolutionTime,
    });
  const criteriaMismatch = validateResolutionCriteriaOutcomes(resolutionCriteria, outcomes);
  blockingIssues.push(...criteriaMismatch.blockingIssues);
  warnings.push(...criteriaMismatch.warnings);
  if (criteriaMismatch.blockingIssues.length) {
    missingFields.push("fallback_outcome_mismatch");
  }
  const suggestNextQuestions = buildSuggestNextQuestions(missingFields);
  const market = {
    market_type: "multi_outcome",
    title: input.title ?? titleFromPrompt(prompt),
    question,
    outcomes,
    description: input.description ?? "ForecastOS multi-outcome market draft.",
    resolution_criteria: resolutionCriteria,
    close_time: closeTime,
    resolution_time: resolutionTime,
    time_zone: "UTC",
    source_of_truth: sourceOfTruth,
    collateral_symbol: collateralContext.symbol,
    collateral_address: collateralContext.address,
    chain_id: resolvedChainId,
    category: input.preferred_category ?? input.category ?? "other",
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
      chain_id: resolvedChainId,
    }),
    created_at: new Date().toISOString(),
  };
}

function buildPendingCheck({ workflowId, marketId, upcomingMarket } = {}) {
  const id = marketId ?? upcomingMarket;
  return {
    type: "forecastos.pending_check",
    cadence: "hourly",
    interval_minutes: 60,
    workflow_id: workflowId,
    market_id: id,
    upcoming_market: id,
    command: `node scripts/check_pending_market.mjs --workflow-id ${workflowId} --auto-redraft`,
    continue_when: ["CREATED", "PENDING", "UNKNOWN_NON_FINAL"],
    stop_when: ["VALIDATED", "REJECTED", "FAILED", "DENIED"],
    auto_redraft_on_rejection: true,
    continue_schedule: true,
  };
}

function updatePendingCheck(pendingCheck = null, approvalResult = {}) {
  if (!pendingCheck) return pendingCheck;
  return {
    ...pendingCheck,
    last_checked_status: approvalResult.precog_status ?? approvalResult.status ?? null,
    continue_schedule: !approvalResult.ready_to_fund && !approvalResult.rejected,
    stopped_reason: approvalResult.ready_to_fund
      ? "validated"
      : approvalResult.rejected
        ? "rejected"
        : undefined,
  };
}

function buildReplacementDraftInput(originalDraft, { validatorFeedback = [], reflectionPrompt } = {}) {
  const market = originalDraft.market ?? {};
  const feedbackText = validatorFeedback.length
    ? validatorFeedback.join(" ")
    : "Precog rejected the prior submission without structured validator notes.";
  return {
    prompt: market.question,
    question: market.question,
    title: market.title,
    requested_outcomes: market.outcomes ?? [],
    source_of_truth: market.source_of_truth,
    requested_close_time: market.close_time,
    requested_resolution_time: market.resolution_time,
    preferred_category: market.category,
    collateral_symbol: market.collateral_symbol,
    collateral_address: market.collateral_address,
    chain_id: market.chain_id,
    description: [
      market.description,
      `Revision context: this replacement draft addresses Precog validator feedback: ${feedbackText}`,
    ].filter(Boolean).join("\n\n"),
    resolution_criteria: improveResolutionCriteria(market.resolution_criteria, {
      validatorFeedback,
      reflectionPrompt,
    }),
  };
}

function improveResolutionCriteria(criteria, { validatorFeedback = [], reflectionPrompt } = {}) {
  const feedbackText = validatorFeedback.length
    ? validatorFeedback.map((note) => `- ${note}`).join("\n")
    : "- Precog rejected the previous submission without structured validator notes.";
  return [
    String(criteria ?? "").trim(),
    "Revision notes for Precog validator feedback:",
    feedbackText,
    `Reflection: ${reflectionPrompt}`,
  ].filter(Boolean).join("\n");
}

function buildRejectionReflectionPrompt({ originalDraft, validatorFeedback = [], marketId } = {}) {
  const question = originalDraft?.market?.question ?? "the rejected market";
  const feedback = validatorFeedback.length
    ? validatorFeedback.join(" ")
    : "No structured validator notes were provided; inspect the raw Precog response before approval.";
  return `Revise the ForecastOS draft for market ${marketId ?? "unknown"} (${question}) to directly address this Precog validator feedback: ${feedback}. Keep the market multi-outcome, preserve wallet safety boundaries, and present the replacement draft for user approval before any new create submission.`;
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
    chain_id: "With collateral from which chain? USDC on Base (8453) or USDC on Arbitrum (42161)?",
    fallback_outcome_mismatch:
      "The resolution criteria names a fallback outcome that is not in the outcomes list. Add that outcome (for example Invalid / ambiguous) or rewrite the Fallback line.",
  };
  return unique.map((field) => questions[field] ?? `Please provide ${field}.`);
}

function chainSelectionExplicit(input = {}, precog = {}) {
  const chainId = Number(
    input.chain_id ??
      input.requested_chain_id ??
      input.preferred_chain_id ??
      parseChainAlias(input.preferred_chain ?? input.chain, precog),
  );
  if (Number.isInteger(chainId) && chainId > 0 && isSupportedChainId(chainId, precog)) {
    return true;
  }
  const collateralChainId = chainFromCollateralAddress(
    input.collateral_address,
    precog,
  );
  return collateralChainId !== null;
}

function chainIdFromInput(input = {}, precog = {}) {
  const chainId = Number(
    input.chain_id ??
      input.requested_chain_id ??
      input.preferred_chain_id ??
      parseChainAlias(input.preferred_chain ?? input.chain, precog),
  );
  return Number.isInteger(chainId) && chainId > 0 && isSupportedChainId(chainId, precog) ? chainId : null;
}

function isSupportedChainId(chainId, precog = {}) {
  if (chainConfigFor(precog, chainId)) return true;
  return chainId === 8453 || chainId === 42161;
}

function parseChainAlias(value, precog = {}) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "base" || normalized === "8453") return 8453;
  if (normalized === "arbitrum" || normalized === "arb" || normalized === "42161") return 42161;
  for (const [chainKey, entry] of Object.entries(precog.supported_chains ?? {})) {
    if (entry?.name && normalized === String(entry.name).trim().toLowerCase()) {
      return Number(chainKey);
    }
  }
  return null;
}

function chainFromCollateralAddress(address, precog = {}) {
  if (!address) return null;
  const normalized = String(address).trim().toLowerCase();
  const matches = (precog.default_collateral_options ?? []).filter(
    (option) => String(option.address ?? "").trim().toLowerCase() === normalized,
  );
  if (matches.length !== 1) return null;
  const chainId = Number(matches[0].chain_id);
  return Number.isInteger(chainId) && chainId > 0 && isSupportedChainId(chainId, precog) ? chainId : null;
}

function buildDraftCollateralContext(input = {}, config = {}) {
  const precog = config?.precog ?? {};
  const chainId = resolveWorkflowChainId(precog, chainHintsFrom(input));
  const chainConfig = chainId ? chainConfigFor(precog, chainId) : null;
  return {
    symbol: input.collateral_symbol ?? chainConfig?.default_collateral_symbol ?? precog.default_collateral_symbol ?? null,
    address: input.collateral_address ?? chainConfig?.default_collateral_address ?? precog.default_collateral_address ?? null,
    chain_id: chainId,
  };
}

async function resolveChainContextFromStore(store, event = {}, state = {}) {
  const config = typeof store.getConfig === "function" ? await store.getConfig(process.env) : {};
  const precog = config?.precog ?? {};
  const chainId = resolveWorkflowChainId(precog, chainHintsFrom({ event, state }));
  const chainConfig = chainId ? chainConfigFor(precog, chainId) : null;
  return {
    chain_id: chainId,
    collateral_address:
      event.collateral_address ??
      event.input?.collateral_address ??
      state.collateral_address ??
      chainConfig?.default_collateral_address ??
      precog.default_collateral_address ??
      null,
    collateral_symbol:
      event.collateral_symbol ??
      event.input?.collateral_symbol ??
      state.collateral_symbol ??
      chainConfig?.default_collateral_symbol ??
      precog.default_collateral_symbol ??
      null,
  };
}

async function patchDraftChainOnApproval(store, draftId, chainContext = {}) {
  if (!draftId || !chainContext.chain_id || typeof store.get !== "function") return;
  const draft = await store.get(draftId);
  if (!draft?.market) return;
  const hadChain = draft.market.chain_id != null;
  if (!hadChain) {
    draft.market.chain_id = chainContext.chain_id;
    draft.market.collateral_address =
      chainContext.collateral_address ?? draft.market.collateral_address;
    draft.market.collateral_symbol =
      chainContext.collateral_symbol ?? draft.market.collateral_symbol;
    draft.quality.blocking_issues = (draft.quality.blocking_issues ?? []).filter(
      (issue) => !String(issue).includes("Chain not selected"),
    );
    draft.quality.missing_fields = (draft.quality.missing_fields ?? []).filter(
      (field) => field !== "chain_id",
    );
    if (!draft.quality.blocking_issues.length) {
      draft.status = "pass";
      draft.quality.score = 90;
    }
    await store.save(draft);
  }
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
  return extractOutcomeLabel(value)
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractOutcomeLabel(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    for (const key of ["label", "name", "title", "value", "outcome"]) {
      const candidate = value[key];
      if (candidate === undefined || candidate === null) continue;
      const label = String(candidate).trim();
      if (label) return label;
    }
    return "";
  }
  return String(value ?? "");
}

function extractResolutionSource(criteria) {
  const match = String(criteria ?? "").match(/(?:^|\n)\s*Resolution source:\s*([^\n.]+)/i);
  return match?.[1]?.trim() || null;
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
    `Source of truth: ${source}.`,
    `Winning outcome rule: Resolve to exactly one listed outcome: ${outcomeList}. Use only official results, announcements, or data updates from the source of truth that unambiguously answer: "${question}".`,
  ];
  if (resolutionTime) {
    lines.push(`Resolution timing: Resolve at or after ${formatUtcForReview(resolutionTime)} once the official result is available.`);
  }
  if (fallbackOutcome) {
    lines.push(`Fallback: If no listed non-fallback outcome is confirmed by the resolution time, resolve to "${fallbackOutcome}".`);
  } else {
    lines.push("Fallback: If the source of truth does not confirm any listed outcome by the resolution time, resolve to the listed outcome that best matches the final official result.");
  }
  return lines.join("\n");
}

function normalizeResolutionCriteria(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text
    .replace(/([.?!])(?=(?:Source of truth|Resolution source|Winning outcome rule|Resolve to exactly one listed outcome|Resolution timing|Resolve at or after|Fallback|If no listed|If no official|If the official source|If the source of truth)\b)/g, "$1\n")
    .replace(/\s+(?=(?:Source of truth|Resolution source|Winning outcome rule|Resolve to exactly one listed outcome|Resolution timing|Resolve at or after|Fallback|If no listed|If no official|If the official source|If the source of truth)\b)/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    creator_address: normalizeEvmChecksumAddress(input.creator_address, "creator_address"),
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
    const validatorFeedback = isRejectedPrecogStatus(status)
      ? extractValidatorFeedback(market)
      : [];
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
      validator_feedback: validatorFeedback,
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

function extractValidatorFeedback(value) {
  const fields = [
    "validator_notes",
    "validation_notes",
    "rejection_reason",
    "rejection_notes",
    "validator_feedback",
    "feedback",
    "reason",
    "notes",
  ];
  const notes = [];
  if (value && typeof value === "object") {
    for (const field of fields) {
      notes.push(...normalizeFeedbackEntries(value[field]));
    }
  } else {
    notes.push(...normalizeFeedbackEntries(value));
  }
  const unique = [...new Set(notes.map((note) => note.trim()).filter(Boolean))];
  if (unique.length) return unique;
  if (value && typeof value === "object" && isRejectedPrecogStatus(value.status)) {
    return [`Raw Precog response: ${truncateText(JSON.stringify(value), 500)}`];
  }
  return [];
}

function normalizeFeedbackEntries(value) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(normalizeFeedbackEntries);
  if (typeof value === "object") {
    return [truncateText(JSON.stringify(value), 500)];
  }
  return [String(value)];
}

function truncateText(value, maxLength) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
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

function buildSignatureDiagnostic(payload = {}, input = {}, action) {
  const signature = payload.creator_signature ?? payload.funder_signature;
  const account = payload.creator_address ?? payload.funder_address;
  const nonce = input.wallet_audit?.nonce ?? input.nonce ?? input.authorization_nonce;
  return withoutUndefined({
    action,
    account,
    chain_id: payload.chain_id ?? input.chain_id,
    nonce,
    tx_hash: payload.tx_hash ?? input.tx_hash,
    typed_data: withoutUndefined({
      domain: {
        name: "Precog Markets",
        version: "1",
        chainId: payload.chain_id ?? input.chain_id,
        verifyingContract: input.wallet_audit?.verifying_contract ?? input.deployed_master_address,
      },
      primaryType: "PrecogMarketAuthorization",
      message: withoutUndefined({
        action,
        account,
        chainId: payload.chain_id ?? input.chain_id,
        nonce,
      }),
    }),
    signature_length_bytes: signatureHexLengthBytes(signature),
    signature_is_erc6492: isErc6492Signature(signature),
    wallet_provider: input.wallet_provider ?? input.wallet_audit?.provider,
  });
}

function signatureHexLengthBytes(value) {
  const signature = String(value ?? "");
  return /^0x[0-9a-fA-F]*$/.test(signature) ? (signature.length - 2) / 2 : undefined;
}

function isErc6492Signature(value) {
  return String(value ?? "").toLowerCase().endsWith("6492649264926492649264926492649264926492649264926492649264926492");
}

function buildPrecogFailureMessage(status, body, diagnostic) {
  const error = String(body?.error ?? body?.detail ?? body?.message ?? "");
  const base = `Precog API request failed: ${status}`;
  if (!/invalid (creator|funder) signature/i.test(error)) return base;
  const action = diagnostic?.action ? ` for ${diagnostic.action}` : "";
  return `${base}. ${error}. The ${diagnostic?.wallet_provider === "base-mcp" ? "Base MCP " : ""}signature was rejected${action}. Likely causes: nonce mismatch, wrong account, typed-data/domain/action mismatch, or live verifier/provider failure. See error.signature_diagnostic for non-secret parity details; raw signatures are intentionally omitted from normal chat.`;
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

async function readPersistedWorkflow(store, workflowId) {
  if (!workflowId || typeof store.getWorkflow !== "function") return null;
  return store.getWorkflow(workflowId);
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
  const chainId = draft.chain_id ?? market.chain_id ?? null;
  const lines = [
    needs ? "I need a little more before this draft can be approved." : "Draft ready for review.",
    market.title ? `Market: ${market.title}` : null,
    market.question ? `Question: ${market.question}` : null,
    Array.isArray(market.outcomes)
      ? `Outcomes: ${market.outcomes.map(formatOutcomeForReview).join(" / ")}`
      : null,
    market.close_time ? `Close: ${formatUtcForReview(market.close_time)}` : null,
    market.resolution_time ? `Resolution: ${formatUtcForReview(market.resolution_time)}` : null,
    market.source_of_truth ? `Source: ${market.source_of_truth}` : null,
    formatChainLine(chainId),
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

function formatOutcomeForReview(outcome) {
  return sanitizeOutcomeLabel(outcome) || JSON.stringify(outcome);
}

function formatChainLine(chainId) {
  if (chainId === 8453) return "Chain: Base (8453)";
  if (chainId === 42161) return "Chain: Arbitrum (42161)";
  if (chainId) return `Chain: ${chainId}`;
  return null;
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
  return state.chain_id ?? config.chain_id;
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

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function markWorkflowError(state, error) {
  return {
    ...state,
    updated_at: new Date().toISOString(),
    last_error: serializeError(error),
  };
}

export function serializeError(error) {
  return serializeRuntimeError(error);
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
