import { createHash } from "node:crypto";
import type { DecimalString, Sha256Digest, SolanaAddress, SolanaSignature } from "./types.js";

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const base58Indexes = new Map([...base58Alphabet].map((character, index) => [character, index]));

/** Canonical native-SOL representation used by PumpSwap token accounts. */
export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112" as SolanaAddress;
export const LEGACY_SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as SolanaAddress;
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as SolanaAddress;
/** Official Pump program deployments pinned from pump-fun/pump-public-docs. */
export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" as SolanaAddress;
export const PUMP_FEES_PROGRAM_ID = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ" as SolanaAddress;
export const PUMP_AMM_PROGRAM_ID = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA" as SolanaAddress;
/** Solana Foundation rewards identity and OtterSec audited-through source baseline, reviewed 2026-08-23. */
export const SOLANA_FOUNDATION_REWARDS_PROGRAM_ID = "REWArDioXgQJ2fZKkfu9LCLjQfRwYWVVfsvcsR5hoXi" as SolanaAddress;
export const SOLANA_FOUNDATION_REWARDS_AUDITED_COMMIT = "aa1cfd9276375e44e57d1917d110ff095fb6d475";

export function decodeBase58(value: string): Uint8Array {
  if (!value) throw new TypeError("Base58 value cannot be empty");
  const bytes: number[] = [0];
  for (const character of value) {
    const digit = base58Indexes.get(character);
    if (digit === undefined) throw new TypeError(`Invalid base58 character: ${character}`);
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      const next = (bytes[index] ?? 0) * 58 + carry;
      bytes[index] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let index = 0; index < value.length - 1 && value[index] === "1"; index += 1) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

export function solanaAddress(value: unknown, field = "address"): SolanaAddress {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) {
    throw new TypeError(`${field} must be a base58 Solana address`);
  }
  let decoded: Uint8Array;
  try {
    decoded = decodeBase58(value);
  } catch {
    throw new TypeError(`${field} must be a base58 Solana address`);
  }
  if (decoded.length !== 32) {
    throw new TypeError(`${field} must decode to a 32-byte Solana address`);
  }
  return value as SolanaAddress;
}

export function solanaSignature(value: unknown, field = "signature"): SolanaSignature {
  if (typeof value !== "string") throw new TypeError(`${field} must be a base58 signature`);
  let decoded: Uint8Array;
  try {
    decoded = decodeBase58(value);
  } catch {
    throw new TypeError(`${field} must be a base58 signature`);
  }
  if (decoded.length !== 64 || decoded.every((byte) => byte === 0)) {
    throw new TypeError(`${field} must decode to a non-zero 64-byte signature`);
  }
  return value as SolanaSignature;
}

export function sha256Digest(value: unknown, field = "sha256"): Sha256Digest {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value) || /^0{64}$/.test(value)) {
    throw new TypeError(`${field} must be a non-zero lowercase SHA-256 digest`);
  }
  return value as Sha256Digest;
}

export function decimalString(value: unknown, field = "value", allowZero = true): DecimalString {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value) || (!allowZero && value === "0")) {
    throw new TypeError(`${field} must be a canonical ${allowZero ? "non-negative" : "positive"} integer string`);
  }
  return value as DecimalString;
}

export function utcTimestamp(value: unknown, field = "timestamp"): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) {
    throw new TypeError(`${field} must use YYYY-MM-DDTHH:mm:ssZ`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().replace(".000Z", "Z") !== value) {
    throw new TypeError(`${field} must be a real UTC timestamp`);
  }
  return value;
}

export function resourceUri(value: unknown, field = "uri"): string {
  if (typeof value !== "string" || value.length > 2_048) throw new TypeError(`${field} is invalid`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${field} must be HTTPS, IPFS, or Arweave`);
  }
  if (!["https:", "ipfs:", "ar:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.hash) {
    throw new TypeError(`${field} must be HTTPS, IPFS, or Arweave without credentials or a fragment`);
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  const visit = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(visit);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, visit(child)]),
      );
    }
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean" || (typeof candidate === "number" && Number.isFinite(candidate))) return candidate;
    throw new TypeError("Canonical JSON supports only finite JSON values");
  };
  return `${JSON.stringify(visit(value), null, 2)}\n`;
}

export function sha256Bytes(value: string | Uint8Array): Sha256Digest {
  return createHash("sha256").update(value).digest("hex") as Sha256Digest;
}

export function encodeBase58(value: Uint8Array): string {
  if (value.length === 0) return "";
  const digits: number[] = [0];
  for (const byte of value) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const next = (digits[index] ?? 0) * 256 + carry;
      digits[index] = next % 58;
      carry = Math.floor(next / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let output = "";
  for (let index = 0; index < value.length - 1 && value[index] === 0; index += 1) output += "1";
  for (let index = digits.length - 1; index >= 0; index -= 1) output += base58Alphabet.charAt(digits[index] ?? 0);
  return output;
}

export function u64LittleEndian(value: bigint): Uint8Array {
  if (value < 0n || value > 18_446_744_073_709_551_615n) throw new RangeError("Value exceeds u64");
  const output = new Uint8Array(8);
  let remaining = value;
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}
