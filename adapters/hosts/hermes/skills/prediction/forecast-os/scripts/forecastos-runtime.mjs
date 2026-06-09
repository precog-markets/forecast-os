import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPrivyAdapterPath,
  buildRepoRootGuidance,
  buildRepoRootRequiredError,
  resolveForecastOSRepoRoot as resolveRepoRootFromSkill,
  resolvePrivyAdapterScript as resolvePrivyFromSkill,
} from "./repo-discovery.mjs";

export const OUTDATED_RUNTIME_MESSAGE =
  "This Hermes skill is using an outdated ForecastOS runtime; reinstall/symlink the Hermes skill or set FORECASTOS_REPO_ROOT to the repo root.";

export function resolveHermesSkillRoot(fromUrl = import.meta.url) {
  const scriptDir = dirname(fileURLToPath(fromUrl));
  return dirname(scriptDir);
}

export async function resolveForecastOSRepoRoot(env = process.env, hermesSkillRoot = resolveHermesSkillRoot()) {
  const resolved = await resolveRepoRootFromSkill(env, hermesSkillRoot);
  if (resolved.ok && resolved.repoRoot) {
    return resolved.repoRoot;
  }
  return resolve(
    env.FORECASTOS_REPO_ROOT ?? join(hermesSkillRoot, "..", "..", "..", "..", "..", ".."),
  );
}

export async function resolvePrivyAdapterScript(env = process.env, hermesSkillRoot = resolveHermesSkillRoot()) {
  return resolvePrivyFromSkill(env, hermesSkillRoot);
}

export { buildRepoRootGuidance, buildRepoRootRequiredError, buildPrivyAdapterPath };

export function resolveHermesRuntimePaths() {
  const hermesSkillRoot = resolveHermesSkillRoot();
  const repoRoot = resolve(
    process.env.FORECASTOS_REPO_ROOT ?? join(hermesSkillRoot, "..", "..", "..", "..", "..", ".."),
  );
  const canonicalSkillDir = join(repoRoot, "skill", "forecast-os");
  return {
    hermesSkillRoot,
    repoRoot,
    canonicalSkillDir,
    actionScript: join(canonicalSkillDir, "scripts", "forecastos_action.mjs"),
  };
}

export async function assertActionBridgeSupports(actionName) {
  const paths = resolveHermesRuntimePaths();
  try {
    await access(paths.actionScript, constants.R_OK);
  } catch (error) {
    throw buildRuntimeError(actionName, paths, error);
  }
  const source = await readFile(paths.actionScript, "utf8");
  if (!actionBridgeSupports(source, actionName)) {
    throw buildRuntimeError(actionName, paths);
  }
  return paths;
}

export async function actionBridgeSupportCheck(actionName) {
  const paths = resolveHermesRuntimePaths();
  try {
    await access(paths.actionScript, constants.R_OK);
    const source = await readFile(paths.actionScript, "utf8");
    const ok = actionBridgeSupports(source, actionName);
    return {
      name: `forecastos_action_supports_${actionName}`,
      ok,
      path: paths.actionScript,
      error: ok ? null : OUTDATED_RUNTIME_MESSAGE,
    };
  } catch (error) {
    return {
      name: `forecastos_action_supports_${actionName}`,
      ok: false,
      path: paths.actionScript,
      error: error?.message ?? String(error),
    };
  }
}

export function printRuntimeError(error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        status: "error",
        code: error?.code ?? "FORECASTOS_HERMES_RUNTIME_UNSUPPORTED",
        message: error?.message ?? String(error),
        action: error?.action,
        repo_root: error?.repoRoot,
        action_script: error?.actionScript,
        checked_paths: error?.checked_paths,
        guidance: error?.guidance,
      },
      null,
      2,
    )}\n`,
  );
}

function actionBridgeSupports(source, actionName) {
  return source.includes(`"${actionName}"`) || source.includes(`'${actionName}'`);
}

function buildRuntimeError(actionName, paths, cause) {
  const error = new Error(OUTDATED_RUNTIME_MESSAGE);
  error.code = "FORECASTOS_HERMES_RUNTIME_UNSUPPORTED";
  error.action = actionName;
  error.repoRoot = paths.repoRoot;
  error.actionScript = paths.actionScript;
  if (cause) error.cause = cause;
  return error;
}
