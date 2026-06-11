import { readFile } from "node:fs/promises";

let cachedPrivateKey;

export async function resolvePrivateKey({
  privateKey,
  privateKeyEnv = "PRIVATE_KEY",
  envFile,
  env = process.env,
} = {}) {
  if (cachedPrivateKey) return cachedPrivateKey;
  if (privateKey) {
    cachedPrivateKey = normalizePrivateKey(privateKey);
    return cachedPrivateKey;
  }
  if (env[privateKeyEnv]) {
    cachedPrivateKey = normalizePrivateKey(env[privateKeyEnv]);
    return cachedPrivateKey;
  }
  if (envFile) {
    const fileValues = await readDotEnv(envFile);
    if (fileValues[privateKeyEnv]) {
      cachedPrivateKey = normalizePrivateKey(fileValues[privateKeyEnv]);
      return cachedPrivateKey;
    }
  }
  throw new Error(
    "No wallet private key found. Set PRIVATE_KEY in the environment or pass --env-file <path>.",
  );
}

export function clearPrivateKeyCache() {
  cachedPrivateKey = undefined;
}

export function assertNoSecretInOutput(value, label = "output") {
  const text = JSON.stringify(value ?? {});
  if (/private[_-]?key/i.test(text) || /0x[0-9a-fA-F]{64}/.test(text)) {
    const key = cachedPrivateKey ?? "";
    if (key && text.includes(key.replace(/^0x/, ""))) {
      throw new Error(`${label} must not include private key material.`);
    }
  }
}

function normalizePrivateKey(value) {
  const raw = String(value ?? "").trim();
  const prefixed = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(prefixed)) {
    throw new Error("Private key must be a 32-byte hex string.");
  }
  return prefixed;
}

async function readDotEnv(path) {
  const text = await readFile(path, "utf8");
  const values = {};
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}
