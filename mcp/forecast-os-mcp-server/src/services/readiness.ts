import { access } from "node:fs/promises";
import { join } from "node:path";
import {
  CHARACTER_LIMIT,
  HTTP_BODY_LIMIT_BYTES,
  HTTP_PATH,
  HTTP_PORT,
  HTTP_RATE_LIMIT_MAX,
  HTTP_RATE_LIMIT_WINDOW_MS,
  HTTP_REQUEST_TIMEOUT_MS,
  RESOURCE_ROOT,
} from "../constants.js";
import { precogConfigDefaults, readForecastOSResource } from "./skillRepository.js";

export interface ReadinessResult {
  ok: boolean;
  mcp_path: string;
  mode: "public_read_only";
  resource_root: string;
  resources_checked: string[];
}

export function validateStartupConfig(): void {
  const numericConfig = [
    ["FORECASTOS_MCP_PORT", HTTP_PORT],
    ["FORECASTOS_MCP_BODY_LIMIT_BYTES", HTTP_BODY_LIMIT_BYTES],
    ["FORECASTOS_MCP_RATE_LIMIT_MAX", HTTP_RATE_LIMIT_MAX],
    ["FORECASTOS_MCP_RATE_LIMIT_WINDOW_MS", HTTP_RATE_LIMIT_WINDOW_MS],
    ["FORECASTOS_MCP_REQUEST_TIMEOUT_MS", HTTP_REQUEST_TIMEOUT_MS],
    ["FORECASTOS_MCP_CHARACTER_LIMIT", CHARACTER_LIMIT],
  ] as const;
  for (const [name, value] of numericConfig) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive number.`);
    }
  }
  if (!HTTP_PATH.startsWith("/")) {
    throw new Error("FORECASTOS_MCP_PATH must start with '/'.");
  }
}

export async function checkReadiness(): Promise<ReadinessResult> {
  validateStartupConfig();
  await access(join(RESOURCE_ROOT, "docs", "skill.md"));
  await readForecastOSResource("forecastos://docs/skill");
  await readForecastOSResource("forecastos://docs/install");
  await readForecastOSResource("forecastos://templates/multi-outcome-market");
  await readForecastOSResource("forecastos://schemas/actions");
  await precogConfigDefaults();
  return {
    ok: true,
    mcp_path: HTTP_PATH,
    mode: "public_read_only",
    resource_root: RESOURCE_ROOT,
    resources_checked: [
      "forecastos://docs/skill",
      "forecastos://docs/install",
      "forecastos://templates/multi-outcome-market",
      "forecastos://schemas/actions",
      "forecastos://precog/config-defaults",
    ],
  };
}
