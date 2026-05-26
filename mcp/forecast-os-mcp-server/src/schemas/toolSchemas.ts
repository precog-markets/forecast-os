import { z } from "zod";

export const ResponseFormatSchema = z.enum(["markdown", "json"]).default("markdown");

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
