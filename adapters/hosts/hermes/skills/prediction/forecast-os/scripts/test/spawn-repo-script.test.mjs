import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildRepoSpawnEnv } from "../spawn-repo-script.mjs";

const hermesSkillRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = join(hermesSkillRoot, "..", "..", "..", "..", "..", "..");

test("buildRepoSpawnEnv sets FORECASTOS_STATE_DIR to Hermes skill .forecastos", () => {
  const env = buildRepoSpawnEnv({
    env: {},
    hermesSkillRoot,
    repoRoot,
  });

  assert.equal(env.FORECASTOS_REPO_ROOT, repoRoot);
  assert.equal(env.FORECASTOS_STATE_DIR, join(hermesSkillRoot, ".forecastos"));
  assert.equal(env.FORECASTOS_SKILL_DIR, join(repoRoot, "skill", "forecast-os"));
});

test("buildRepoSpawnEnv preserves explicit FORECASTOS_STATE_DIR override", () => {
  const env = buildRepoSpawnEnv({
    env: { FORECASTOS_STATE_DIR: "/custom/state" },
    hermesSkillRoot,
    repoRoot,
  });

  assert.equal(env.FORECASTOS_STATE_DIR, "/custom/state");
});
