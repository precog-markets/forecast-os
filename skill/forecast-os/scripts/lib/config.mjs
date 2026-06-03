// ForecastOS config loading, Precog URL construction, and EIP-712 template helpers.
import { PrecogApiError } from "./errors.mjs";

export async function readPrecogConfig(store, options = {}) {
  const config = typeof store.getConfig === "function" ? await store.getConfig() : null;
  const precog = config?.precog ?? {};
  if (!precog.open_api_key) {
    throw new PrecogApiError("Missing .forecastos/config.json precog.open_api_key.", {
      code: "PRECOG_CONFIG_ERROR",
      endpoint: null,
      body: { error: "Missing precog.open_api_key" },
    });
  }
  if (!precog.api_root) {
    throw new PrecogApiError("Missing .forecastos/config.json precog.api_root.", {
      code: "PRECOG_CONFIG_ERROR",
      endpoint: null,
      body: { error: "Missing precog.api_root" },
    });
  }
  if (options.requireDeployedMasterAddress && !precog.deployed_master_address) {
    throw new PrecogApiError(
      "Missing .forecastos/config.json precog.deployed_master_address.",
      {
        code: "PRECOG_CONFIG_ERROR",
        endpoint: null,
        body: { error: "Missing precog.deployed_master_address" },
      },
    );
  }
  return {
    api_root: precog.api_root,
    open_api_key: precog.open_api_key,
    deployed_master_address: precog.deployed_master_address,
    chain_id: requireConfigChainId(precog),
    default_collateral_address: precog.default_collateral_address,
    default_collateral_symbol: precog.default_collateral_symbol,
    signature_actions: requireConfigSignatureActions(precog),
  };
}

export function requireConfigChainId(precog) {
  const chainId = Number(precog.chain_id);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new PrecogApiError("Missing .forecastos/config.json precog.chain_id.", {
      code: "PRECOG_CONFIG_ERROR",
      endpoint: null,
      body: { error: "Missing precog.chain_id" },
    });
  }
  return chainId;
}

export function requireConfigSignatureActions(precog) {
  const actions = precog.signature_actions ?? {};
  if (!actions.create_market || !actions.fund_market) {
    throw new PrecogApiError("Missing .forecastos/config.json precog.signature_actions create_market/fund_market.", {
      code: "PRECOG_CONFIG_ERROR",
      endpoint: null,
      body: { error: "Missing precog.signature_actions.create_market or precog.signature_actions.fund_market" },
    });
  }
  return {
    create_market: actions.create_market,
    fund_market: actions.fund_market,
  };
}

export function buildPrecogAuthorizationTypedDataTemplate({ config, action, account, nonce }) {
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      PrecogMarketAuthorization: [
        { name: "action", type: "string" },
        { name: "account", type: "address" },
        { name: "chainId", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "PrecogMarketAuthorization",
    domain: {
      name: "Precog Markets",
      version: "1",
      chainId: config.chain_id,
      verifyingContract: requireDeployedMasterAddress(config),
    },
    message: {
      action,
      account,
      chainId: config.chain_id,
      nonce,
    },
  };
}

export function requireDefaultCollateralAddress(config) {
  if (!config.default_collateral_address) {
    throw new PrecogApiError(
      "Missing .forecastos/config.json precog.default_collateral_address.",
      {
        code: "PRECOG_CONFIG_ERROR",
        endpoint: null,
        body: { error: "Missing precog.default_collateral_address" },
      },
    );
  }
  return config.default_collateral_address;
}

export function requireDeployedMasterAddress(config) {
  if (!config.deployed_master_address) {
    throw new PrecogApiError(
      "Missing .forecastos/config.json precog.deployed_master_address.",
      {
        code: "PRECOG_CONFIG_ERROR",
        endpoint: null,
        body: { error: "Missing precog.deployed_master_address" },
      },
    );
  }
  return config.deployed_master_address;
}

export function mergeConfig(config, localConfig) {
  return {
    ...(config ?? {}),
    ...(localConfig ?? {}),
    precog: {
      ...(config?.precog ?? {}),
      ...(localConfig?.precog ?? {}),
    },
  };
}

export function buildPrecogUrl(root, path, params = null) {
  const url = new URL(`${root.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}
