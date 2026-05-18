// Exposes read-only MCP tool handlers for inspecting ForecastOS resources and local state.
import {
  createMcpContext,
  listForecastOSResources,
  readForecastOSResource,
} from "./resources.js";

export const READ_ONLY_TOOL_NAMES = Object.freeze([
  "forecastos_list_resources",
  "forecastos_get_resource",
  "forecastos_list_workflows",
  "forecastos_get_workflow",
  "forecastos_list_drafts",
  "forecastos_get_draft",
]);

export async function listForecastOSTools() {
  return [
    {
      name: "forecastos_list_resources",
      description: "List read-only ForecastOS MCP resources.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "forecastos_get_resource",
      description: "Read a ForecastOS MCP resource by URI.",
      inputSchema: {
        type: "object",
        required: ["uri"],
        properties: { uri: { type: "string" } },
      },
    },
    {
      name: "forecastos_list_workflows",
      description: "List saved ForecastOS workflows by status from local state.",
      inputSchema: {
        type: "object",
        properties: { status: { type: "string", default: "all" } },
      },
    },
    {
      name: "forecastos_get_workflow",
      description: "Read a saved ForecastOS workflow by workflow_id.",
      inputSchema: {
        type: "object",
        required: ["workflow_id"],
        properties: { workflow_id: { type: "string" } },
      },
    },
    {
      name: "forecastos_list_drafts",
      description: "List saved ForecastOS market drafts from local state.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "forecastos_get_draft",
      description: "Read a saved ForecastOS market draft by draft_id.",
      inputSchema: {
        type: "object",
        required: ["draft_id"],
        properties: { draft_id: { type: "string" } },
      },
    },
  ];
}

export async function callForecastOSTool(name, args = {}, context = createMcpContext()) {
  if (!READ_ONLY_TOOL_NAMES.includes(name)) {
    throw new Error(`Unknown or disallowed ForecastOS MCP tool: ${name}`);
  }

  if (name === "forecastos_list_resources") return toolJson(await listForecastOSResources());
  if (name === "forecastos_get_resource") {
    const resource = await readForecastOSResource(required(args, "uri"), context);
    return toolText(resource.contents[0].text);
  }
  if (name === "forecastos_list_workflows") {
    const status = args.status ?? "all";
    const resource = await readForecastOSResource(
      `forecastos://state/workflows/${status}`,
      context,
    );
    return toolJson(JSON.parse(resource.contents[0].text));
  }
  if (name === "forecastos_get_workflow") {
    const workflows = await readJsonResource("forecastos://state/workflows/all", context);
    return toolJson(
      workflows.find((workflow) => workflow.workflow_id === required(args, "workflow_id")) ?? null,
    );
  }
  if (name === "forecastos_list_drafts") {
    return toolText(
      (await readForecastOSResource("forecastos://state/drafts", context)).contents[0].text,
    );
  }
  if (name === "forecastos_get_draft") {
    const drafts = await readJsonResource("forecastos://state/drafts", context);
    return toolJson(drafts.find((draft) => draft.draft_id === required(args, "draft_id")) ?? null);
  }

  throw new Error(`Unhandled ForecastOS MCP tool: ${name}`);
}

async function readJsonResource(uri, context) {
  return JSON.parse((await readForecastOSResource(uri, context)).contents[0].text);
}

function required(args, key) {
  if (!args?.[key]) throw new Error(`Missing required argument: ${key}`);
  return args[key];
}

function toolText(text) {
  return { content: [{ type: "text", text }] };
}

function toolJson(value) {
  return toolText(`${JSON.stringify(value, null, 2)}\n`);
}
