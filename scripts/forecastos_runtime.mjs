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
const DEFAULT_PRECOG_API_ROOT = "https://tracker.precog.market/";

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
    return readJsonOrNull(join(this.rootDir, "config.json"));
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
    const draft = buildDraft(input);
    await this.store.save(draft);
    return draft;
  }

  async createMarket(input) {
    if (input.approved !== true) fail("create_market requires approved: true.");
    if (!input.approval_text) fail("create_market requires approval_text.");
    requireFields(input, [
      "collateral_address",
      "chain_id",
      "creator_address",
      "creator_signature",
    ], "create_market");
    const draft = await this.store.get(input.draft_id);
    if (!draft) fail(`Draft not found: ${input.draft_id}`);
    if (draft.quality.blocking_issues.length) {
      fail(`Draft has blocking issues: ${draft.quality.blocking_issues.join(", ")}`);
    }
    if (!input.approval_text.includes(draft.draft_id) || !input.approval_text.includes(draft.draft_hash)) {
      fail("Approval text does not match the draft id and hash.");
    }
    const response = await this.#postPrecog(
      "/api/v1/create-upcoming-market/",
      buildCreatePayload(draft, input, this.now),
    );
    return normalizeCreateResponse(response, draft);
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
      try {
        const result = await this.createMarket({
          ...event,
          draft_id: current.draft_id,
          approved: true,
          approved_by: current.approved_by ?? event.approved_by ?? "operator",
          approval_text: current.approval_text,
        });
        return this.#saveResult({
          state: transition(current, {
            ...current,
            step: "await_precog_approval",
            market_id: result.market_id,
            market_url: result.url,
            precog_status: result.precog_status,
            last_result: result,
          }, "market_created"),
          tool_result: result,
          needs_human_input: false,
          agent_message: "Precog upcoming market created. Next step is await_precog_approval.",
        });
      } catch (error) {
        return this.#saveResult({
          state: markWorkflowError(current, error),
          tool_result: serializeError(error),
          needs_human_input: true,
          agent_message: "Precog create_market failed. The workflow remains at create_market.",
        });
      }
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
    if (event.approved !== true) fail("fund_market requires explicit operator approval with approved: true.");
    const request = event.funding_request ?? event;
    requireFields(request, ["amount", "tx_hash", "funder_address", "funder_signature"], "fund_market");
    const upcomingMarket = request.upcoming_market ?? state.market_id;
    if (upcomingMarket === undefined || upcomingMarket === null || upcomingMarket === "") {
      fail("fund_market requires upcoming_market or state.market_id.");
    }
    const response = await this.#postPrecog("/api/v1/fund-upcoming-market/", {
      upcoming_market: upcomingMarket,
      amount: request.amount,
      tx_hash: request.tx_hash,
      funder_address: request.funder_address,
      funder_signature: request.funder_signature,
    });
    return normalizeFundResponse(response, {
      upcoming_market: upcomingMarket,
      amount: request.amount,
      tx_hash: request.tx_hash,
      funder_address: request.funder_address,
    });
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
  return withoutUndefined({
    question: input.question ?? draft.market.question,
    resolution_criteria: input.resolution_criteria ?? draft.market.resolution_criteria,
    image_url: input.image_url,
    category: input.category ?? draft.market.category,
    outcomes: input.outcomes ?? draft.market.outcomes,
    start_timestamp: toUnixTimestamp(input.start_timestamp ?? now()),
    end_timestamp: toUnixTimestamp(
      input.end_timestamp ?? input.resolution_time ?? draft.market.resolution_time,
    ),
    collateral_address: input.collateral_address,
    chain_id: input.chain_id,
    creator_address: input.creator_address,
    creator_signature: input.creator_signature,
    creator_email: input.creator_email,
  });
}

function normalizeCreateResponse(response, draft) {
  const marketId =
    response.upcoming_market ?? response.upcoming_market_id ?? response.market_id ?? response.id;
  return {
    market_id: marketId,
    upcoming_market: response.upcoming_market ?? marketId,
    precog_status: response.status,
    status: response.status,
    title: draft.market.title,
    close_time: draft.market.close_time,
    resolution_time: draft.market.resolution_time,
    url: response.url ?? null,
    precog_response: response,
  };
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

async function readPrecogConfig(store) {
  const config = typeof store.getConfig === "function" ? await store.getConfig() : null;
  const precog = config?.precog ?? {};
  if (!precog.open_api_key) {
    throw new PrecogApiError("Missing .forecastos/config.json precog.open_api_key.", {
      code: "PRECOG_CONFIG_ERROR",
      endpoint: null,
      body: { error: "Missing precog.open_api_key" },
    });
  }
  return {
    api_root: precog.api_root ?? DEFAULT_PRECOG_API_ROOT,
    open_api_key: precog.open_api_key,
  };
}

function buildPrecogUrl(root, path) {
  return `${root.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
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

function toUnixTimestamp(value) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  fail(`Invalid timestamp: ${value}`);
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
