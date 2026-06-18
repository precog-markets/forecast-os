import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  PRECOG_QUOTE_REL,
  resolvePrecogQuoteScript,
  resolveRepoScript,
} from "../repo-discovery.mjs";

const hermesSkillRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const repoRoot = join(hermesSkillRoot, "..", "..", "..", "..", "..", "..");

test("resolveRepoScript finds precog quote script at ForecastOS repo root", async () => {
  const resolution = await resolveRepoScript(PRECOG_QUOTE_REL, {
    FORECASTOS_REPO_ROOT: repoRoot,
  }, hermesSkillRoot);

  assert.equal(resolution.ok, true);
  assert.ok(resolution.scriptPath?.replaceAll("\\", "/").endsWith("adapters/actions/precog/quote.mjs"));
});

test("resolvePrecogQuoteScript delegates to precog quote path", async () => {
  const resolution = await resolvePrecogQuoteScript({
    FORECASTOS_REPO_ROOT: repoRoot,
  }, hermesSkillRoot);

  assert.equal(resolution.ok, true);
  assert.equal(resolution.guidance, null);
});
