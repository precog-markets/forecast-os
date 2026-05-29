#!/usr/bin/env node
// Prints a read-only summary of ForecastOS drafts and workflows from the local state directory.
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillRoot = dirname(scriptDir);
const defaultStateDir = join(skillRoot, ".forecastos");
const stateDir = process.env.FORECASTOS_STATE_DIR ?? argValue("--state-dir") ?? process.argv[2] ?? defaultStateDir;
const statuses = [
  "all",
  "needs_info",
  "await_approval",
  "create_market",
  "await_precog_approval",
  "rejected",
  "funded",
  "consume_prediction",
  "done",
];

const output = {
  state_dir: stateDir,
  drafts: await readJsonDir(join(stateDir, "drafts")),
  workflows: {},
};

for (const status of statuses) {
  output.workflows[status] = await readJsonDir(join(stateDir, "workflows", status));
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

async function readJsonDir(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => join(path, entry.name));
    return Promise.all(files.map(readJson));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
