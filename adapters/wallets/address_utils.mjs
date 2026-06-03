const MASK_64 = (1n << 64n) - 1n;
const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROTATION_OFFSETS = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

export function normalizeEvmChecksumAddress(value, label = "address") {
  const address = String(value ?? "").trim();
  if (/^<[^>]+>$/.test(address)) return address;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) fail(`${label} must be a 20-byte EVM address.`);
  return toEip55ChecksumAddress(address);
}

export function toEip55ChecksumAddress(address) {
  const hex = address.slice(2).toLowerCase();
  const hash = keccak256AsciiHex(hex);
  let checksummed = "0x";
  for (let index = 0; index < hex.length; index += 1) {
    const char = hex[index];
    checksummed += /[a-f]/.test(char) && Number.parseInt(hash[index], 16) >= 8
      ? char.toUpperCase()
      : char;
  }
  return checksummed;
}

function keccak256AsciiHex(value) {
  return keccak256Bytes(Array.from(Buffer.from(value, "ascii")))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function keccak256Bytes(bytes) {
  const rateBytes = 136;
  const state = Array(25).fill(0n);
  for (let offset = 0; offset < bytes.length; offset += rateBytes) {
    const block = bytes.slice(offset, offset + rateBytes);
    for (let index = 0; index < block.length; index += 1) {
      state[index >> 3] ^= BigInt(block[index]) << BigInt((index & 7) * 8);
    }
    if (block.length === rateBytes) keccakF1600(state);
  }
  const position = bytes.length % rateBytes;
  state[position >> 3] ^= 0x01n << BigInt((position & 7) * 8);
  state[(rateBytes - 1) >> 3] ^= 0x80n << BigInt(((rateBytes - 1) & 7) * 8);
  keccakF1600(state);
  const output = [];
  for (let index = 0; index < 32; index += 1) {
    output.push(Number((state[index >> 3] >> BigInt((index & 7) * 8)) & 0xffn));
  }
  return output;
}

function keccakF1600(state) {
  for (const roundConstant of ROUND_CONSTANTS) {
    const c = Array(5).fill(0n);
    const d = Array(5).fill(0n);
    for (let x = 0; x < 5; x += 1) c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    for (let x = 0; x < 5; x += 1) d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) state[x + 5 * y] = (state[x + 5 * y] ^ d[x]) & MASK_64;
    }
    const b = Array(25).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(state[x + 5 * y], ROTATION_OFFSETS[x][y]);
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] = (b[x + 5 * y] ^ ((~b[((x + 1) % 5) + 5 * y] & MASK_64) & b[((x + 2) % 5) + 5 * y])) & MASK_64;
      }
    }
    state[0] = (state[0] ^ roundConstant) & MASK_64;
  }
}

function rotl64(value, shift) {
  const amount = BigInt(shift % 64);
  if (amount === 0n) return value & MASK_64;
  return ((value << amount) | (value >> (64n - amount))) & MASK_64;
}

function fail(message) {
  throw new Error(message);
}