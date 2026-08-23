import { describe, expect, it } from "vitest";
import {
  buildCampaign,
  buildOpenPositionInstruction,
  buildPumpFeeShareRehearsal,
  buildWithdrawPositionInstruction,
  decodeBase58,
  decodePumpSharingConfigAccount,
  decodePumpSwapPoolAccount,
  deriveCheapLockAddresses,
  derivePumpSwapPoolAddresses,
  decimalString,
  encodeBase58,
  launchCapabilities,
  launchManifestArtifactHash,
  parseLaunchManifestJson,
  PUMP_AMM_PROGRAM_ID,
  PUMP_FEES_PROGRAM_ID,
  PUMP_PROGRAM_ID,
  PUMP_SHARING_CONFIG_DISCRIMINATOR,
  PUMP_SWAP_POOL_DISCRIMINATOR,
  resourceUri,
  sha256Bytes,
  SOLANA_FOUNDATION_REWARDS_AUDITED_COMMIT,
  SOLANA_FOUNDATION_REWARDS_PROGRAM_ID,
  solanaAddress,
  solanaSignature,
  WRAPPED_SOL_MINT,
  type LaunchManifest,
} from "../src/index.js";

const system = solanaAddress("11111111111111111111111111111111");
const mint = solanaAddress(encodeBase58(Uint8Array.from({ length: 32 }, (_, index) => index + 1)));
const tokenProgram = solanaAddress("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const owner = solanaAddress("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV");
const community = solanaAddress("7VtfL8fvgNfhz17qKRMjzQEXgbdpnHHHQRh54R9jP2RJ");
const multisig = solanaAddress("7hTckgnGnLQR6sdH7YkqFTAA7VwTfYFaZ6EhEsU3saCX");
const pump = PUMP_PROGRAM_ID;
const pumpFees = PUMP_FEES_PROGRAM_ID;
const pumpAmm = PUMP_AMM_PROGRAM_ID;
const program = solanaAddress("E3TBZmfvWDuV6g4bAVR62bVoV9AJ3Y6utDKJsVEgxaLu");
const signature = solanaSignature(encodeBase58(Uint8Array.from({ length: 64 }, (_, index) => index + 1)));

function manifest(state: LaunchManifest["lifecycle"]["state"]): LaunchManifest {
  const launched = state !== "PRELAUNCH";
  const result: LaunchManifest = {
    schemaVersion: 1,
    launchId: "cheap-solana-v1",
    lifecycle: { state, updatedAt: "2026-08-23T12:00:00Z" },
    cluster: "mainnet-beta",
    token: { name: "CheapCoin", symbol: "CHEAP", mint: launched ? mint : null, tokenProgram: launched ? tokenProgram : null, decimals: launched ? 6 : null },
    pump: {
      programId: pump,
      feesProgramId: pumpFees,
      ammProgramId: pumpAmm,
      global: launched ? owner : null,
      bondingCurve: launched ? community : null,
      sharingConfig: launched ? multisig : null,
      feeSharing: { ownerTreasuryVault: owner, communityTreasuryVault: community, ownerShareBps: 7_500, communityShareBps: 2_500, finalizedSignature: launched ? signature : null },
    },
    canonicalPool: state === "PUMPSWAP"
      ? { address: multisig, lpMint: owner, quoteMint: WRAPPED_SOL_MINT, verifiedAtSlot: decimalString("123456"), verificationSignature: signature }
      : null,
    governance: { squadsMultisig: multisig, ownerTreasuryVault: owner, communityTreasuryVault: community, threshold: 2, signerCount: 3 },
    programs: { cheapLock: launched ? program : null, rewards: null },
    verification: { slot: launched ? decimalString("123456") : null, blockhash: launched ? pumpFees : null },
    publication: {
      sourceRepository: "https://github.com/Cheap-Coin/protocol",
      sourceCommit: "a".repeat(40),
      signedTag: launched ? "launch/cheap-solana-v1/v1" : null,
      manifestPath: "deployments/cheap-solana-v1.manifest.json",
      artifactSha256: null,
    },
  };
  if (launched) result.publication.artifactSha256 = launchManifestArtifactHash(result);
  return result;
}

describe("Solana primitives", () => {
  it("accepts the system program and rejects malformed addresses and signatures", () => {
    expect(solanaAddress(system)).toBe(system);
    expect(() => solanaAddress("0x1234")).toThrow(/Solana address/);
    expect(() => solanaSignature(owner)).toThrow(/64-byte/);
  });

  it("rejects credential-bearing or fragmented public resource URIs", () => {
    expect(resourceUri("ipfs://bafybeigdyrzt5example/rules.json")).toBe("ipfs://bafybeigdyrzt5example/rules.json");
    expect(() => resourceUri("ipfs://user:secret@bafybeigdyrzt5example/rules.json")).toThrow(/credentials/);
    expect(() => resourceUri("ar://transaction-id#uncommitted-view")).toThrow(/fragment/);
  });
});

describe("launch manifest", () => {
  it.each(["PRELAUNCH", "BONDING_CURVE", "PUMPSWAP"] as const)("validates %s state", (state) => {
    const parsed = parseLaunchManifestJson(JSON.stringify(manifest(state)));
    expect(parsed.manifest.lifecycle.state).toBe(state);
  });

  it("keeps all CHEAP-only actions disabled in prelaunch", () => {
    expect(launchCapabilities(manifest("PRELAUNCH"))).toEqual({
      publicResearch: true,
      walletData: false,
      lockDeposits: false,
      lockWithdrawals: false,
      liquidityDeposits: false,
      liquidityWithdrawals: false,
      campaignClaims: false,
    });
  });

  it("rejects an invented canonical pool before graduation", () => {
    const candidate = manifest("BONDING_CURVE");
    candidate.canonicalPool = manifest("PUMPSWAP").canonicalPool;
    expect(() => parseLaunchManifestJson(JSON.stringify(candidate))).toThrow(/cannot claim/);
  });

  it("rejects a graduated pool that is not paired with wrapped SOL", () => {
    const candidate = manifest("PUMPSWAP");
    if (candidate.canonicalPool) candidate.canonicalPool.quoteMint = community;
    expect(() => parseLaunchManifestJson(JSON.stringify(candidate))).toThrow(/wrapped SOL/);
  });

  it("rejects a noncanonical CHEAP token program and a pool verified after the manifest", () => {
    const wrongProgram = manifest("BONDING_CURVE");
    wrongProgram.token.tokenProgram = community;
    expect(() => parseLaunchManifestJson(JSON.stringify(wrongProgram))).toThrow(/legacy SPL Token program/);

    const futurePool = manifest("PUMPSWAP");
    if (futurePool.canonicalPool) futurePool.canonicalPool.verifiedAtSlot = decimalString("123457");
    futurePool.publication.artifactSha256 = launchManifestArtifactHash(futurePool);
    expect(() => parseLaunchManifestJson(JSON.stringify(futurePool))).toThrow(/after the manifest verification slot/);
  });

  it("rejects a manifest whose commitment was changed", () => {
    const candidate = manifest("BONDING_CURVE");
    candidate.token.decimals = 5;
    expect(() => parseLaunchManifestJson(JSON.stringify(candidate))).toThrow(/does not match/);
  });

  it("rejects caller-supplied substitutes for the pinned Pump deployments", () => {
    const candidate = manifest("PRELAUNCH");
    candidate.pump.programId = owner;
    expect(() => parseLaunchManifestJson(JSON.stringify(candidate))).toThrow(/pinned public deployments/);
  });
});

describe("campaign builder", () => {
  it("builds exact native-SOL instructions and rejects an underfunded treasury", () => {
    const input = {
      campaignId: "community-test-1",
      asset: { kind: "NATIVE_SOL" as const, mint: null, tokenProgram: null, decimals: 9 },
      rulesUri: "https://cheapcoin.fun/rules/community-test-1",
      rulesSha256: sha256Bytes("rules"),
      snapshotSlot: decimalString("123456"),
      allocations: [{ recipient: owner, amount: decimalString("50") }, { recipient: community, amount: decimalString("75") }],
      sourceTreasury: multisig,
      treasuryBalance: decimalString("125"),
      expiresAt: "2026-09-23T12:00:00Z",
      allocationListUri: "ipfs://bafybeigdyrzt5example",
    };
    const built = buildCampaign(input);
    expect(built.manifest.budget).toBe("125");
    expect(built.instructions).toHaveLength(2);
    expect(built.instructions[0]?.programAddress).toBe(system);
    expect(() => buildCampaign({ ...input, treasuryBalance: decimalString("124") })).toThrow(/exceeds/);
  });

  it("rejects duplicate recipients", () => {
    expect(() => buildCampaign({
      campaignId: "duplicate-test",
      asset: { kind: "NATIVE_SOL", mint: null, tokenProgram: null, decimals: 9 },
      rulesUri: "https://cheapcoin.fun/rules/duplicate-test",
      rulesSha256: sha256Bytes("rules"),
      snapshotSlot: decimalString("1"),
      allocations: [{ recipient: owner, amount: decimalString("1") }, { recipient: owner, amount: decimalString("2") }],
      sourceTreasury: multisig,
      treasuryBalance: decimalString("3"),
      expiresAt: "2026-09-23T12:00:00Z",
      allocationListUri: "https://cheapcoin.fun/allocations/duplicate-test.json",
    })).toThrow(/Duplicate recipient/);
  });

  it("requires a manifest-verified audited deployment for large SPL campaigns", () => {
    const allocations = Array.from({ length: 201 }, (_, index) => {
      const recipient = solanaAddress(encodeBase58(new Uint8Array(32).fill(index + 1)));
      return { recipient, recipientTokenAccount: recipient, amount: decimalString("1") };
    });
    const input = {
      campaignId: "large-community-test",
      asset: { kind: "SPL_TOKEN" as const, mint, tokenProgram, decimals: 6 },
      rulesUri: "https://cheapcoin.fun/rules/large-community-test",
      rulesSha256: sha256Bytes("large-rules"), snapshotSlot: decimalString("123456"), allocations,
      sourceTreasury: community, sourceTokenAccount: owner, treasuryBalance: decimalString("201"),
      expiresAt: "2026-09-23T12:00:00Z", allocationListUri: "ipfs://large-allocations", merkleRoot: sha256Bytes("root"),
    };
    expect(() => buildCampaign(input)).toThrow(/manifest-verified/);
    expect(() => buildCampaign({ ...input, rewardsDeployment: { programId: program, auditedCommit: SOLANA_FOUNDATION_REWARDS_AUDITED_COMMIT, deploymentSignature: signature, manifestVerified: true } })).toThrow(/pinned Solana Foundation program/);
    expect(() => buildCampaign({ ...input, rewardsDeployment: { programId: SOLANA_FOUNDATION_REWARDS_PROGRAM_ID, auditedCommit: "b".repeat(40), deploymentSignature: signature, manifestVerified: true } })).toThrow(/pinned OtterSec/);
    const built = buildCampaign({ ...input, rewardsDeployment: { programId: SOLANA_FOUNDATION_REWARDS_PROGRAM_ID, auditedCommit: SOLANA_FOUNDATION_REWARDS_AUDITED_COMMIT, deploymentSignature: signature, manifestVerified: true } });
    expect(built.manifest).toMatchObject({ delivery: "MERKLE_REWARDS", rewardsDeployment: { programId: SOLANA_FOUNDATION_REWARDS_PROGRAM_ID, auditedCommit: SOLANA_FOUNDATION_REWARDS_AUDITED_COMMIT } });
    expect(built.instructions).toHaveLength(0);
  });
});

describe("Pump and cheap-lock clients", () => {
  it("decodes the pinned Pump account layouts and derives the canonical pool", async () => {
    const poolData = new Uint8Array(139);
    poolData.set(PUMP_SWAP_POOL_DISCRIMINATOR);
    poolData[8] = 254;
    poolData.set(decodeBase58(owner), 11);
    poolData.set(decodeBase58(mint), 43);
    poolData.set(decodeBase58(WRAPPED_SOL_MINT), 75);
    poolData.set(decodeBase58(program), 107);
    const pool = decodePumpSwapPoolAccount(poolData);
    expect(pool).toMatchObject({ index: 0, creator: owner, baseMint: mint, quoteMint: WRAPPED_SOL_MINT, lpMint: program });
    const derived = await derivePumpSwapPoolAddresses({ index: pool.index, creator: pool.creator, baseMint: pool.baseMint, quoteMint: pool.quoteMint });
    expect(solanaAddress(derived.pool)).toBe(derived.pool);
    expect(solanaAddress(derived.lpMint)).toBe(derived.lpMint);

    const sharingData = new Uint8Array(148);
    sharingData.set(PUMP_SHARING_CONFIG_DISCRIMINATOR);
    sharingData[9] = 1;
    sharingData[10] = 1;
    sharingData.set(decodeBase58(mint), 11);
    sharingData.set(decodeBase58(multisig), 43);
    sharingData[75] = 1;
    new DataView(sharingData.buffer).setUint32(76, 2, true);
    sharingData.set(decodeBase58(owner), 80);
    new DataView(sharingData.buffer).setUint16(112, 7_500, true);
    sharingData.set(decodeBase58(community), 114);
    new DataView(sharingData.buffer).setUint16(146, 2_500, true);
    expect(decodePumpSharingConfigAccount(sharingData)).toMatchObject({
      status: "ACTIVE",
      mint,
      adminRevoked: true,
      shareholders: [{ address: owner, shareBps: 7_500 }, { address: community, shareBps: 2_500 }],
    });
  });

  it("derives Pump accounts and freezes the rehearsed 75/25 order", async () => {
    const rehearsal = await buildPumpFeeShareRehearsal({
      mint,
      quoteMint: WRAPPED_SOL_MINT,
      ownerTreasuryVault: owner,
      communityTreasuryVault: community,
      currentCreator: multisig,
      canonicalPool: null,
      pumpProgramId: pump,
      pumpFeesProgramId: pumpFees,
      pumpAmmProgramId: pumpAmm,
    });
    expect(rehearsal.newShareholders.map(({ shareBps }) => shareBps)).toEqual([7_500, 2_500]);
    expect(rehearsal.irreversibleAfterUpdate).toBe(true);
  });

  it("refuses fee-share derivation against an untrusted Pump program", async () => {
    await expect(buildPumpFeeShareRehearsal({
      mint,
      quoteMint: WRAPPED_SOL_MINT,
      ownerTreasuryVault: owner,
      communityTreasuryVault: community,
      currentCreator: multisig,
      canonicalPool: null,
      pumpProgramId: owner,
      pumpFeesProgramId: pumpFees,
      pumpAmmProgramId: pumpAmm,
    })).rejects.toThrow(/pinned public deployments/);
  });

  it("uses isolated deposit PDAs and never gates the withdrawal builder on maturity", async () => {
    const first = await deriveCheapLockAddresses(program, owner, 1n);
    const second = await deriveCheapLockAddresses(program, owner, 2n);
    expect(first.position).not.toBe(second.position);
    const open = await buildOpenPositionInstruction({ programAddress: program, owner, cheapMint: mint, sourceTokenAccount: community, tokenProgram, depositId: 1n, amount: 99n, tier: "THIRTY_DAYS" });
    const withdraw = await buildWithdrawPositionInstruction({ programAddress: program, owner, cheapMint: mint, destinationTokenAccount: community, tokenProgram, depositId: 1n });
    expect(open.description).toBe("cheap-lock:open_position");
    expect(withdraw.description).toBe("cheap-lock:withdraw_position");
  });
});
