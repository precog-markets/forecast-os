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
  if (String(market.resolution_criteria ?? "").trim() && outcomes.length) {
    const criteriaMismatch = validateResolutionCriteriaOutcomes(
      String(market.resolution_criteria),
      outcomes,
    );
    blocking_issues.push(...criteriaMismatch.blockingIssues);
    warnings.push(...criteriaMismatch.warnings);
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

const RESOLVE_TARGET_PATTERN =
  /(?:resolve(?:s)?(?:\s+as|\s+to)?|market resolves(?:\s+as|\s+to)?)\s+(?:"([^"]+)"|'([^']+)'|([^.\n"]+?))(?:\s*[.\n]|$)/gi;

const FALLBACK_SECTION_PATTERN =
  /(?:^|\n)\s*(?:Fallback|If no (?:listed|official|reliable)|If the (?:official source|source of truth))[^\n]*/gi;

function extractFallbackOutcomeReferences(criteria: string): string[] {
  const text = String(criteria ?? "").trim();
  if (!text) return [];

  const references = new Set<string>();
  const fallbackSections = text.match(FALLBACK_SECTION_PATTERN) ?? [text];

  for (const section of fallbackSections) {
    for (const match of section.matchAll(RESOLVE_TARGET_PATTERN)) {
      const reference = (match[1] ?? match[2] ?? match[3] ?? "").trim();
      if (reference && !isGenericResolutionPhrase(reference)) {
        references.add(reference);
      }
    }
  }

  return [...references];
}

function findMissingFallbackOutcomes(criteria: string, outcomes: string[]): string[] {
  const references = extractFallbackOutcomeReferences(criteria);
  if (!references.length) return [];

  const normalizedOutcomes = outcomes.map(normalizeOutcomeLabelForMatch);
  return references.filter(
    (reference) => !normalizedOutcomes.includes(normalizeOutcomeLabelForMatch(reference)),
  );
}

function validateResolutionCriteriaOutcomes(criteria: string, outcomes: string[]) {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const missing = findMissingFallbackOutcomes(criteria, outcomes);

  for (const reference of missing) {
    blockingIssues.push(
      `Resolution criteria fallback references "${reference}" which is not a listed outcome. Add it as an outcome or rewrite the Fallback line.`,
    );
  }

  return { blockingIssues, warnings };
}

function normalizeOutcomeLabelForMatch(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ");
}

function isGenericResolutionPhrase(value: string): boolean {
  const normalized = normalizeOutcomeLabelForMatch(value);
  return (
    normalized.includes("listed outcome that best matches") ||
    normalized.includes("the listed outcome that best matches") ||
    normalized.includes("exactly one listed outcome")
  );
}
