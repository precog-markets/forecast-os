// Small object validation/normalization helpers shared by the ForecastOS runtime.
import { fail } from "./errors.mjs";

export function requireFields(value, fields, label) {
  const missing = fields.filter(
    (field) => value[field] === undefined || value[field] === null || value[field] === "",
  );
  if (missing.length) fail(`${label} missing required field(s): ${missing.join(", ")}.`);
}

export function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
