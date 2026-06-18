#!/usr/bin/env node
// Refreshes public MCP resources from a forecast-os skill folder for maintainers.
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceSkillDir = resolve(
  process.env.FORECASTOS_SYNC_SKILL_DIR ?? process.argv[2] ?? "../../skill/forecast-os",
);
const resourceRoot = resolve(projectRoot, "resources");

const copies = [
  ["SKILL.md", "docs/skill.md"],
  ["references/architecture.md", "docs/architecture.md"],
  ["references/workflow.md", "docs/workflow.md"],
  ["references/safety.md", "docs/safety.md"],
  ["references/memory.md", "docs/memory.md"],
  ["references/mcp.md", "docs/mcp.md"],
  ["references/install.md", "docs/install.md"],
  ["references/remote-mcp.md", "docs/remote-mcp.md"],
  ["references/actions.md", "docs/actions.md"],
  ["references/action-policy.md", "docs/action-policy.md"],
  ["references/precog-liquidity.md", "docs/precog-liquidity.md"],
  ["references/precog-trading.md", "docs/precog-trading.md"],
  ["references/tool-schemas.md", "docs/tool-schemas.md"],
  ["references/wallet-adapters.md", "docs/wallet-adapters.md"],
  ["references/external-markets.md", "docs/external-markets.md"],
  ["references/providers/polymarket-read.md", "docs/providers/polymarket-read.md"],
  ["references/providers/kalshi-read.md", "docs/providers/kalshi-read.md"],
  ["assets/templates/multi-outcome-market.md", "templates/multi-outcome-market.md"],
  ["assets/schemas/actions.json", "schemas/actions.json"],
  ["references/examples/agent-launch.md", "examples/agent-launch.md"],
  ["references/examples/funding-handoff.md", "examples/funding-handoff.md"],
  ["references/examples/full-workflow.md", "examples/full-workflow.md"],
  [".forecastos/config.json", "precog/config-defaults.json"],
];

for (const [source, target] of copies) {
  const targetPath = join(resourceRoot, target);
  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(join(sourceSkillDir, source), targetPath);
}

process.stdout.write(
  `Synced ${copies.length} public ForecastOS resources from ${sourceSkillDir}.\n`,
);
