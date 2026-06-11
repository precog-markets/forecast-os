// Builds and validates Precog create-upcoming-market payloads.
import { fail } from "./errors.mjs";
import { normalizeEvmChecksumAddress } from "./evm.mjs";
import { requireFields, withoutUndefined } from "./object_utils.mjs";
import { toUnixTimestamp } from "./time.mjs";

export function buildCreatePayload(draft, input, now) {
  const startTimestamp = toUnixTimestamp(input.start_timestamp ?? now());
  const endTimestampSource =
    input.end_timestamp ??
    input.close_time ??
    draft.market.close_time;
  if (endTimestampSource === undefined || endTimestampSource === null || endTimestampSource === "") {
    fail("create_market requires end_timestamp or draft close_time.");
  }
  const endTimestamp = toUnixTimestamp(endTimestampSource);
  if (startTimestamp >= endTimestamp) {
    fail("create_market requires start_timestamp to be before end_timestamp.");
  }

  const payload = withoutUndefined({
    question: normalizePrecogQuestion(input.question ?? draft.market.question),
    resolution_criteria: normalizeResolutionCriteria(input.resolution_criteria ?? draft.market.resolution_criteria),
    image_url: normalizeImageUrl(input.image_url, "image_url"),
    category: normalizePrecogCategory(input.category ?? draft.market.category),
    outcomes: normalizePrecogOutcomes(input.outcomes ?? draft.market.outcomes),
    start_timestamp: startTimestamp,
    end_timestamp: endTimestamp,
    collateral_address: input.collateral_address,
    chain_id: input.chain_id,
    creator_address: normalizeEvmChecksumAddress(input.creator_address, "creator_address"),
    creator_signature: input.creator_signature,
    creator_email: input.creator_email,
  });
  requireFields(payload, [
    "question",
    "resolution_criteria",
    "image_url",
    "category",
    "outcomes",
    "start_timestamp",
    "end_timestamp",
    "collateral_address",
    "chain_id",
    "creator_address",
    "creator_signature",
  ], "Precog create payload");
  return payload;
}

function normalizeResolutionCriteria(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function normalizePrecogQuestion(question) {
  const value = String(question ?? "").trim();
  if (!value) fail("Precog create payload missing required field: question.");
  return value.endsWith("?") ? value : `${value}?`;
}

function normalizePrecogCategory(category) {
  const value = String(category ?? "").trim();
  if (!value) fail("Precog create payload missing required field: category.");
  const categoryMap = {
    agent_launch: "AI",
    integration: "AI",
    strategy: "AI",
    sentiment: "AI",
    revenue: "AI",
    other: "AI",
  };
  return categoryMap[value] ?? value;
}

function normalizePrecogOutcomes(outcomes) {
  const input = Array.isArray(outcomes) ? outcomes : String(outcomes ?? "").split(",");
  const normalized = input.map(sanitizeOutcomeLabel);
  if (normalized.length < 3 || normalized.some((outcome) => !outcome)) {
    fail("ForecastOS create_market requires at least three non-empty outcomes; split binary yes/no markets into concrete multi-outcome labels.");
  }
  if (isBinaryYesNoOutcomeSet(normalized)) {
    fail("ForecastOS create_market does not publish pure Yes/No outcome sets. Split the prompt into at least three concrete outcomes.");
  }
  return normalized.join(",");
}

function sanitizeOutcomeLabel(value) {
  const label = extractOutcomeLabel(value);
  return String(label ?? "")
    .replace(/,/g, " -")
    .trim();
}

function extractOutcomeLabel(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value.label ?? value.name ?? value.title ?? value.outcome ?? value.value ?? JSON.stringify(value);
  }
  return value;
}

function isBinaryYesNoOutcomeSet(outcomes = []) {
  if (outcomes.length !== 2) return false;
  const labels = outcomes.map((outcome) => outcome.toLowerCase());
  return labels.includes("yes") && labels.includes("no");
}

function normalizeImageUrl(value, label) {
  const url = String(value ?? "").trim();
  if (!url) fail(`create_market missing required field(s): ${label}.`);
  if (url.startsWith("ipfs://")) {
    return canonicalizeIpfsUri(url, label);
  }
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      fail(`${label} must be a valid http(s) or ipfs URL.`);
    }
    return parsed.toString();
  } catch {
    fail(`${label} must be a valid http(s) or ipfs URL.`);
  }
}

function canonicalizeIpfsUri(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a valid http(s) or ipfs URL.`);
  }
  if (parsed.protocol !== "ipfs:") {
    fail(`${label} must be a valid http(s) or ipfs URL.`);
  }

  let cid = "";
  let subpath = "";
  if (!parsed.hostname) {
    fail(`${label} must be a valid http(s) or ipfs URL.`);
  }

  if (parsed.hostname === "ipfs") {
    const path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    if (!path) fail(`${label} must be a valid http(s) or ipfs URL.`);
    const normalizedPath = path.startsWith("ipfs/") ? path.slice("ipfs/".length) : path;
    const slashIndex = normalizedPath.indexOf("/");
    if (slashIndex === -1) {
      cid = normalizedPath;
    } else {
      cid = normalizedPath.slice(0, slashIndex);
      subpath = normalizedPath.slice(slashIndex);
    }
  } else {
    cid = parsed.hostname;
    subpath = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
  }

  if (!cid) fail(`${label} must be a valid http(s) or ipfs URL.`);
  return subpath ? `ipfs://${cid}${subpath}` : `ipfs://${cid}`;
}
