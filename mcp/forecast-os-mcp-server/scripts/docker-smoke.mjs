#!/usr/bin/env node
// Starts the ForecastOS MCP Docker image and verifies HTTP readiness endpoints.
import { spawn } from "node:child_process";

const image = process.env.FORECASTOS_MCP_IMAGE ?? "forecast-os-mcp:latest";
const port = process.env.FORECASTOS_MCP_SMOKE_PORT ?? "3001";
const name = `forecast-os-mcp-smoke-${Date.now()}`;

await run("docker", [
  "run",
  "--rm",
  "-d",
  "--name",
  name,
  "-p",
  `${port}:3001`,
  image,
]);

try {
  await waitForJson(`http://127.0.0.1:${port}/healthz`, (body) => {
    if (body.service !== "forecast-os-mcp-server") {
      throw new Error(`Unexpected health service: ${JSON.stringify(body)}`);
    }
  });
  await waitForJson(`http://127.0.0.1:${port}/readyz`, (body) => {
    if (body.mode !== "public_read_only" || body.ok !== true) {
      throw new Error(`Unexpected readiness body: ${JSON.stringify(body)}`);
    }
  });
  process.stdout.write("ForecastOS MCP Docker smoke test passed.\n");
} finally {
  await run("docker", ["stop", name], { allowFailure: true });
}

async function waitForJson(url, validate) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < 15_000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const body = await response.json();
        validate(body);
        return;
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0 || options.allowFailure) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
    child.on("error", reject);
  });
}
