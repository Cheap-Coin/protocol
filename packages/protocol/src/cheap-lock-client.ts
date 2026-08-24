import { Buffer } from "node:buffer";
import { address, getAddressEncoder, getProgramDerivedAddress, type Address } from "@solana/kit";
import { sha256Bytes, solanaAddress, u64LittleEndian } from "./solana.js";
import type { InstructionAccount, UnsignedInstruction } from "./campaign.js";
import type { LockTier, SolanaAddress } from "./types.js";

/**
 * Hand-maintained Kit-native predeployment client. CI compares its implemented
 * instructions byte-for-byte with the generated Anchor IDL and reviewed SBF;
 * it is intentionally not represented as generated code.
 */

export const CHEAP_LOCK_DEVELOPMENT_PROGRAM_ID = solanaAddress("E3TBZmfvWDuV6g4bAVR62bVoV9AJ3Y6utDKJsVEgxaLu");
export const CHEAP_LOCK_CONFIG_SEED = "config";
export const CHEAP_LOCK_POSITION_SEED = "position";
export const CHEAP_LOCK_VAULT_SEED = "vault";

const encoder = getAddressEncoder();
const utf8 = new TextEncoder();

async function derive(programAddress: SolanaAddress, seeds: Uint8Array[]): Promise<SolanaAddress> {
  const [derivedAddress] = await getProgramDerivedAddress({
    programAddress: address(programAddress) as Address,
    seeds,
  });
  return solanaAddress(derivedAddress);
}

function discriminator(name: string): Uint8Array {
  return Buffer.from(sha256Bytes(`global:${name}`), "hex").subarray(0, 8);
}

function instruction(programAddress: SolanaAddress, name: string, accounts: InstructionAccount[], argumentsData = new Uint8Array()): UnsignedInstruction {
  return {
    programAddress,
    accounts,
    dataBase64: Buffer.concat([discriminator(name), argumentsData]).toString("base64"),
    description: `cheap-lock:${name}`,
  };
}

export async function deriveCheapLockAddresses(
  programAddress: SolanaAddress,
  owner: SolanaAddress,
  depositId: bigint,
): Promise<{ config: SolanaAddress; position: SolanaAddress; vault: SolanaAddress }> {
  const checkedProgram = solanaAddress(programAddress, "programAddress");
  const checkedOwner = solanaAddress(owner, "owner");
  const config = await derive(checkedProgram, [utf8.encode(CHEAP_LOCK_CONFIG_SEED)]);
  const position = await derive(checkedProgram, [
    utf8.encode(CHEAP_LOCK_POSITION_SEED),
    new Uint8Array(encoder.encode(address(checkedOwner))),
    u64LittleEndian(depositId),
  ]);
  const vault = await derive(checkedProgram, [utf8.encode(CHEAP_LOCK_VAULT_SEED), new Uint8Array(encoder.encode(address(position)))]);
  return { config, position, vault };
}

export async function buildOpenPositionInstruction(input: {
  programAddress: SolanaAddress;
  owner: SolanaAddress;
  cheapMint: SolanaAddress;
  sourceTokenAccount: SolanaAddress;
  tokenProgram: SolanaAddress;
  depositId: bigint;
  amount: bigint;
  tier: LockTier;
}): Promise<UnsignedInstruction> {
  if (input.amount <= 0n) throw new RangeError("Lock amount must be positive");
  const owner = solanaAddress(input.owner, "owner");
  const programAddress = solanaAddress(input.programAddress, "programAddress");
  const { config, position, vault } = await deriveCheapLockAddresses(programAddress, owner, input.depositId);
  const data = new Uint8Array(17);
  data.set(u64LittleEndian(input.depositId), 0);
  data.set(u64LittleEndian(input.amount), 8);
  data[16] = input.tier === "THIRTY_DAYS" ? 0 : input.tier === "NINETY_DAYS" ? 1 : 255;
  if (data[16] === 255) throw new TypeError("Unsupported lock tier");
  return instruction(programAddress, "open_position", [
    { address: owner, role: "writableSigner" },
    { address: config, role: "readonly" },
    { address: solanaAddress(input.cheapMint, "cheapMint"), role: "readonly" },
    { address: solanaAddress(input.sourceTokenAccount, "sourceTokenAccount"), role: "writable" },
    { address: position, role: "writable" },
    { address: vault, role: "writable" },
    { address: solanaAddress(input.tokenProgram, "tokenProgram"), role: "readonly" },
    { address: solanaAddress("11111111111111111111111111111111"), role: "readonly" },
  ], data);
}

export async function buildWithdrawPositionInstruction(input: {
  programAddress: SolanaAddress;
  owner: SolanaAddress;
  cheapMint: SolanaAddress;
  destinationTokenAccount: SolanaAddress;
  tokenProgram: SolanaAddress;
  depositId: bigint;
}): Promise<UnsignedInstruction> {
  const owner = solanaAddress(input.owner, "owner");
  const programAddress = solanaAddress(input.programAddress, "programAddress");
  const { config, position, vault } = await deriveCheapLockAddresses(programAddress, owner, input.depositId);
  return instruction(programAddress, "withdraw_position", [
    { address: owner, role: "writableSigner" },
    { address: config, role: "readonly" },
    { address: solanaAddress(input.cheapMint, "cheapMint"), role: "readonly" },
    { address: position, role: "writable" },
    { address: vault, role: "writable" },
    { address: solanaAddress(input.destinationTokenAccount, "destinationTokenAccount"), role: "writable" },
    { address: solanaAddress(input.tokenProgram, "tokenProgram"), role: "readonly" },
  ]);
}
