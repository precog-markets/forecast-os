import type { MarketShapeInput } from "../types.js";

export function validateMarketShape(market: MarketShapeInput) {
  const blocking_issues: string[] = [];
  const warnings: string[] = [];
  const outcomes = normalizeOutcomes(market.outcomes);

  if (!String(market.question ?? "").trim()) blocking_issues.push("Missing question.");
  if (!String(market.resolution_criteria ?? "").trim()) {
    blocking_issues.push("Missing resolution_criteria.");
  }
  if (!String(market.source_of_truth ?? "").trim()) blocking_issues.push("Missing source_of_truth.");
  if (!String(market.close_time ?? "").trim()) blocking_issues.push("Missing close_time.");
  if (!String(market.resolution_time ?? "").trim()) blocking_issues.push("Missing resolution_time.");
  if (outcomes.length < 3) {
    blocking_issues.push("ForecastOS markets should include at least three explicit outcomes.");
  }
  if (outcomes.length === 2 && /^yes$/i.test(outcomes[0] ?? "") && /^no$/i.test(outcomes[1] ?? "")) {
    blocking_issues.push("Do not use only Yes/No outcomes for normal ForecastOS drafts.");
  }
  if (market.market_type && market.market_type !== "multi_outcome") {
    blocking_issues.push("ForecastOS market_type must be multi_outcome.");
  }
  if (String(market.close_time ?? "").trim() && !String(market.close_time).endsWith("Z")) {
    warnings.push("close_time should be UTC ISO with Z.");
  }
  if (String(market.resolution_time ?? "").trim() && !String(market.resolution_time).endsWith("Z")) {
    warnings.push("resolution_time should be UTC ISO with Z.");
  }

  return {
    valid: blocking_issues.length === 0,
    market_type: "multi_outcome",
    outcomes,
    blocking_issues,
    warnings,
    next_step: blocking_issues.length ? "needs_info" : "await_approval",
    read_only: true,
  };
}

export function formatMarketShapeValidation(validation: ReturnType<typeof validateMarketShape>): string {
  if (validation.valid) {
    return [
      "Market shape looks ready for human review.",
      `Next step: ${validation.next_step}.`,
      "Keep creation/funding outside MCP through the ForecastOS action bridge or trusted wallet/action tooling.",
    ].join("\n");
  }

  return [
    "Market shape needs changes before approval.",
    validation.blocking_issues.length
      ? `Blocking issues: ${validation.blocking_issues.join(" ")}`
      : null,
    validation.warnings.length ? `Warnings: ${validation.warnings.join(" ")}` : null,
    `Next step: ${validation.next_step}. Ask the user for the missing details in plain language.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeOutcomes(outcomes: MarketShapeInput["outcomes"]): string[] {
  if (Array.isArray(outcomes)) {
    return outcomes.map((outcome) => String(outcome).trim()).filter(Boolean);
  }
  return String(outcomes ?? "")
    .split(",")
    .map((outcome) => outcome.trim())
    .filter(Boolean);
}
