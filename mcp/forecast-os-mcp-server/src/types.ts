export type ResponseFormat = "markdown" | "json";

export interface ForecastOSResource {
  uri: string;
  name: string;
  mimeType: string;
  path?: string;
}

export interface ToolTextResult {
  content: Array<{ type: "text"; text: string }>;
}

export interface MarketShapeInput {
  market_type?: string;
  title?: string;
  question?: string;
  outcomes?: string[] | string;
  resolution_criteria?: string;
  close_time?: string;
  resolution_time?: string;
  source_of_truth?: string;
  category?: string;
  tags?: string[];
}
