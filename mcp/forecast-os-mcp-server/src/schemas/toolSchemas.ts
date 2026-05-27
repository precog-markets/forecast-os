import { z } from "zod";

export const ResponseFormatSchema = z.enum(["markdown", "json"]).default("markdown");
export const ExternalMarketProviderSchema = z.enum(["precog", "polymarket", "kalshi"]);
export const SearchMarketProviderSchema = z.enum(["all", "precog", "polymarket", "kalshi"]).default("all");

export const EmptyInputSchema = z.object({}).strict();

export const GetResourceInputSchema = z
  .object({
    uri: z.string().min(1).describe("ForecastOS resource URI, for example forecastos://docs/workflow."),
    response_format: ResponseFormatSchema.optional(),
  })
  .strict();

export const NamedResourceInputSchema = z
  .object({
    name: z.string().min(1).optional(),
    response_format: ResponseFormatSchema.optional(),
  })
  .strict();

export const MarketShapeSchema = z
  .object({
    market_type: z.string().optional(),
    title: z.string().optional(),
    question: z.string().optional(),
    outcomes: z.union([z.array(z.string()), z.string()]).optional(),
    description: z.string().optional(),
    resolution_criteria: z.string().optional(),
    close_time: z.string().optional(),
    resolution_time: z.string().optional(),
    source_of_truth: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

export const ValidateMarketShapeInputSchema = z
  .object({
    market: MarketShapeSchema,
    response_format: ResponseFormatSchema.optional(),
  })
  .strict();

export const ExplainNextStepInputSchema = z
  .object({
    step: z.string().optional(),
    workflow_id: z.string().optional(),
    workflow: z
      .object({
        step: z.string().optional(),
        workflow_id: z.string().optional(),
      })
      .passthrough()
      .optional(),
    response_format: ResponseFormatSchema.optional(),
  })
  .strict();

export const PolymarketIdentifierSchema = z
  .object({
    slug: z.string().min(1).optional(),
    event_id: z.union([z.string().min(1), z.number()]).optional(),
    market_id: z.union([z.string().min(1), z.number()]).optional(),
    condition_id: z.string().min(1).optional(),
    token_id: z.string().min(1).optional(),
  })
  .strict();

export const KalshiIdentifierSchema = z
  .object({
    ticker: z.string().min(1).optional(),
    event_ticker: z.string().min(1).optional(),
    series_ticker: z.string().min(1).optional(),
  })
  .strict();

export const PrecogIdentifierSchema = z
  .object({
    id: z.union([z.string().min(1), z.number()]).optional(),
    master_market_id: z.union([z.string().min(1), z.number()]).optional(),
    deployed_market_id: z.union([z.string().min(1), z.number()]).optional(),
  })
  .strict();

export const ExternalMarketIdentifierSchema = z
  .object({
    precog: PrecogIdentifierSchema.optional(),
    polymarket: PolymarketIdentifierSchema.optional(),
    kalshi: KalshiIdentifierSchema.optional(),
  })
  .strict();

export const SearchMarketsInputSchema = z
  .object({
    provider: SearchMarketProviderSchema.optional(),
    query: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    tag_id: z.union([z.string().min(1), z.number()]).optional(),
    ticker: z.string().min(1).optional(),
    event_ticker: z.string().min(1).optional(),
    series_ticker: z.string().min(1).optional(),
    status: z.enum(["active", "closed", "all"]).default("active").optional(),
    cache_mode: z.enum(["auto", "refresh", "bypass"]).default("auto").optional(),
    limit: z.number().int().min(1).max(100).default(20).optional(),
    offset: z.number().int().min(0).default(0).optional(),
    response_format: ResponseFormatSchema.optional(),
  })
  .strict();

export const GetExternalMarketInputSchema = z
  .object({
    provider: ExternalMarketProviderSchema.optional(),
    identifier: ExternalMarketIdentifierSchema,
    response_format: ResponseFormatSchema.optional(),
  })
  .strict();

export const GetMarketPricesInputSchema = z
  .object({
    provider: ExternalMarketProviderSchema.optional(),
    identifier: ExternalMarketIdentifierSchema,
    side: z.enum(["BUY", "SELL"]).optional(),
    response_format: ResponseFormatSchema.optional(),
  })
  .strict();

export const GetMarketOrderbookInputSchema = z
  .object({
    provider: ExternalMarketProviderSchema.optional(),
    identifier: ExternalMarketIdentifierSchema,
    depth: z.number().int().min(1).max(100).default(25).optional(),
    response_format: ResponseFormatSchema.optional(),
  })
  .strict();
