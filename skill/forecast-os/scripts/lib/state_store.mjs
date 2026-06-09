// Directory-backed ForecastOS draft/workflow/config state store.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mergeConfig } from "./config.mjs";
import { resolveRepoShippedConfigPath } from "./state_paths.mjs";

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

  async getConfig(env = process.env) {
    const config = await readJsonOrNull(join(this.rootDir, "config.json"));
    const localConfig = await readJsonOrNull(join(this.rootDir, "config.local.json"));
    const merged = mergeConfig(config, localConfig);
    if (merged?.precog?.api_root && merged?.precog?.open_api_key) {
      return merged;
    }
    const fallbackPath = resolveRepoShippedConfigPath(env);
    if (!fallbackPath) return merged;
    const fallbackConfig = await readJsonOrNull(fallbackPath);
    if (!fallbackConfig) return merged;
    return {
      ...mergeConfig(fallbackConfig, merged),
      config_source: fallbackPath,
    };
  }
}

export function workflowStatusFolder(step) {
  return step === "fund" ? "funded" : step;
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
