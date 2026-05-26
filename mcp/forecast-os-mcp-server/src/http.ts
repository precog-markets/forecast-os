#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  HTTP_BODY_LIMIT_BYTES,
  HTTP_PATH,
  HTTP_PORT,
  HTTP_RATE_LIMIT_MAX,
  HTTP_RATE_LIMIT_WINDOW_MS,
  HTTP_REQUEST_TIMEOUT_MS,
  SERVER_NAME,
  SERVER_VERSION,
} from "./constants.js";
import { createForecastOSMcpServer } from "./index.js";
import { checkReadiness, validateStartupConfig } from "./services/readiness.js";

type RateEntry = { count: number; resetAt: number };

export async function createForecastOSHttpHandler() {
  validateStartupConfig();
  const server = createForecastOSMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const rateLimit = new Map<string, RateEntry>();
  await server.connect(transport);

  return async function forecastOSHttpHandler(req: IncomingMessage, res: ServerResponse) {
    const startedAt = Date.now();
    const url = req.url ?? "/";
    const requestId = req.headers["x-request-id"]?.toString() ?? `${startedAt}-${Math.random().toString(16).slice(2)}`;

    try {
      if (url === "/healthz" || url === "/health") {
        sendJson(res, 200, { ok: true, service: SERVER_NAME, version: SERVER_VERSION });
        logRequest({ requestId, url, status: 200, startedAt });
        return;
      }

      if (url === "/readyz" || url === "/ready") {
        sendJson(res, 200, await checkReadiness());
        logRequest({ requestId, url, status: 200, startedAt });
        return;
      }

      if (!url.startsWith(HTTP_PATH)) {
        sendJson(res, 404, {
          error: "Not found",
          next_step: `Send MCP requests to ${HTTP_PATH}, or use /healthz and /readyz for service checks.`,
          mcp_path: HTTP_PATH,
        });
        logRequest({ requestId, url, status: 404, startedAt });
        return;
      }

      const contentLength = Number(req.headers["content-length"] ?? 0);
      if (Number.isFinite(contentLength) && contentLength > HTTP_BODY_LIMIT_BYTES) {
        sendJson(res, 413, {
          error: "Request body too large",
          next_step: `Send a smaller MCP request. Limit is ${HTTP_BODY_LIMIT_BYTES} bytes.`,
          limit_bytes: HTTP_BODY_LIMIT_BYTES,
        });
        logRequest({ requestId, url, status: 413, startedAt });
        return;
      }

      const rate = checkRateLimit(clientKey(req), rateLimit);
      if (!rate.allowed) {
        sendJson(res, 429, {
          error: "Rate limit exceeded",
          next_step: "Retry after the current rate-limit window or reduce request frequency.",
          retry_after_ms: rate.retryAfterMs,
        });
        logRequest({ requestId, url, status: 429, startedAt });
        return;
      }

      req.setTimeout(HTTP_REQUEST_TIMEOUT_MS, () => {
        if (!res.headersSent) {
          sendJson(res, 408, {
            error: "Request timed out",
            next_step: "Retry with a smaller or simpler MCP request.",
            timeout_ms: HTTP_REQUEST_TIMEOUT_MS,
          });
        }
        req.destroy();
      });

      await transport.handleRequest(req, res);
      logRequest({ requestId, url, status: res.statusCode, startedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: message,
          next_step: "Retry the MCP request. If it fails again, check server logs and the requested tool/resource name.",
        });
      } else {
        res.end();
      }
      logRequest({ requestId, url, status: res.statusCode || 500, startedAt, error: message });
    }
  };
}

function checkRateLimit(
  key: string,
  entries: Map<string, RateEntry>,
): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const existing = entries.get(key);
  if (!existing || existing.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + HTTP_RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  if (existing.count >= HTTP_RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterMs: existing.resetAt - now };
  }
  existing.count += 1;
  return { allowed: true };
}

function clientKey(req: IncomingMessage): string {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  res.end(JSON.stringify(body));
}

function logRequest(input: {
  requestId: string;
  url: string;
  status: number;
  startedAt: number;
  error?: string;
}) {
  process.stderr.write(
    `${JSON.stringify({
      level: input.status >= 500 ? "error" : "info",
      service: SERVER_NAME,
      request_id: input.requestId,
      url: input.url,
      status: input.status,
      duration_ms: Date.now() - input.startedAt,
      error: input.error,
    })}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateStartupConfig();
  const httpServer = createServer(await createForecastOSHttpHandler());
  const shutdown = (signal: NodeJS.Signals) => {
    process.stderr.write(
      `${JSON.stringify({
        level: "info",
        service: SERVER_NAME,
        event: "shutdown",
        signal,
      })}\n`,
    );
    httpServer.close((error) => {
      if (error) {
        process.stderr.write(
          `${JSON.stringify({
            level: "error",
            service: SERVER_NAME,
            event: "shutdown_error",
            error: error.message,
          })}\n`,
        );
        process.exit(1);
      }
      process.exit(0);
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  httpServer.listen(HTTP_PORT, () => {
    process.stderr.write(
      `ForecastOS MCP HTTP server listening on http://localhost:${HTTP_PORT}${HTTP_PATH}\n`,
    );
  });
}
