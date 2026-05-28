#!/usr/bin/env node
// Generates the portable skill VERSION from the repo root VERSION for fixed-copy installs.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(skillRoot));
const repoVersionPath = join(repoRoot, "VERSION");
const skillVersionPath = join(skillRoot, "VERSION");
const repoVersion = (await readFile(repoVersionPath, "utf8")).trim();

if (!/^\d+\.\d+\.\d+$/.test(repoVersion)) {
  fail(`Repo VERSION must contain semver like 0.1.0: ${repoVersionPath}`);
}

await writeFile(skillVersionPath, `${repoVersion}\n`);
process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      repo_version: repoVersion,
      skill_version_path: skillVersionPath,
    },
    null,
    2,
  )}\n`,
);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
