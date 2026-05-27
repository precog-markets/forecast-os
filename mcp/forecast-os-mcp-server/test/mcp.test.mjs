import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const resourceRoot = process.env.FORECASTOS_RESOURCE_DIR ?? join(projectRoot, "resources");
process.env.FORECASTOS_RESOURCE_DIR = resourceRoot;

const { listForecastOSResources, precogConfigDefaults } = await import("../dist/services/skillRepository.js");
const { checkReadiness } = await import("../dist/services/readiness.js");
const { READ_ONLY_TOOL_NAMES } = await import("../dist/tools/registerTools.js");
const { truncate } = await import("../dist/services/format.js");
const { formatMarketShapeValidation, validateMarketShape } = await import("../dist/tools/marketShape.js");
const { explainNextStep, formatNextStepExplanation } = await import("../dist/tools/nextStep.js");

test("resources include remote-ready ForecastOS context", async () => {
  const uris = listForecastOSResources().map((resource) => resource.uri);

  assert.ok(uris.includes("forecastos://docs/remote-mcp"));
  assert.ok(uris.includes("forecastos://docs/install"));
  assert.ok(uris.includes("forecastos://docs/wallet-adapters"));
  assert.ok(uris.includes("forecastos://templates/multi-outcome-market"));
  assert.ok(uris.includes("forecastos://schemas/actions"));
  assert.ok(uris.includes("forecastos://examples/full-workflow"));
  assert.ok(uris.includes("forecastos://precog/capabilities"));
  assert.ok(uris.includes("forecastos://precog/config-defaults"));
});

test("config defaults redact open_api_key", async () => {
  const defaults = await precogConfigDefaults();

  assert.equal(defaults.open_api_key, "<redacted>");
  assert.equal(defaults.chain_id, 8453);
});

test("readiness verifies bundled skill resources", async () => {
  const readiness = await checkReadiness();

  assert.equal(readiness.ok, true);
  assert.equal(readiness.mode, "public_read_only");
  assert.equal(readiness.resource_root, resourceRoot);
  assert.ok(readiness.resources_checked.includes("forecastos://docs/skill"));
  assert.ok(readiness.resources_checked.includes("forecastos://docs/install"));
  assert.ok(readiness.resources_checked.includes("forecastos://precog/config-defaults"));
});

test("tool names stay read-only", async () => {
  for (const name of READ_ONLY_TOOL_NAMES) {
    assert.ok(!/(create|fund_market|draft_market|run_skill_step|wallet|sign|swap|approve)/.test(name));
  }
  assert.ok(!READ_ONLY_TOOL_NAMES.includes("forecastos_list_workflows"));
  assert.ok(!READ_ONLY_TOOL_NAMES.includes("forecastos_list_drafts"));
});

test("market shape validation rejects raw Yes/No and missing fields", () => {
  const validation = validateMarketShape({
    market_type: "multi_outcome",
    question: "Will BLG reach the Worlds final?",
    outcomes: ["Yes", "No"],
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.blocking_issues.some((issue) => issue.includes("at least three")));
  assert.ok(validation.blocking_issues.some((issue) => issue.includes("Missing source_of_truth")));
  assert.equal(validation.next_step, "needs_info");
  assert.ok(formatMarketShapeValidation(validation).includes("Ask the user for the missing details"));
});

test("next-step explanation is human guidance and read-only", async () => {
  const guidance = await explainNextStep({ step: "create_market" });

  assert.equal(guidance.read_only, true);
  assert.ok(guidance.next_step_guidance.includes("wallet/action tool"));
  assert.ok(guidance.execution_surface.includes("not MCP"));
  assert.ok(formatNextStepExplanation(guidance).includes("Current step: create_market."));
  assert.ok(!formatNextStepExplanation(guidance).includes("creator_signature"));
});

test("response truncation is explicit and actionable", () => {
  const truncated = truncate("x".repeat(30_000));
  assert.ok(truncated.length < 30_000);
  assert.ok(truncated.includes("ForecastOS MCP response truncated"));
  assert.ok(truncated.includes("Use a narrower resource/tool request"));
});

test("stdio protocol initializes and lists resources/tools", async (t) => {
  const client = spawn(process.execPath, [join(projectRoot, "dist", "stdio.js")], {
    cwd: projectRoot,
    env: { ...process.env, FORECASTOS_RESOURCE_DIR: resourceRoot },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => client.kill());
  const messages = [];
  let buffer = "";
  client.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) messages.push(JSON.parse(line));
    }
  });

  client.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "forecast-os-test", version: "0.1.0" },
      },
    })}\n`,
  );
  const init = await waitForMessage(messages, 1);
  assert.equal(init.result.serverInfo.name, "forecast-os-mcp-server");

  client.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  client.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "resources/list" })}\n`);
  const resources = await waitForMessage(messages, 2);
  assert.ok(
    resources.result.resources.some((resource) => resource.uri === "forecastos://docs/remote-mcp"),
  );

  client.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" })}\n`);
  const tools = await waitForMessage(messages, 3);
  const toolNames = tools.result.tools.map((tool) => tool.name);
  assert.ok(toolNames.includes("forecastos_validate_market_shape"));
  assert.ok(toolNames.includes("forecastos_get_config_defaults"));
  for (const tool of tools.result.tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
  }

  client.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "forecastos_validate_market_shape",
        arguments: {
          market: {
            question: "Will BLG reach the Worlds final?",
            outcomes: ["Yes", "No"],
          },
        },
      },
    })}\n`,
  );
  const validation = await waitForMessage(messages, 4);
  assert.ok(validation.result.content[0].text.includes("Market shape needs changes"));
  assert.ok(!validation.result.content[0].text.trim().startsWith("{"));

  client.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "forecastos_validate_market_shape",
        arguments: {
          response_format: "json",
          market: {
            question: "Will BLG reach the Worlds final?",
            outcomes: ["Yes", "No"],
          },
        },
      },
    })}\n`,
  );
  const jsonValidation = await waitForMessage(messages, 5);
  assert.equal(JSON.parse(jsonValidation.result.content[0].text).valid, false);

  client.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "forecastos_get_resource",
        arguments: { uri: "forecastos://missing" },
      },
    })}\n`,
  );
  const missing = await waitForMessage(messages, 6);
  const missingText = missing.error?.message ?? missing.result?.content?.[0]?.text ?? JSON.stringify(missing);
  assert.ok(missingText.includes("forecastos_list_resources"));

  client.kill();
});

test("streamable HTTP exposes health/readiness and production guards", async (t) => {
  const port = 3777 + Math.floor(Math.random() * 1000);
  const client = spawn(process.execPath, [join(projectRoot, "dist", "http.js")], {
    cwd: projectRoot,
    env: {
      ...process.env,
      FORECASTOS_RESOURCE_DIR: resourceRoot,
      FORECASTOS_MCP_PORT: String(port),
      FORECASTOS_MCP_RATE_LIMIT_MAX: "1",
      FORECASTOS_MCP_BODY_LIMIT_BYTES: "20",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  t.after(() => client.kill());
  await waitForHttp(`http://127.0.0.1:${port}/healthz`);

  const health = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, "forecast-os-mcp-server");
  const healthAlias = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(healthAlias.status, 200);

  const ready = await fetch(`http://127.0.0.1:${port}/readyz`);
  assert.equal(ready.status, 200);
  assert.equal(ready.headers.get("x-content-type-options"), "nosniff");
  const readyBody = await ready.json();
  assert.equal(readyBody.mode, "public_read_only");
  assert.ok(readyBody.resources_checked.includes("forecastos://schemas/actions"));
  const readyAlias = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(readyAlias.status, 200);

  const missing = await fetch(`http://127.0.0.1:${port}/not-mcp`);
  assert.equal(missing.status, 404);
  assert.ok((await missing.json()).next_step.includes("/mcp"));

  const tooLarge = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(50) }),
  });
  assert.equal(tooLarge.status, 413);
  assert.ok((await tooLarge.json()).next_step.includes("smaller MCP request"));

  const first = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.notEqual(first.status, 429);
  const second = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(second.status, 429);
  assert.ok((await second.json()).next_step.includes("Retry"));

  client.kill();
  await once(client, "exit");
});

test("Docker packaging uses MCP-owned resources and keeps runtime HTTP-only", async () => {
  const dockerfile = await readFile(join(projectRoot, "Dockerfile"), "utf8");
  const dockerignore = await readFile(join(projectRoot, ".dockerignore"), "utf8");
  const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));

  assert.ok(dockerfile.includes("FROM node:22-alpine AS deps"));
  assert.ok(dockerfile.includes("COPY package*.json ./"));
  assert.ok(dockerfile.includes("COPY resources ./resources"));
  assert.ok(dockerfile.includes("ENV FORECASTOS_RESOURCE_DIR=/app/mcp/resources"));
  assert.ok(!dockerfile.includes("COPY forecast-os"));
  assert.ok(!dockerfile.includes("FORECASTOS_SKILL_DIR"));
  assert.ok(dockerfile.includes('CMD ["node", "dist/http.js"]'));
  assert.ok(dockerfile.includes("USER node"));
  assert.ok(dockerignore.includes("**/.forecastos/config.local.json"));
  assert.ok(dockerignore.includes("dist"));
  assert.ok(packageJson.scripts["docker:build"].includes("docker build"));
  assert.ok(packageJson.scripts["docker:build"].includes("."));
  assert.ok(!packageJson.scripts["docker:build"].includes("../.."));
  assert.ok(packageJson.scripts["docker:smoke"].includes("scripts/docker-smoke.mjs"));
  assert.ok(packageJson.scripts["sync:resources"].includes("scripts/sync-resources.mjs"));
  assert.ok(packageJson.scripts.check.includes("typecheck"));
});

test("runtime does not depend on bundled or parent forecast-os folder", async () => {
  const constants = await readFile(join(projectRoot, "src", "constants.ts"), "utf8");
  const repository = await readFile(join(projectRoot, "src", "services", "skillRepository.ts"), "utf8");
  const nextStep = await readFile(join(projectRoot, "src", "tools", "nextStep.ts"), "utf8");

  assert.ok(!constants.includes("FORECASTOS_SKILL_DIR"));
  assert.ok(!constants.includes("..\", \"..\", \"forecast-os\""));
  assert.ok(!repository.includes(".forecastos"));
  assert.ok(!repository.includes("readSavedWorkflows"));
  assert.ok(!nextStep.includes("readSavedWorkflows"));
});

test("MCP resources are owned by this project", async () => {
  const skillDoc = await readFile(join(projectRoot, "resources", "docs", "skill.md"), "utf8");
  const schema = JSON.parse(await readFile(join(projectRoot, "resources", "schemas", "actions.json"), "utf8"));
  const defaults = JSON.parse(
    await readFile(join(projectRoot, "resources", "precog", "config-defaults.json"), "utf8"),
  );

  assert.ok(skillDoc.includes("name: forecast-os"));
  assert.ok(schema.title || schema.$schema || schema.definitions);
  assert.ok(defaults.precog.open_api_key);
});

async function waitForMessage(messages, id) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    const found = messages.find((message) => message.id === id);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for MCP message id ${id}. Received: ${JSON.stringify(messages)}`);
}

async function waitForHttp(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Timed out waiting for HTTP server at ${url}`);
}
