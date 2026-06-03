// UTC parsing and timestamp helpers for ForecastOS market times.
import { fail } from "./errors.mjs";

export function normalizeUtcIso(value, label, warnings = []) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && !hasExplicitTimeZone(value)) {
    warnings.push(`${label} had no timezone; treated as UTC.`);
  }
  return parseUtcDate(value).toISOString();
}

export function parseUtcDate(value) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) fail(`Invalid timestamp: ${value}`);
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(Math.floor(value) * 1000);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return new Date(Number(value) * 1000);
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    const parseTarget = hasExplicitTimeZone(normalized)
      ? normalized
      : normalizeTimezoneLessUtcString(normalized);
    const parsed = Date.parse(parseTarget);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  fail(`Invalid timestamp: ${value}`);
}

export function hasExplicitTimeZone(value) {
  return /(?:z|[+-]\d{2}:?\d{2})$/i.test(String(value).trim());
}

export function normalizeTimezoneLessUtcString(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00Z`;
  return `${value}Z`;
}

export function toUnixTimestamp(value) {
  return Math.floor(parseUtcDate(value).getTime() / 1000);
}
