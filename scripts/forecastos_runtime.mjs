// Provides the bundled local ForecastOS runtime used by the action bridge by default.
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const STATUS_FOLDERS = Object.freeze([
  "needs_info",
  "await_approval",
  "create_market",
  "await_precog_approval",
  "funded",
  "consume_prediction",
  "done",
]);

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
}

export function createForecastOS(options = {}) {
  return new ForecastOSLocalRuntime(options.store ?? new DirectoryDraftStateStore());
}

export function workflowStatusFolder(step) {
  return step === "fund" ? "funded" : step;
}

class ForecastOSLocalRuntime {
  constructor(store) {
    this.store = store;
  }

  async draftMarket(input) {
    const draft = buildDraft(input);
    await this.store.save(draft);
    return draft;
  }

  async createMarket(input) {
    if (input.approved !== true) fail("create_market requires approved: true.");
    if (!input.approval_text) fail("create_market requires approval_text.");
    const draft = await this.store.get(input.draft_id);
    if (!draft) fail(`Draft not found: ${input.draft_id}`);
    if (draft.quality.blocking_issues.length) {
      fail(`Draft has blocking issues: ${draft.quality.blocking_issues.join(", ")}`);
    }
    if (!input.approval_text.includes(draft.draft_id) || !input.approval_text.includes(draft.draft_hash)) {
      fail("Approval text does not match the draft id and hash.");
    }
    return mockCreatedMarket(draft);
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
      if (!event.approved || !event.approval_text) {
        return {
          state: current,
          needs_human_input: true,
          agent_message: "Ask the operator to approve the exact ForecastOS approval text.",
        };
      }
      return this.#saveResult({
        state: transition(current, {
          ...current,
          step: "create_market",
          approval_text: event.approval_text,
          approved_by: event.approved_by,
        }, "approval_recorded"),
        needs_human_input: false,
        agent_message: "Approval recorded. Next step is create_market.",
      });
    }

    if (current.step === "create_market") {
      const result = await this.createMarket({
        draft_id: current.draft_id,
        approved: true,
        approved_by: current.approved_by ?? "operator",
        approval_text: current.approval_text,
      });
      return this.#saveResult({
        state: transition(current, {
          ...current,
          step: "await_precog_approval",
          market_id: result.market_id,
          market_url: result.url,
          last_result: result,
        }, "market_created_todo"),
        tool_result: result,
        needs_human_input: false,
        agent_message: "Mock/TODO market creation recorded. Next step is await_precog_approval.",
      });
    }

    if (current.step === "await_precog_approval") {
      const result = await this.awaitPrecogApproval(current, event);
      return this.#saveResult({
        state: transition(current, {
          ...current,
          step: "fund",
          precog_approval: result,
          last_result: result,
        }, "precog_approval_todo"),
        tool_result: result,
        needs_human_input: false,
        agent_message: "Precog approval is TODO/mock. Next step is fund.",
      });
    }

    if (current.step === "fund") {
      const result = await this.fundMarket(current, event);
      return this.#saveResult({
        state: transition(current, {
          ...current,
          step: "consume_prediction",
          funding_result: result,
          last_result: result,
        }, "funding_todo"),
        tool_result: result,
        needs_human_input: false,
        agent_message: "Funding is TODO/mock. Next step is consume_prediction.",
      });
    }

    if (current.step === "consume_prediction") {
      const result = await this.consumePrediction(current, event);
      return this.#saveResult({
        state: transition(current, {
          ...current,
          step: "done",
          prediction_result: result,
          last_result: result,
        }, "prediction_consumed_todo"),
        tool_result: result,
        needs_human_input: false,
        agent_message: "Prediction consumption is TODO/mock. Workflow is done.",
      });
    }

    return { state: current, needs_human_input: false, agent_message: "No workflow action taken." };
  }

  async awaitPrecogApproval(state) {
    return {
      todo: true,
      mocked: true,
      provider: "precog",
      status: "todo_mock_precog_approval",
      replace_with: "Replace with real Precog approval lookup once the API contract is confirmed.",
      market_id: state.market_id,
    };
  }

  async fundMarket(state, event = {}) {
    return {
      todo: true,
      mocked: true,
      provider: event.funding_request?.provider ?? "manual",
      status: "todo_mock_funding",
      replace_with: "Replace with Bankr, LiFi, or manual operator funding adapter.",
      funding_request: event.funding_request ?? null,
      market_id: state.market_id,
    };
  }

  async consumePrediction(state, event = {}) {
    return {
      todo: true,
      mocked: true,
      provider: event.prediction_request?.source ?? "precog",
      status: "todo_mock_prediction_consumed",
      replace_with: "Replace with configured market data adapter once the API contract is confirmed.",
      market_id: event.prediction_request?.market_id ?? state.market_id,
    };
  }

  async #saveResult(result) {
    await this.store.saveWorkflow(result.state);
    return result;
  }
}

function buildDraft(input = {}) {
  const draftId = `draft_${randomUUID()}`;
  const draftHash = `hash_${randomUUID()}`;
  const outcomes = input.requested_outcomes ?? input.outcomes ?? [];
  const missingFields = [];
  if (!input.prompt) missingFields.push("prompt");
  if (!outcomes.length) missingFields.push("outcomes");
  if (!input.source_hints?.length && !input.source_of_truth) missingFields.push("source_of_truth");
  if (!input.requested_close_time) missingFields.push("close_time");
  if (!input.requested_resolution_time) missingFields.push("resolution_time");

  const blockingIssues = missingFields.map((field) => `Missing ${field}.`);
  const market = {
    market_type: "multi_outcome",
    title: input.title ?? titleFromPrompt(input.prompt),
    question: input.question ?? input.prompt ?? "ForecastOS market question",
    outcomes,
    description: input.description ?? "ForecastOS multi-outcome market draft.",
    resolution_criteria:
      input.resolution_criteria ??
      "Resolve to the listed outcome confirmed by the stated source of truth.",
    close_time: input.requested_close_time ?? null,
    resolution_time: input.requested_resolution_time ?? null,
    source_of_truth: input.source_of_truth ?? input.source_hints?.[0] ?? null,
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
      warnings: [],
      duplicate_warning: null,
    },
    missing_fields: missingFields,
    approval_text: `I approve ForecastOS draft ${draftId} at hash ${draftHash}.`,
    review_message: [
      "ForecastOS draft ready for review.",
      `Title: ${market.title}`,
      `Outcomes: ${market.outcomes.join(", ")}`,
      `Approval text: I approve ForecastOS draft ${draftId} at hash ${draftHash}.`,
    ].join("\n"),
    created_at: new Date().toISOString(),
  };
}

function mockCreatedMarket(draft) {
  const marketId = `todo_market_${randomUUID()}`;
  return {
    market_id: marketId,
    url: `todo://precog/${marketId}`,
    title: draft.market.title,
    close_time: draft.market.close_time,
    resolution_time: draft.market.resolution_time,
    created_at: new Date().toISOString(),
    precog_response_ref: "PRECOG_API_TODO",
    todo: true,
    mocked: true,
    replace_with:
      "Replace with real Precog market creation once endpoint, auth, payload, and response contract are confirmed.",
  };
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
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
