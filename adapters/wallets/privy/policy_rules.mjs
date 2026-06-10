// Canonical Privy policy rule builders for ForecastOS Base and Arbitrum chains.

export const FORECASTOS_PRIVY_CHAIN_IDS = [8453, 42161];

const CHAIN_LABELS = {
  8453: "Base",
  42161: "Arbitrum",
};

export function requireSupportedForecastOSChain(value) {
  const chainId = Number(value);
  if (chainId === 8453 || chainId === 42161) return chainId;
  throw new Error(
    `ForecastOS Privy policy helpers support Base (8453) and Arbitrum (42161), received ${value}.`,
  );
}

export function buildTypedDataAllowRule(chainId) {
  const normalized = requireSupportedForecastOSChain(chainId);
  const label = CHAIN_LABELS[normalized] ?? `chain ${normalized}`;
  return {
    name: `Allow EIP-712 typed data signing on ${label}`,
    method: "eth_signTypedData_v4",
    action: "ALLOW",
    conditions: [
      {
        field_source: "ethereum_typed_data_domain",
        field: "chainId",
        operator: "eq",
        value: String(normalized),
      },
    ],
  };
}

export function buildSendTransactionAllowRule(chainId) {
  const normalized = requireSupportedForecastOSChain(chainId);
  const label = CHAIN_LABELS[normalized] ?? `chain ${normalized}`;
  return {
    name: `Allow transactions on ${label}`,
    method: "eth_sendTransaction",
    action: "ALLOW",
    conditions: [
      {
        field_source: "ethereum_transaction",
        field: "chain_id",
        operator: "eq",
        value: String(normalized),
      },
    ],
  };
}

export function policyAllowsSendTransaction(policies = []) {
  for (const policy of policies) {
    for (const rule of policy.rules ?? []) {
      if (String(rule.action ?? "").toUpperCase() !== "ALLOW") continue;
      const method = String(rule.method ?? "");
      if (method === "eth_sendTransaction" || method === "*") return true;
    }
  }
  return false;
}

export function buildPatchCommand({ walletId, chainId, scriptPath = "adapters/wallets/privy/patch_forecastos_chain_policy.mjs" } = {}) {
  const parts = ["node", scriptPath, "--wallet-id", walletId, "--chain-id", String(chainId), "--confirm"];
  return parts.join(" ");
}

export function buildForecastOSTypedDataPolicyGuidance({
  chainId,
  allowedChainIds = [],
  walletId,
  patchScriptPath,
} = {}) {
  const target = chainId ? `chainId eq ${chainId}` : "the target chain";
  const allowed =
    allowedChainIds.length > 0
      ? `Current ALLOW rules only cover chainId: ${allowedChainIds.join(", ")}.`
      : "No chain-specific ALLOW rule matched this create intent.";
  const ruleTemplate = chainId ? buildTypedDataAllowRule(chainId) : null;
  const patchCommand =
    walletId && chainId
      ? buildPatchCommand({ walletId, chainId, scriptPath: patchScriptPath })
      : null;
  const lines = [
    `Update the selected Privy wallet policy to ALLOW eth_signTypedData_v4 with ${target}.`,
    "Privy does not support `in` for chainId; add one ALLOW rule per chain (8453 and 42161).",
    "Include eth_sendTransaction on the same policy if the wallet will fund later.",
    allowed,
  ];
  if (patchCommand) {
    lines.push(`Run: ${patchCommand}`);
  }
  if (ruleTemplate) {
    lines.push(`Rule template: ${JSON.stringify(ruleTemplate)}`);
  }
  return {
    guidance: lines.join(" "),
    rule_template: ruleTemplate,
    patch_command: patchCommand,
  };
}
