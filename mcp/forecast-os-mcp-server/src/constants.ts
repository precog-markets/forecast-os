import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_NAME = "forecast-os-mcp-server";
export const SERVER_VERSION = "0.1.0";
export const CHARACTER_LIMIT = Number(process.env.FORECASTOS_MCP_CHARACTER_LIMIT ?? 25_000);
export const HTTP_PORT = Number(process.env.FORECASTOS_MCP_PORT ?? 3001);
export const HTTP_PATH = process.env.FORECASTOS_MCP_PATH ?? "/mcp";
export const HTTP_BODY_LIMIT_BYTES = Number(process.env.FORECASTOS_MCP_BODY_LIMIT_BYTES ?? 1_000_000);
export const HTTP_RATE_LIMIT_MAX = Number(process.env.FORECASTOS_MCP_RATE_LIMIT_MAX ?? 120);
export const HTTP_RATE_LIMIT_WINDOW_MS = Number(
  process.env.FORECASTOS_MCP_RATE_LIMIT_WINDOW_MS ?? 60_000,
);
export const HTTP_REQUEST_TIMEOUT_MS = Number(
  process.env.FORECASTOS_MCP_REQUEST_TIMEOUT_MS ?? 30_000,
);
export const EXTERNAL_MARKET_REQUEST_TIMEOUT_MS = Number(
  process.env.FORECASTOS_EXTERNAL_MARKET_REQUEST_TIMEOUT_MS ?? 15_000,
);
export const POLYMARKET_GAMMA_API_ROOT =
  process.env.FORECASTOS_POLYMARKET_GAMMA_API_ROOT ?? "https://gamma-api.polymarket.com";
export const POLYMARKET_CLOB_API_ROOT =
  process.env.FORECASTOS_POLYMARKET_CLOB_API_ROOT ?? "https://clob.polymarket.com";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const PROJECT_ROOT = projectRoot;
export const RESOURCE_ROOT = resolve(
  process.env.FORECASTOS_RESOURCE_DIR ?? resolve(projectRoot, "..", "resources"),
);
