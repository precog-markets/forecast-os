#!/usr/bin/env node
// Read-only Bankr Wallet API setup check for the ForecastOS Bankr skill package.

const apiRoot = String(process.env.BANKR_API_URL ?? "https://api.bankr.bot").replace(/\/+$/, "");
const apiKey = process.env.BANKR_API_KEY;

if (!apiKey) {
  process.stdout.write(JSON.stringify({ ok: false, error: "BANKR_API_KEY is not set" }, null, 2) + "\n");
  process.exit(1);
}

try {
  const response = await fetch(`${apiRoot}/wallet/me`, {
    method: "GET",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  const address = extractAddress(body);
  process.stdout.write(
    JSON.stringify(
      {
        ok: response.ok,
        status: response.status,
        wallet_api_accessible: response.ok,
        evm_address_detected: Boolean(address),
        evm_address: address,
      },
      null,
      2,
    ) + "\n",
  );
  if (!response.ok || !address) process.exit(1);
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error?.message ?? String(error) }, null, 2) + "\n");
  process.exit(1);
}

function extractAddress(body) {
  const candidates = [
    body?.address,
    body?.walletAddress,
    body?.evmAddress,
    body?.wallet?.address,
    body?.wallets?.evm?.address,
    body?.wallets?.base?.address,
    body?.data?.address,
    body?.data?.wallet?.address,
  ];
  return candidates.find((candidate) => /^0x[0-9a-fA-F]{40}$/.test(String(candidate ?? "")));
}
