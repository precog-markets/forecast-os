// Resolve skill-local and repo-fallback ForecastOS state/config paths.
import { join, resolve } from "node:path";

export function resolveSkillRoot(scriptDir) {
  return resolve(scriptDir, "..");
}

export function resolveStateDir(env = process.env, skillRoot = process.cwd()) {
  return resolve(env?.FORECASTOS_STATE_DIR ?? join(skillRoot, ".forecastos"));
}

export function resolveConfigFallbackPaths(env = process.env, skillRoot = process.cwd()) {
  const stateDir = resolveStateDir(env, skillRoot);
  const paths = [
    join(stateDir, "config.json"),
    join(stateDir, "config.local.json"),
  ];
  if (env?.FORECASTOS_REPO_ROOT) {
    paths.push(
      join(resolve(env.FORECASTOS_REPO_ROOT), "skill", "forecast-os", ".forecastos", "config.json"),
    );
  }
  return paths;
}

export function resolveRepoShippedConfigPath(env = process.env) {
  if (!env?.FORECASTOS_REPO_ROOT) return null;
  return join(resolve(env.FORECASTOS_REPO_ROOT), "skill", "forecast-os", ".forecastos", "config.json");
}
