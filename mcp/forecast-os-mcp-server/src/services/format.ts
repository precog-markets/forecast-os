import { CHARACTER_LIMIT } from "../constants.js";

export function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text: truncate(text) }],
  };
}

export function jsonResult(value: unknown) {
  return textResult(`${JSON.stringify(value, null, 2)}\n`);
}

export function markdownOrJsonResult(
  value: unknown,
  responseFormat: "markdown" | "json" | undefined,
  markdown: string,
) {
  return responseFormat === "json" ? jsonResult(value) : textResult(markdown);
}

export function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return `${text.slice(0, CHARACTER_LIMIT)}\n\n[ForecastOS MCP response truncated. Use a narrower resource/tool request.]`;
}
