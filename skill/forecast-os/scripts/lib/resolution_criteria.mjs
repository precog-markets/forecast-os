// Validates that resolution-criteria fallback outcomes exist in the outcomes list.

const RESOLVE_TARGET_PATTERN =
  /(?:resolve(?:s)?(?:\s+as|\s+to)?|market resolves(?:\s+as|\s+to)?)\s+(?:"([^"]+)"|'([^']+)'|([^.\n"]+?))(?:\s*[.\n]|$)/gi;

const FALLBACK_SECTION_PATTERN =
  /(?:^|\n)\s*(?:Fallback|If no (?:listed|official|reliable)|If the (?:official source|source of truth))[^\n]*/gi;

export function extractFallbackOutcomeReferences(criteria) {
  const text = String(criteria ?? "").trim();
  if (!text) return [];

  const references = new Set();
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

export function findMissingFallbackOutcomes(criteria, outcomes = []) {
  const references = extractFallbackOutcomeReferences(criteria);
  if (!references.length) return [];

  const normalizedOutcomes = outcomes.map(normalizeOutcomeLabelForMatch);
  return references.filter(
    (reference) => !normalizedOutcomes.includes(normalizeOutcomeLabelForMatch(reference)),
  );
}

export function validateResolutionCriteriaOutcomes(criteria, outcomes = []) {
  const blockingIssues = [];
  const warnings = [];
  const missing = findMissingFallbackOutcomes(criteria, outcomes);

  for (const reference of missing) {
    blockingIssues.push(
      `Resolution criteria fallback references "${reference}" which is not a listed outcome. Add it as an outcome or rewrite the Fallback line.`,
    );
  }

  return { blockingIssues, warnings };
}

function normalizeOutcomeLabelForMatch(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ");
}

function isGenericResolutionPhrase(value) {
  const normalized = normalizeOutcomeLabelForMatch(value);
  return (
    normalized.includes("listed outcome that best matches") ||
    normalized.includes("the listed outcome that best matches") ||
    normalized.includes("exactly one listed outcome")
  );
}
