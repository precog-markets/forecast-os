// Defines the read-only ForecastOS MCP resources for docs, templates, examples, and local state.
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_STATE_DIR = ".forecastos";

const STATIC_RESOURCES = Object.freeze({
  "forecastos://docs/skill": {
    name: "ForecastOS skill instructions",
    path: "SKILL.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/architecture": {
    name: "ForecastOS architecture",
    path: "references/architecture.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/workflow": {
    name: "ForecastOS workflow",
    path: "references/workflow.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/safety": {
    name: "ForecastOS safety",
    path: "references/safety.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/memory": {
    name: "ForecastOS persistent workflow memory",
    path: "references/memory.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/mcp": {
    name: "ForecastOS MCP",
    path: "references/mcp.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/install": {
    name: "ForecastOS install and local use",
    path: "references/install.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/actions": {
    name: "ForecastOS actions",
    path: "references/actions.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/action-policy": {
    name: "ForecastOS action policy",
    path: "references/action-policy.md",
    mimeType: "text/markdown",
  },
  "forecastos://docs/tool-schemas": {
    name: "ForecastOS action input schemas",
    path: "references/tool-schemas.md",
    mimeType: "text/markdown",
  },
  "forecastos://assets/templates/multi-outcome-market": {
    name: "Multi-outcome market template",
    path: "assets/templates/multi-outcome-market.md",
    mimeType: "text/markdown",
  },
  "forecastos://references/examples/agent-launch": {
    name: "Agent launch example",
    path: "references/examples/agent-launch.md",
    mimeType: "text/markdown",
  },
  "forecastos://references/examples/funding-handoff": {
    name: "Funding handoff example",
    path: "references/examples/funding-handoff.md",
    mimeType: "text/markdown",
  },
  "forecastos://references/examples/full-workflow": {
    name: "Full workflow example",
    path: "references/examples/full-workflow.md",
    mimeType: "text/markdown",
  },
  "forecastos://assets/schemas/actions": {
    name: "ForecastOS action JSON schemas",
    path: "assets/schemas/actions.json",
    mimeType: "application/json",
  },
});

const WORKFLOW_STATUSES = Object.freeze([
  "all",
  "needs_info",
  "await_approval",
  "create_market",
  "await_precog_approval",
  "funded",
  "consume_prediction",
  "done",
]);

export function createMcpContext(options = {}) {
  return {
    stateDir: options.stateDir ?? process.env.FORECASTOS_STATE_DIR ?? DEFAULT_STATE_DIR,
  };
}

export async function listForecastOSResources() {
  return [
    ...Object.entries(STATIC_RESOURCES).map(([uri, resource]) => ({
      uri,
      name: resource.name,
      mimeType: resource.mimeType,
    })),
    {
      uri: "forecastos://state/drafts",
      name: "ForecastOS saved drafts",
      mimeType: "application/json",
    },
    ...WORKFLOW_STATUSES.map((status) => ({
      uri: `forecastos://state/workflows/${status}`,
      name: `ForecastOS ${status} workflows`,
      mimeType: "application/json",
    })),
  ];
}

export async function readForecastOSResource(uri, context = createMcpContext()) {
  if (STATIC_RESOURCES[uri]) {
    const resource = STATIC_RESOURCES[uri];
    return textResource(
      uri,
      resource.mimeType,
      await readFile(join(SKILL_ROOT, resource.path), "utf8"),
    );
  }

  if (uri === "forecastos://state/drafts") {
    return jsonResource(uri, await readJsonDir(join(context.stateDir, "drafts")));
  }

  const prefix = "forecastos://state/workflows/";
  if (uri.startsWith(prefix)) {
    const status = uri.slice(prefix.length);
    if (!WORKFLOW_STATUSES.includes(status)) {
      throw new Error(`Unknown ForecastOS workflow status: ${status}`);
    }
    return jsonResource(uri, await readJsonDir(join(context.stateDir, "workflows", status)));
  }

  throw new Error(`Unknown ForecastOS MCP resource: ${uri}`);
}

function textResource(uri, mimeType, text) {
  return { contents: [{ uri, mimeType, text }] };
}

function jsonResource(uri, value) {
  return textResource(uri, "application/json", `${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonDir(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(path, entry.name));
    return Promise.all(files.map(readJson));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
