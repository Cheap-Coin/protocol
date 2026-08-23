import { address, getAddressEncoder, getProgramDerivedAddress, type Address } from "@solana/kit";
import { encodeBase58, PUMP_AMM_PROGRAM_ID, solanaAddress } from "./solana.js";
import type { SolanaAddress } from "./types.js";

export const PUMP_SWAP_POOL_DISCRIMINATOR = Uint8Array.from([241, 154, 109, 4, 17, 177, 109, 188]);
export const PUMP_SHARING_CONFIG_DISCRIMINATOR = Uint8Array.from([216, 74, 9, 0, 56, 140, 93, 75]);

export interface PumpSwapPoolAccount {
  bump: number;
  index: number;
  creator: SolanaAddress;
  baseMint: SolanaAddress;
  quoteMint: SolanaAddress;
  lpMint: SolanaAddress;
}

export interface PumpSharingConfigAccount {
  bump: number;
  version: number;
  status: "PAUSED" | "ACTIVE";
  mint: SolanaAddress;
  admin: SolanaAddress;
  adminRevoked: boolean;
  shareholders: Array<{ address: SolanaAddress; shareBps: number }>;
}

const utf8 = new TextEncoder();
const addressEncoder = getAddressEncoder();

function assertDiscriminator(data: Uint8Array, expected: Uint8Array, account: string): void {
  if (data.length < expected.length || expected.some((byte, index) => data[index] !== byte)) {
    throw new TypeError(`${account} discriminator does not match the pinned Pump IDL`);
  }
}

function publicKeyAt(data: Uint8Array, offset: number, account: string): SolanaAddress {
  if (data.length < offset + 32) throw new TypeError(`${account} data is truncated`);
  return solanaAddress(encodeBase58(data.slice(offset, offset + 32)), account);
}

export function decodePumpSwapPoolAccount(data: Uint8Array): PumpSwapPoolAccount {
  assertDiscriminator(data, PUMP_SWAP_POOL_DISCRIMINATOR, "PumpSwap pool");
  if (data.length < 139) throw new TypeError("PumpSwap pool data is truncated");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    bump: data[8] ?? 0,
    index: view.getUint16(9, true),
    creator: publicKeyAt(data, 11, "PumpSwap pool creator"),
    baseMint: publicKeyAt(data, 43, "PumpSwap pool base mint"),
    quoteMint: publicKeyAt(data, 75, "PumpSwap pool quote mint"),
    lpMint: publicKeyAt(data, 107, "PumpSwap pool LP mint"),
  };
}

export function decodePumpSharingConfigAccount(data: Uint8Array): PumpSharingConfigAccount {
  assertDiscriminator(data, PUMP_SHARING_CONFIG_DISCRIMINATOR, "Pump sharing config");
  if (data.length < 80) throw new TypeError("Pump sharing config data is truncated");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const status = data[10];
  if (status !== 0 && status !== 1) throw new TypeError("Pump sharing config status is invalid");
  const revoked = data[75];
  if (revoked !== 0 && revoked !== 1) throw new TypeError("Pump sharing config admin flag is invalid");
  const shareholderCount = view.getUint32(76, true);
  if (shareholderCount > 10) throw new TypeError("Pump sharing config exceeds the documented ten-recipient limit");
  if (data.length < 80 + shareholderCount * 34) throw new TypeError("Pump sharing config shareholder data is truncated");
  const shareholders = Array.from({ length: shareholderCount }, (_, index) => {
    const offset = 80 + index * 34;
    return {
      address: publicKeyAt(data, offset, `Pump shareholder ${index}`),
      shareBps: view.getUint16(offset + 32, true),
    };
  });
  return {
    bump: data[8] ?? 0,
    version: data[9] ?? 0,
    status: status === 1 ? "ACTIVE" : "PAUSED",
    mint: publicKeyAt(data, 11, "Pump sharing config mint"),
    admin: publicKeyAt(data, 43, "Pump sharing config admin"),
    adminRevoked: revoked === 1,
    shareholders,
  };
}

export async function derivePumpSwapPoolAddresses(input: {
  index: number;
  creator: SolanaAddress;
  baseMint: SolanaAddress;
  quoteMint: SolanaAddress;
}): Promise<{ pool: SolanaAddress; poolBump: number; lpMint: SolanaAddress }> {
  if (!Number.isInteger(input.index) || input.index < 0 || input.index > 65_535) {
    throw new TypeError("PumpSwap pool index must fit in a u16");
  }
  const index = Uint8Array.from([input.index & 0xff, input.index >> 8]);
  const creator = solanaAddress(input.creator, "creator");
  const baseMint = solanaAddress(input.baseMint, "baseMint");
  const quoteMint = solanaAddress(input.quoteMint, "quoteMint");
  const [pool, poolBump] = await getProgramDerivedAddress({
    programAddress: address(PUMP_AMM_PROGRAM_ID) as Address,
    seeds: [
      utf8.encode("pool"),
      index,
      new Uint8Array(addressEncoder.encode(address(creator))),
      new Uint8Array(addressEncoder.encode(address(baseMint))),
      new Uint8Array(addressEncoder.encode(address(quoteMint))),
    ],
  });
  const poolAddress = solanaAddress(pool, "pool");
  const [lpMint] = await getProgramDerivedAddress({
    programAddress: address(PUMP_AMM_PROGRAM_ID) as Address,
    seeds: [utf8.encode("pool_lp_mint"), new Uint8Array(addressEncoder.encode(address(poolAddress)))],
  });
  return { pool: poolAddress, poolBump, lpMint: solanaAddress(lpMint, "lpMint") };
}
