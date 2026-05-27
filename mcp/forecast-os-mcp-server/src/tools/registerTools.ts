import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  EmptyInputSchema,
  ExplainNextStepInputSchema,
  GetExternalMarketInputSchema,
  GetMarketOrderbookInputSchema,
  GetMarketPricesInputSchema,
  GetResourceInputSchema,
  NamedResourceInputSchema,
  SearchMarketsInputSchema,
  ValidateMarketShapeInputSchema,
} from "../schemas/toolSchemas.js";
import { jsonResult, markdownOrJsonResult, textResult } from "../services/format.js";
import {
  listForecastOSResources,
  precogCapabilities,
  precogConfigDefaults,
  readForecastOSResource,
} from "../services/skillRepository.js";
import {
  formatExternalMarketResult,
  getExternalMarket,
  getExternalMarketOrderbook,
  getExternalMarketPrices,
  searchExternalMarkets,
} from "./externalMarkets.js";
import { formatMarketShapeValidation, validateMarketShape } from "./marketShape.js";
import { explainNextStep, formatNextStepExplanation } from "./nextStep.js";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const READ_ONLY_TOOL_NAMES = Object.freeze([
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
]);

export function registerForecastOSTools(server: McpServer): void {
  server.registerTool(
    "forecastos_list_resources",
    {
      title: "List ForecastOS Resources",
      description: "List read-only ForecastOS MCP resources for docs, templates, schemas, examples, and Precog capability metadata.",
      inputSchema: EmptyInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () => jsonResult(listForecastOSResources()),
  );

  server.registerTool(
    "forecastos_get_resource",
    {
      title: "Get ForecastOS Resource",
      description: "Read one ForecastOS resource by URI. This is read-only and never advances workflow state.",
      inputSchema: GetResourceInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ uri, response_format }) => {
      const resource = await readForecastOSResource(uri);
      return response_format === "json" ? jsonResult(resource) : textResult(resource.text);
    },
  );

  server.registerTool(
    "forecastos_get_schema",
    {
      title: "Get ForecastOS Schema",
      description: "Read a named ForecastOS schema. Currently supports name='actions'.",
      inputSchema: NamedResourceInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ name = "actions", response_format }) => {
      if (name !== "actions") {
        throw new Error(`Unknown ForecastOS schema '${name}'. Use name='actions' or forecastos_get_resource.`);
      }
      const resource = await readForecastOSResource("forecastos://schemas/actions");
      return response_format === "json" ? jsonResult(resource) : textResult(resource.text);
    },
  );

  server.registerTool(
    "forecastos_get_template",
    {
      title: "Get ForecastOS Template",
      description: "Read a named ForecastOS template. Currently supports name='multi-outcome-market'.",
      inputSchema: NamedResourceInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ name = "multi-outcome-market", response_format }) => {
      if (name !== "multi-outcome-market") {
        throw new Error(
          `Unknown ForecastOS template '${name}'. Use name='multi-outcome-market' or forecastos_list_resources.`,
        );
      }
      const resource = await readForecastOSResource("forecastos://templates/multi-outcome-market");
      return response_format === "json" ? jsonResult(resource) : textResult(resource.text);
    },
  );

  server.registerTool(
    "forecastos_validate_market_shape",
    {
      title: "Validate ForecastOS Market Shape",
      description: "Validate a proposed ForecastOS market shape without creating, funding, signing, or mutating workflow state.",
      inputSchema: ValidateMarketShapeInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ market, response_format }) => {
      const validation = validateMarketShape(market);
      return markdownOrJsonResult(
        validation,
        response_format,
        formatMarketShapeValidation(validation),
      );
    },
  );

  server.registerTool(
    "forecastos_explain_next_step",
    {
      title: "Explain ForecastOS Next Step",
      description: "Explain the next valid ForecastOS workflow step without advancing state or calling live execution APIs.",
      inputSchema: ExplainNextStepInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => {
      const guidance = await explainNextStep(input);
      return markdownOrJsonResult(
        guidance,
        input.response_format,
        formatNextStepExplanation(guidance),
      );
    },
  );

  server.registerTool(
    "forecastos_search_markets",
    {
      title: "Search External Prediction Markets",
      description: "Read-only search across external prediction-market providers. Polymarket is implemented; Kalshi is reserved for the same provider envelope.",
      inputSchema: SearchMarketsInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => {
      const result = await searchExternalMarkets(input);
      return markdownOrJsonResult(result, input.response_format, formatExternalMarketResult(result));
    },
  );

  server.registerTool(
    "forecastos_get_market",
    {
      title: "Get External Prediction Market",
      description: "Read one external prediction-market event or market by provider-neutral identifier. This is read-only context and never mutates ForecastOS workflow state.",
      inputSchema: GetExternalMarketInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => {
      const result = await getExternalMarket(input);
      return markdownOrJsonResult(result, input.response_format, formatExternalMarketResult(result));
    },
  );

  server.registerTool(
    "forecastos_get_market_prices",
    {
      title: "Get External Market Prices",
      description: "Read public external market prices. For Polymarket this uses unauthenticated CLOB token price endpoints only.",
      inputSchema: GetMarketPricesInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => {
      const result = await getExternalMarketPrices(input);
      return markdownOrJsonResult(result, input.response_format, formatExternalMarketResult(result));
    },
  );

  server.registerTool(
    "forecastos_get_market_orderbook",
    {
      title: "Get External Market Orderbook",
      description: "Read a public external market orderbook. For Polymarket this requires an outcome token_id and uses unauthenticated CLOB reads only.",
      inputSchema: GetMarketOrderbookInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => {
      const result = await getExternalMarketOrderbook(input);
      return markdownOrJsonResult(result, input.response_format, formatExternalMarketResult(result));
    },
  );

  server.registerTool(
    "forecastos_get_precog_capabilities",
    {
      title: "Get ForecastOS Precog Capabilities",
      description: "Return read-only ForecastOS/Precog capability metadata and safety boundaries.",
      inputSchema: EmptyInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () => jsonResult(precogCapabilities()),
  );

  server.registerTool(
    "forecastos_get_config_defaults",
    {
      title: "Get ForecastOS Config Defaults",
      description: "Return public ForecastOS config defaults with API keys redacted.",
      inputSchema: EmptyInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () => jsonResult(await precogConfigDefaults()),
  );
}
