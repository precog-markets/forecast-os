#!/usr/bin/env node
// Reports ForecastOS skill/repo version visibility for daily update checks.
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const discoveredRepoRoot = await findRepoRoot(process.cwd(), skillRoot);
const skillArtifactVersion = await readVersion(join(skillRoot, "VERSION"));
const rootVersion = discoveredRepoRoot
  ? await readVersion(join(discoveredRepoRoot, "VERSION"))
  : null;
const repoSkillVersion = discoveredRepoRoot
  ? await readVersion(join(discoveredRepoRoot, "skill", "forecast-os", "VERSION"))
  : null;
const currentSkillVersion = skillArtifactVersion ?? rootVersion;
const versionSource = skillArtifactVersion
  ? join(skillRoot, "VERSION")
  : rootVersion
  ? join(discoveredRepoRoot, "VERSION")
  : null;

print({
  ok: Boolean(currentSkillVersion),
  current_skill_path: skillRoot,
  current_skill_version: currentSkillVersion,
  current_skill_version_source: versionSource,
  skill_artifact_version: skillArtifactVersion,
  repo_root: discoveredRepoRoot,
  repo_version: rootVersion,
  repo_skill_version: repoSkillVersion,
  versions_differ: versionsDiffer(currentSkillVersion, rootVersion, repoSkillVersion),
});

async function findRepoRoot(cwd, currentSkillRoot) {
  for (const candidate of unique([cwd, dirname(dirname(currentSkillRoot))])) {
    const found = await walkUpForRepoRoot(resolve(candidate));
    if (found) return found;
  }
  return null;
}

async function walkUpForRepoRoot(start) {
  let current = start;
  while (true) {
    if (
      await exists(join(current, "VERSION")) &&
      await exists(join(current, "skill", "forecast-os", "SKILL.md"))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function versionsDiffer(skillVersion, rootVersion, repoSkillVersion) {
  const known = [skillVersion, rootVersion, repoSkillVersion].filter(Boolean);
  return known.length > 1 ? new Set(known).size > 1 : null;
}

async function readVersion(path) {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
