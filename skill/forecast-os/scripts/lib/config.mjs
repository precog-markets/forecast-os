// ForecastOS config loading, Precog URL construction, and EIP-712 template helpers.
import { PrecogApiError } from "./errors.mjs";

export async function readPrecogConfig(store, options = {}) {
  const env = options.env ?? process.env;
  const config = typeof store.getConfig === "function" ? await store.getConfig(env) : null;
  const precog = config?.precog ?? {};
  const configSource = config?.config_source ?? joinStateConfigHint(store);
  const chainId =
    options.chainId ??
    resolveWorkflowChainId(precog, options.chainHints ?? {}) ??
    requireConfigChainId(precog);
  const chainConfig = chainConfigFor(precog, chainId);
  const deployedMasterAddress = chainConfig?.deployed_master_address ?? precog.deployed_master_address;
  if (!precog.open_api_key) {
    throw new PrecogApiError(buildConfigErrorMessage("precog.open_api_key", configSource, store), {
      code: "PRECOG_CONFIG_ERROR",
      endpoint: null,
      body: { error: "Missing precog.open_api_key", config_source: configSource ?? null },
    });
  }
  if (!precog.api_root) {
    throw new PrecogApiError(buildConfigErrorMessage("precog.api_root", configSource, store), {
      code: "PRECOG_CONFIG_ERROR",
      endpoint: null,
      body: { error: "Missing precog.api_root", config_source: configSource ?? null },
    });
  }
  if (options.requireDeployedMasterAddress && !deployedMasterAddress) {
    throw new PrecogApiError(
      "Missing .forecastos/config.json precog.supported_chains[chain_id].deployed_master_address.",
      {
        code: "PRECOG_CONFIG_ERROR",
        endpoint: null,
        body: { error: "Missing chain-specific precog deployed_master_address" },
      },
    );
  }
  return {
    api_root: precog.api_root,
    open_api_key: precog.open_api_key,
    deployed_master_address: deployedMasterAddress,
    chain_id: chainId,
    default_collateral_address: chainConfig?.default_collateral_address ?? precog.default_collateral_address,
    default_collateral_symbol: chainConfig?.default_collateral_symbol ?? precog.default_collateral_symbol,
    signature_actions: requireConfigSignatureActions(precog),
  };
}

export function chainConfigFor(precog, chainId) {
  const chains = precog.supported_chains;
  if (!chains || typeof chains !== "object") return null;
  const entry = chains[String(chainId)];
  return entry && typeof entry === "object" ? entry : null;
}

export function chainHintsFrom(input = {}) {
  const event = input.event ?? {};
  const eventInput = event.input ?? {};
  return {
    chain_id:
      input.chain_id ??
      input.requested_chain_id ??
      event.chain_id ??
      eventInput.chain_id ??
      eventInput.requested_chain_id ??
      input.state?.chain_id,
    collateral_address:
      input.collateral_address ??
      event.collateral_address ??
      eventInput.collateral_address ??
      input.state?.collateral_address,
    collateral_symbol:
      input.collateral_symbol ??
      event.collateral_symbol ??
      eventInput.collateral_symbol ??
      input.state?.collateral_symbol,
  };
}

export function resolveWorkflowChainId(precog = {}, hints = {}) {
  const supported = precog.supported_chains ?? {};
  const configured = Number(precog.chain_id);
  const configuredChainId =
    Number.isInteger(configured) && configured > 0 ? configured : null;
  const candidates = [
    hints.chain_id,
    hints.state?.chain_id,
    hints.event?.chain_id,
    hints.event?.input?.chain_id,
  ].filter((value) => value !== undefined && value !== null && value !== "");

  for (const candidate of candidates) {
    const chainId = Number(candidate);
    if (Number.isInteger(chainId) && chainId > 0 && chainConfigFor(precog, chainId)) {
      return chainId;
    }
  }

  const collateralCandidates = [
    hints.collateral_address,
    hints.state?.collateral_address,
    hints.event?.collateral_address,
    hints.event?.input?.collateral_address,
  ].filter(Boolean);

  for (const address of collateralCandidates) {
    const normalized = normalizeConfigAddress(address);
    for (const option of precog.default_collateral_options ?? []) {
      if (
        normalizeConfigAddress(option.address) === normalized &&
        chainConfigFor(precog, Number(option.chain_id))
      ) {
        return Number(option.chain_id);
      }
    }
    for (const [chainKey, chainEntry] of Object.entries(supported)) {
      if (
        chainEntry &&
        typeof chainEntry === "object" &&
        normalizeConfigAddress(chainEntry.default_collateral_address) === normalized
      ) {
        return Number(chainKey);
      }
    }
  }

  return configuredChainId;
}

function joinStateConfigHint(store) {
  return store?.rootDir ? `${store.rootDir}/config.json` : ".forecastos/config.json";
}

function buildConfigErrorMessage(field, configSource, store) {
  const stateHint = store?.rootDir ? `State dir: ${store.rootDir}.` : "";
  const sourceHint = configSource
    ? `Using fallback config from ${configSource}.`
    : "Copy skill/forecast-os/.forecastos/config.json into the active skill install or set FORECASTOS_REPO_ROOT.";
  return `Missing .forecastos/config.json ${field}. ${stateHint} ${sourceHint} Do not hand-write partial config.json.`;
}

function normalizeConfigAddress(value) {
  return value ? String(value).trim().toLowerCase() : "";
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
      "Missing .forecastos/config.json precog.supported_chains[chain_id].default_collateral_address.",
      {
        code: "PRECOG_CONFIG_ERROR",
        endpoint: null,
        body: { error: "Missing chain-specific precog default_collateral_address" },
      },
    );
  }
  return config.default_collateral_address;
}

export function requireDeployedMasterAddress(config) {
  if (!config.deployed_master_address) {
    throw new PrecogApiError(
      "Missing .forecastos/config.json precog.supported_chains[chain_id].deployed_master_address.",
      {
        code: "PRECOG_CONFIG_ERROR",
        endpoint: null,
        body: { error: "Missing chain-specific precog deployed_master_address" },
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
