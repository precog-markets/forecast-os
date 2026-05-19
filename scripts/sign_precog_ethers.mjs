#!/usr/bin/env node
// Signs the exact Precog EIP-191 message with ethers and verifies the recovered signer address.

let ethers;
try {
  ethers = await import("ethers");
} catch {
  console.error(
    JSON.stringify(
      {
        error: "Missing optional dependency: ethers",
        install: "npm install ethers",
        usage: usage(),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const { JsonRpcProvider, Wallet, verifyMessage, getAddress } = ethers;
const args = parseArgs(process.argv);

if (args.help) {
  console.log(usage());
  process.exit(0);
}

const chainId = requireValue(args.chain_id, "--chain-id");
const privateKey = requireValue(args.private_key, "--private-key");
const expectedAddress = args.address ?? args.creator_address;
const wallet = new Wallet(privateKey);
const address = getAddress(wallet.address);
const payloadCreatorAddress = expectedAddress ?? address;

if (expectedAddress && getAddress(expectedAddress) !== address) {
  fail(
    `Private key derives ${address}, not expected creator address ${getAddress(expectedAddress)}.`,
  );
}

const nonce = await resolveNonce(args, address);
const message = `precog.markets|${payloadCreatorAddress.toLowerCase()}|${chainId}|${nonce}`;
const signature = await wallet.signMessage(message);
const recovered = getAddress(verifyMessage(message, signature));

if (recovered !== address) {
  fail(`Signature verification failed. Recovered ${recovered}, expected ${address}.`);
}

console.log(
  JSON.stringify(
    {
      creator_address: payloadCreatorAddress,
      creator_signature: signature,
      signature_message: message,
      chain_id: Number(chainId),
      next_pending_nonce: String(nonce),
      wallet_address: address,
      recovered_address: recovered,
      verified: true,
      notes: [
        "Send creator_address using the same casing stored in tracker allowed_creators.",
        "Tracker lowercases the address only inside the signed message.",
        "If --rpc-url was used, next_pending_nonce came from eth_getTransactionCount(address, 'pending').",
      ],
    },
    null,
    2,
  ),
);

function parseArgs(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      result.help = true;
      continue;
    }
    if (!token.startsWith("--")) fail(`Unexpected argument: ${token}`);
    const key = token.slice(2).replaceAll("-", "_");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for ${token}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

async function resolveNonce(parsedArgs, address) {
  const explicitNonce = parsedArgs.nonce ?? parsedArgs.creator_nonce;
  if (explicitNonce !== undefined) return explicitNonce;
  if (!parsedArgs.rpc_url) {
    fail("--nonce is required unless --rpc-url is provided.");
  }
  const provider = new JsonRpcProvider(parsedArgs.rpc_url, Number(chainId));
  return provider.getTransactionCount(address, "pending");
}

function requireValue(value, label) {
  if (value === undefined || value === null || value === "") {
    fail(`${label} is required.`);
  }
  return value;
}

function fail(message) {
  console.error(JSON.stringify({ error: message, usage: usage() }, null, 2));
  process.exit(1);
}

function usage() {
  return `Usage:
  node scripts/sign_precog_ethers.mjs --chain-id 8453 --nonce 0 --private-key 0x...
  node scripts/sign_precog_ethers.mjs --chain-id 8453 --nonce 0 --creator-address 0x... --private-key 0x...
  node scripts/sign_precog_ethers.mjs --chain-id 8453 --rpc-url https://... --creator-address 0x... --private-key 0x...

This signs:
  precog.markets|<creator_address_lowercase>|<chain_id>|<next_pending_nonce>

If --rpc-url is provided and --nonce is omitted, the script fetches the pending
transaction nonce with eth_getTransactionCount(address, "pending"), matching the
tracker's get_next_pending_nonce(address) flow.

creator_address is case-sensitive for tracker allowed_creators before signature
verification. Send the same casing that tracker has allowlisted.

Install once if needed:
  npm install ethers`;
}
