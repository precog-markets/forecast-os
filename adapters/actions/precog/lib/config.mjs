import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { base, baseSepolia } from "viem/chains";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoConfigPath = join(moduleDir, "../../../../skill/forecast-os/.forecastos/config.json");

const BASE_MAINNET_MASTER = "0x00000000000c109080dfa976923384b97165a57a";
const BASE_SEPOLIA_MASTER = "0x61ec71F1Fd37ecc20d695E83F3D68e82bEfe8443";

export const NETWORKS = {
  sepolia: {
    chain: baseSepolia,
    address: BASE_SEPOLIA_MASTER,
    rpcs: [
      "https://sepolia.base.org",
      "https://base-sepolia-rpc.publicnode.com",
    ],
  },
  mainnet: {
    chain: base,
    address: BASE_MAINNET_MASTER,
    rpcs: [
      "https://mainnet.base.org",
      "https://base-rpc.publicnode.com",
    ],
  },
};

export async function loadMainnetMasterFromForecastOSConfig(configPath = repoConfigPath) {
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const address = config?.precog?.supported_chains?.["8453"]?.deployed_master_address;
    if (typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address)) {
      NETWORKS.mainnet.address = address;
    }
  } catch {
    // Keep bundled default when config is unavailable outside the monorepo.
  }
}

export function resolveNetworkKey(value, env = process.env) {
  const key = String(value ?? env.PRECOG_NETWORK ?? "sepolia").toLowerCase();
  if (!NETWORKS[key]) {
    throw new Error(`Unknown network "${key}". Use "sepolia" or "mainnet".`);
  }
  return key;
}

export function getNetworkConfig(networkKey) {
  const key = resolveNetworkKey(networkKey);
  return { key, ...NETWORKS[key] };
}
