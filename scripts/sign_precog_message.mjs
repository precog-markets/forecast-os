#!/usr/bin/env node
// Generates a test Ethereum wallet and EIP-191 signatures for Precog create/fund API payloads.

import { randomBytes } from "node:crypto";

const CURVE = {
  P: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  N: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  Gx: BigInt("55066263022277343669578718895168534326250603453777594175500187360389116729240"),
  Gy: BigInt("32670510020758816978083085130507043184471273380659243275938904335757337482424"),
};

const HALF_N = CURVE.N / 2n;
const MASK_64 = (1n << 64n) - 1n;
const KECCAK_ROUNDS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const KECCAK_ROTATIONS = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];
const KECCAK_PI = [
  0, 10, 20, 5, 15,
  16, 1, 11, 21, 6,
  7, 17, 2, 12, 22,
  23, 8, 18, 3, 13,
  14, 24, 9, 19, 4,
];

function usage() {
  return `Usage:
  node scripts/sign_precog_message.mjs --chain-id 8453 --nonce 0
  node scripts/sign_precog_message.mjs --chain-id 8453 --creator-nonce 0 --funder-nonce 1
  node scripts/sign_precog_message.mjs --chain-id 8453 --nonce 0 --private-key 0x...

The signed message is:
  precog.markets|<address_lowercase>|<chain_id>|<next_pending_nonce>

Notes:
  - ForecastOS does not fetch the nonce for you.
  - Use the next_pending_nonce expected by Precog for that wallet.
  - This script is for testing; do not fund production wallets generated here.`;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2).replaceAll("-", "_");
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function assertHex(value, bytes, label) {
  const normalized = strip0x(value);
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return normalized.toLowerCase();
}

function strip0x(value) {
  return String(value).startsWith("0x") ? String(value).slice(2) : String(value);
}

function hexToBytes(hex) {
  const normalized = strip0x(hex);
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bigIntToBytes(value, length = 32) {
  let hex = value.toString(16);
  if (hex.length > length * 2) {
    throw new Error("Integer does not fit in requested byte length");
  }
  hex = hex.padStart(length * 2, "0");
  return hexToBytes(hex);
}

function bytesToBigInt(bytes) {
  return BigInt(`0x${bytesToHex(bytes)}`);
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, array) => sum + array.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const array of arrays) {
    out.set(array, offset);
    offset += array.length;
  }
  return out;
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value);
}

function mod(value, modulo = CURVE.P) {
  const result = value % modulo;
  return result >= 0n ? result : result + modulo;
}

function invert(number, modulo) {
  if (number === 0n) throw new Error("Cannot invert zero");
  let a = mod(number, modulo);
  let b = modulo;
  let x = 0n;
  let y = 1n;
  let u = 1n;
  let v = 0n;
  while (a !== 0n) {
    const q = b / a;
    const r = b % a;
    const m = x - u * q;
    const n = y - v * q;
    b = a;
    a = r;
    x = u;
    y = v;
    u = m;
    v = n;
  }
  if (b !== 1n) throw new Error("Number is not invertible");
  return mod(x, modulo);
}

function pointDouble(point) {
  if (!point) return null;
  if (point.y === 0n) return null;
  const slope = mod(3n * point.x * point.x * invert(2n * point.y, CURVE.P));
  const x = mod(slope * slope - 2n * point.x);
  const y = mod(slope * (point.x - x) - point.y);
  return { x, y };
}

function pointAdd(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.x === b.x) {
    if (mod(a.y + b.y) === 0n) return null;
    return pointDouble(a);
  }
  const slope = mod((b.y - a.y) * invert(b.x - a.x, CURVE.P));
  const x = mod(slope * slope - a.x - b.x);
  const y = mod(slope * (a.x - x) - a.y);
  return { x, y };
}

function pointMultiply(scalar, point = { x: CURVE.Gx, y: CURVE.Gy }) {
  let n = mod(scalar, CURVE.N);
  let result = null;
  let addend = point;
  while (n > 0n) {
    if (n & 1n) result = pointAdd(result, addend);
    addend = pointDouble(addend);
    n >>= 1n;
  }
  return result;
}

function randomPrivateKey() {
  while (true) {
    const candidate = bytesToBigInt(randomBytes(32));
    if (candidate > 0n && candidate < CURVE.N) return candidate;
  }
}

function parsePrivateKey(value) {
  const bytes = hexToBytes(assertHex(value, 32, "private key"));
  const key = bytesToBigInt(bytes);
  if (key <= 0n || key >= CURVE.N) {
    throw new Error("private key is outside the secp256k1 range");
  }
  return key;
}

function rotateLeft64(value, shift) {
  const amount = BigInt(shift);
  if (amount === 0n) return value & MASK_64;
  return ((value << amount) | (value >> (64n - amount))) & MASK_64;
}

function keccakF(state) {
  for (const round of KECCAK_ROUNDS) {
    const c = new Array(5).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x += 1) {
      const d = c[(x + 4) % 5] ^ rotateLeft64(c[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] = (state[x + 5 * y] ^ d) & MASK_64;
      }
    }

    const b = new Array(25).fill(0n);
    for (let i = 0; i < 25; i += 1) {
      b[KECCAK_PI[i]] = rotateLeft64(state[i], KECCAK_ROTATIONS[i]);
    }

    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        state[x + 5 * y] = (b[x + 5 * y] ^ ((~b[((x + 1) % 5) + 5 * y]) & b[((x + 2) % 5) + 5 * y])) & MASK_64;
      }
    }
    state[0] = (state[0] ^ round) & MASK_64;
  }
}

function keccak256(bytes) {
  const rate = 136;
  const state = new Array(25).fill(0n);
  const padded = Array.from(bytes);
  padded.push(0x01);
  while ((padded.length % rate) !== rate - 1) padded.push(0x00);
  padded.push(0x80);

  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate / 8; i += 1) {
      let lane = 0n;
      for (let j = 0; j < 8; j += 1) {
        lane |= BigInt(padded[offset + i * 8 + j]) << (8n * BigInt(j));
      }
      state[i] ^= lane;
    }
    keccakF(state);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i += 1) {
    const lane = state[i];
    for (let j = 0; j < 8; j += 1) {
      out[i * 8 + j] = Number((lane >> (8n * BigInt(j))) & 0xffn);
    }
  }
  return out;
}

function publicKeyFromPrivate(privateKey) {
  const point = pointMultiply(privateKey);
  if (!point) throw new Error("Failed to derive public key");
  return concatBytes(new Uint8Array([0x04]), bigIntToBytes(point.x), bigIntToBytes(point.y));
}

function checksumAddress(addressBytes) {
  const lower = bytesToHex(addressBytes);
  const hash = bytesToHex(keccak256(utf8Bytes(lower)));
  let out = "0x";
  for (let i = 0; i < lower.length; i += 1) {
    out += Number.parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

function addressFromPrivate(privateKey) {
  const publicKey = publicKeyFromPrivate(privateKey);
  const hash = keccak256(publicKey.slice(1));
  return checksumAddress(hash.slice(-20));
}

function ethereumMessageHash(message) {
  const messageBytes = utf8Bytes(message);
  const prefix = utf8Bytes(`\x19Ethereum Signed Message:\n${messageBytes.length}`);
  return keccak256(concatBytes(prefix, messageBytes));
}

function signDigest(privateKey, digest) {
  const z = bytesToBigInt(digest);
  while (true) {
    const k = randomPrivateKey();
    const rPoint = pointMultiply(k);
    if (!rPoint) continue;
    const r = mod(rPoint.x, CURVE.N);
    if (r === 0n) continue;
    let s = mod(invert(k, CURVE.N) * (z + r * privateKey), CURVE.N);
    if (s === 0n) continue;
    let recovery = Number(rPoint.y & 1n) | (rPoint.x >= CURVE.N ? 2 : 0);
    if (s > HALF_N) {
      s = CURVE.N - s;
      recovery ^= 1;
    }
    const v = 27 + recovery;
    return concatBytes(bigIntToBytes(r), bigIntToBytes(s), new Uint8Array([v]));
  }
}

function buildPrecogMessage(address, chainId, nonce) {
  return `precog.markets|${address.toLowerCase()}|${chainId}|${nonce}`;
}

function signPrecogMessage(privateKey, address, chainId, nonce) {
  const message = buildPrecogMessage(address, chainId, nonce);
  const digest = ethereumMessageHash(message);
  const signature = signDigest(privateKey, digest);
  return {
    signed_message: message,
    signature: `0x${bytesToHex(signature)}`,
  };
}

function requireValue(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${label} is required`);
  }
  return value;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const chainId = Number(requireValue(args.chain_id, "--chain-id"));
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error("--chain-id must be a positive integer");
  }

  const sharedNonce = args.nonce;
  const creatorNonce = requireValue(args.creator_nonce ?? sharedNonce, "--nonce or --creator-nonce");
  const funderNonce = args.funder_nonce ?? sharedNonce ?? creatorNonce;
  const privateKey = args.private_key ? parsePrivateKey(args.private_key) : randomPrivateKey();
  const privateKeyHex = `0x${bytesToHex(bigIntToBytes(privateKey))}`;
  const address = addressFromPrivate(privateKey);
  const create = signPrecogMessage(privateKey, address, chainId, creatorNonce);
  const fund = signPrecogMessage(privateKey, address, chainId, funderNonce);

  const result = {
    warning: "Testing helper only. Do not use generated private keys for production funds.",
    wallet: {
      address,
      private_key: privateKeyHex,
      generated: !args.private_key,
    },
    create_market_fields: {
      chain_id: chainId,
      creator_address: address,
      creator_signature: create.signature,
      signature_message: create.signed_message,
      next_pending_nonce: String(creatorNonce),
    },
    fund_market_fields: {
      chain_id: chainId,
      funder_address: address,
      funder_signature: fund.signature,
      signature_message: fund.signed_message,
      next_pending_nonce: String(funderNonce),
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    usage: usage(),
  }, null, 2));
  process.exit(1);
}
