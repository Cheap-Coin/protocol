import {
  canonicalJson,
  decimalString,
  decodeBase58,
  LEGACY_SPL_TOKEN_PROGRAM,
  PUMP_AMM_PROGRAM_ID,
  PUMP_FEES_PROGRAM_ID,
  PUMP_PROGRAM_ID,
  SOLANA_FOUNDATION_REWARDS_AUDITED_COMMIT,
  SOLANA_FOUNDATION_REWARDS_PROGRAM_ID,
  sha256Bytes,
  sha256Digest,
  solanaAddress,
  solanaSignature,
  utcTimestamp,
  WRAPPED_SOL_MINT,
} from "./solana.js";
import type { LaunchManifest, LaunchLifecycle, Sha256Digest, SolanaAddress, SolanaCluster } from "./types.js";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, path: string, keys: readonly string[]): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  const candidate = value as JsonRecord;
  const missing = keys.filter((key) => !(key in candidate));
  const unexpected = Object.keys(candidate).filter((key) => !keys.includes(key));
  if (missing.length) throw new TypeError(`${path} is missing ${missing.join(", ")}`);
  if (unexpected.length) throw new TypeError(`${path} has unexpected fields: ${unexpected.join(", ")}`);
  return candidate;
}

function literal<T extends string | number>(value: unknown, expected: T, path: string): T {
  if (value !== expected) throw new TypeError(`${path} must equal ${String(expected)}`);
  return expected;
}

function nullableAddress(value: unknown, path: string): SolanaAddress | null {
  return value === null ? null : solanaAddress(value, path);
}

function nullableSignature(value: unknown, path: string) {
  return value === null ? null : solanaSignature(value, path);
}

function text(value: unknown, path: string, pattern: RegExp, maximum = 256): string {
  if (typeof value !== "string" || value.length > maximum || !pattern.test(value)) {
    throw new TypeError(`${path} has an invalid format`);
  }
  return value;
}

function parseManifest(value: unknown): LaunchManifest {
  const root = record(value, "manifest", [
    "schemaVersion", "launchId", "lifecycle", "cluster", "token", "pump", "canonicalPool",
    "governance", "programs", "verification", "publication",
  ]);
  literal(root.schemaVersion, 1, "manifest.schemaVersion");
  const launchId = text(root.launchId, "manifest.launchId", /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 80);

  const lifecycleInput = record(root.lifecycle, "manifest.lifecycle", ["state", "updatedAt"]);
  if (!["PRELAUNCH", "BONDING_CURVE", "PUMPSWAP"].includes(String(lifecycleInput.state))) {
    throw new TypeError("manifest.lifecycle.state is invalid");
  }
  const lifecycle = {
    state: lifecycleInput.state as LaunchLifecycle,
    updatedAt: utcTimestamp(lifecycleInput.updatedAt, "manifest.lifecycle.updatedAt"),
  };
  if (!["localnet", "devnet", "mainnet-beta"].includes(String(root.cluster))) {
    throw new TypeError("manifest.cluster is invalid");
  }
  const cluster = root.cluster as SolanaCluster;

  const tokenInput = record(root.token, "manifest.token", ["name", "symbol", "mint", "tokenProgram", "decimals"]);
  literal(tokenInput.name, "CheapCoin", "manifest.token.name");
  literal(tokenInput.symbol, "CHEAP", "manifest.token.symbol");
  const decimals = tokenInput.decimals === null ? null : Number(tokenInput.decimals);
  if (decimals !== null && (!Number.isInteger(decimals) || decimals < 0 || decimals > 9)) {
    throw new TypeError("manifest.token.decimals must be an integer from 0 through 9");
  }
  const token = {
    name: "CheapCoin" as const,
    symbol: "CHEAP" as const,
    mint: nullableAddress(tokenInput.mint, "manifest.token.mint"),
    tokenProgram: nullableAddress(tokenInput.tokenProgram, "manifest.token.tokenProgram"),
    decimals,
  };

  const pumpInput = record(root.pump, "manifest.pump", [
    "programId", "feesProgramId", "ammProgramId", "global", "bondingCurve", "sharingConfig", "feeSharing",
  ]);
  const feeInput = record(pumpInput.feeSharing, "manifest.pump.feeSharing", [
    "ownerTreasuryVault", "communityTreasuryVault", "ownerShareBps", "communityShareBps", "finalizedSignature",
  ]);
  const pumpProgramId = solanaAddress(pumpInput.programId, "manifest.pump.programId");
  const pumpFeesProgramId = solanaAddress(pumpInput.feesProgramId, "manifest.pump.feesProgramId");
  const pumpAmmProgramId = solanaAddress(pumpInput.ammProgramId, "manifest.pump.ammProgramId");
  if (
    pumpProgramId !== PUMP_PROGRAM_ID
    || pumpFeesProgramId !== PUMP_FEES_PROGRAM_ID
    || pumpAmmProgramId !== PUMP_AMM_PROGRAM_ID
  ) {
    throw new TypeError("manifest Pump program IDs do not match the pinned public deployments");
  }
  const pump = {
    programId: pumpProgramId,
    feesProgramId: pumpFeesProgramId,
    ammProgramId: pumpAmmProgramId,
    global: nullableAddress(pumpInput.global, "manifest.pump.global"),
    bondingCurve: nullableAddress(pumpInput.bondingCurve, "manifest.pump.bondingCurve"),
    sharingConfig: nullableAddress(pumpInput.sharingConfig, "manifest.pump.sharingConfig"),
    feeSharing: {
      ownerTreasuryVault: solanaAddress(feeInput.ownerTreasuryVault, "manifest.pump.feeSharing.ownerTreasuryVault"),
      communityTreasuryVault: solanaAddress(feeInput.communityTreasuryVault, "manifest.pump.feeSharing.communityTreasuryVault"),
      ownerShareBps: literal(feeInput.ownerShareBps, 7_500, "manifest.pump.feeSharing.ownerShareBps"),
      communityShareBps: literal(feeInput.communityShareBps, 2_500, "manifest.pump.feeSharing.communityShareBps"),
      finalizedSignature: nullableSignature(feeInput.finalizedSignature, "manifest.pump.feeSharing.finalizedSignature"),
    },
  };

  const governanceInput = record(root.governance, "manifest.governance", [
    "squadsMultisig", "ownerTreasuryVault", "communityTreasuryVault", "threshold", "signerCount",
  ]);
  const governance = {
    squadsMultisig: solanaAddress(governanceInput.squadsMultisig, "manifest.governance.squadsMultisig"),
    ownerTreasuryVault: solanaAddress(governanceInput.ownerTreasuryVault, "manifest.governance.ownerTreasuryVault"),
    communityTreasuryVault: solanaAddress(governanceInput.communityTreasuryVault, "manifest.governance.communityTreasuryVault"),
    threshold: literal(governanceInput.threshold, 2, "manifest.governance.threshold"),
    signerCount: literal(governanceInput.signerCount, 3, "manifest.governance.signerCount"),
  };

  let canonicalPool: LaunchManifest["canonicalPool"] = null;
  if (root.canonicalPool !== null) {
    const poolInput = record(root.canonicalPool, "manifest.canonicalPool", [
      "address", "lpMint", "quoteMint", "verifiedAtSlot", "verificationSignature",
    ]);
    canonicalPool = {
      address: solanaAddress(poolInput.address, "manifest.canonicalPool.address"),
      lpMint: solanaAddress(poolInput.lpMint, "manifest.canonicalPool.lpMint"),
      quoteMint: solanaAddress(poolInput.quoteMint, "manifest.canonicalPool.quoteMint"),
      verifiedAtSlot: decimalString(poolInput.verifiedAtSlot, "manifest.canonicalPool.verifiedAtSlot", false),
      verificationSignature: solanaSignature(poolInput.verificationSignature, "manifest.canonicalPool.verificationSignature"),
    };
  }

  const programsInput = record(root.programs, "manifest.programs", ["cheapLock", "rewards"]);
  let rewards: LaunchManifest["programs"]["rewards"] = null;
  if (programsInput.rewards !== null) {
    const rewardsInput = record(programsInput.rewards, "manifest.programs.rewards", [
      "programId", "auditedCommit", "deploymentSignature",
    ]);
    rewards = {
      programId: solanaAddress(rewardsInput.programId, "manifest.programs.rewards.programId"),
      auditedCommit: text(rewardsInput.auditedCommit, "manifest.programs.rewards.auditedCommit", /^[0-9a-f]{40}$/),
      deploymentSignature: solanaSignature(rewardsInput.deploymentSignature, "manifest.programs.rewards.deploymentSignature"),
    };
    if (rewards.programId !== SOLANA_FOUNDATION_REWARDS_PROGRAM_ID || rewards.auditedCommit !== SOLANA_FOUNDATION_REWARDS_AUDITED_COMMIT) {
      throw new TypeError("manifest rewards program does not match the pinned audited Solana Foundation baseline");
    }
  }

  const verificationInput = record(root.verification, "manifest.verification", ["slot", "blockhash"]);
  const verification = {
    slot: verificationInput.slot === null ? null : decimalString(verificationInput.slot, "manifest.verification.slot", false),
    blockhash: verificationInput.blockhash === null
      ? null
      : String(solanaAddress(verificationInput.blockhash, "manifest.verification.blockhash")),
  };

  const publicationInput = record(root.publication, "manifest.publication", [
    "sourceRepository", "sourceCommit", "signedTag", "manifestPath", "artifactSha256",
  ]);
  const publication = {
    sourceRepository: literal(publicationInput.sourceRepository, "https://github.com/Cheap-Coin/protocol", "manifest.publication.sourceRepository"),
    sourceCommit: text(publicationInput.sourceCommit, "manifest.publication.sourceCommit", /^[0-9a-f]{40}$/),
    signedTag: publicationInput.signedTag === null
      ? null
      : text(publicationInput.signedTag, "manifest.publication.signedTag", /^launch\/[a-z0-9]+(?:-[a-z0-9]+)*\/v[1-9][0-9]*$/, 120),
    manifestPath: text(publicationInput.manifestPath, "manifest.publication.manifestPath", /^deployments\/[a-z0-9]+(?:-[a-z0-9]+)*\.manifest\.json$/, 160),
    artifactSha256: publicationInput.artifactSha256 === null
      ? null
      : sha256Digest(publicationInput.artifactSha256, "manifest.publication.artifactSha256"),
  };

  const manifest: LaunchManifest = {
    schemaVersion: 1,
    launchId,
    lifecycle,
    cluster,
    token,
    pump,
    canonicalPool,
    governance,
    programs: { cheapLock: nullableAddress(programsInput.cheapLock, "manifest.programs.cheapLock"), rewards },
    verification,
    publication,
  };
  enforceLaunchState(manifest);
  return manifest;
}

function enforceLaunchState(manifest: LaunchManifest): void {
  const { state } = manifest.lifecycle;
  const launchValues = [manifest.token.mint, manifest.token.tokenProgram, manifest.token.decimals, manifest.pump.global, manifest.pump.bondingCurve, manifest.pump.sharingConfig, manifest.pump.feeSharing.finalizedSignature, manifest.verification.slot, manifest.verification.blockhash];
  if (manifest.pump.feeSharing.ownerTreasuryVault !== manifest.governance.ownerTreasuryVault || manifest.pump.feeSharing.communityTreasuryVault !== manifest.governance.communityTreasuryVault) {
    throw new TypeError("Pump fee recipients must exactly match the two Squads treasury vaults");
  }
  if (manifest.governance.ownerTreasuryVault === manifest.governance.communityTreasuryVault) {
    throw new TypeError("Owner and community treasury vaults must be distinct");
  }
  if (state === "PRELAUNCH") {
    if (launchValues.some((value) => value !== null) || manifest.canonicalPool || manifest.programs.cheapLock || manifest.programs.rewards) {
      throw new TypeError("PRELAUNCH cannot contain deployed token, pool, or program state");
    }
    if (manifest.publication.signedTag || manifest.publication.artifactSha256) {
      throw new TypeError("PRELAUNCH drafts cannot claim a signed release or artifact hash");
    }
    return;
  }
  if (launchValues.some((value) => value === null)) throw new TypeError(`${state} requires verified token, Pump fee sharing, and slot fields`);
  if (manifest.token.tokenProgram !== LEGACY_SPL_TOKEN_PROGRAM) throw new TypeError("Pump-launched CHEAP must use the legacy SPL Token program");
  if (!manifest.publication.signedTag || !manifest.publication.artifactSha256) throw new TypeError(`${state} requires a signed manifest commitment`);
  if (state === "BONDING_CURVE" && manifest.canonicalPool) throw new TypeError("BONDING_CURVE cannot claim a canonical PumpSwap pool");
  if (state === "PUMPSWAP" && !manifest.canonicalPool) throw new TypeError("PUMPSWAP requires canonical pool verification");
  if (manifest.canonicalPool && manifest.canonicalPool.quoteMint !== WRAPPED_SOL_MINT) throw new TypeError("The canonical PumpSwap quote mint must be wrapped SOL");
  if (manifest.canonicalPool && manifest.canonicalPool.lpMint === manifest.token.mint) throw new TypeError("The canonical LP mint must differ from CHEAP");
  if (manifest.canonicalPool && BigInt(manifest.canonicalPool.verifiedAtSlot) > BigInt(manifest.verification.slot!)) throw new TypeError("Canonical pool verification cannot occur after the manifest verification slot");
}

export function launchManifestArtifactHash(manifest: LaunchManifest): Sha256Digest {
  return sha256Bytes(canonicalJson({ ...manifest, publication: { ...manifest.publication, artifactSha256: null } }));
}

export function parseLaunchManifestJson(source: string): { manifest: LaunchManifest; canonicalJson: string; artifactSha256: Sha256Digest } {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new TypeError(`Launch manifest is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const manifest = parseManifest(value);
  const artifactSha256 = launchManifestArtifactHash(manifest);
  if (manifest.publication.artifactSha256 && manifest.publication.artifactSha256 !== artifactSha256) {
    throw new TypeError("manifest.publication.artifactSha256 does not match canonical manifest content");
  }
  return { manifest, canonicalJson: canonicalJson(manifest), artifactSha256 };
}

export function serializeLaunchManifest(manifest: LaunchManifest, commitArtifactHash = false): string {
  const parsed = parseManifest(manifest);
  const committed = commitArtifactHash
    ? { ...parsed, publication: { ...parsed.publication, artifactSha256: launchManifestArtifactHash(parsed) } }
    : parsed;
  return canonicalJson(committed);
}

export interface LaunchCapabilities {
  publicResearch: true;
  walletData: boolean;
  lockDeposits: boolean;
  lockWithdrawals: boolean;
  liquidityDeposits: boolean;
  liquidityWithdrawals: boolean;
  campaignClaims: boolean;
}

export function launchCapabilities(manifest: LaunchManifest): LaunchCapabilities {
  const published = Boolean(manifest.publication.artifactSha256 && manifest.verification.slot);
  const launched = manifest.lifecycle.state !== "PRELAUNCH" && published;
  const poolVerified = manifest.lifecycle.state === "PUMPSWAP" && Boolean(manifest.canonicalPool);
  return {
    publicResearch: true,
    walletData: launched,
    lockDeposits: launched && Boolean(manifest.programs.cheapLock),
    lockWithdrawals: launched && Boolean(manifest.programs.cheapLock),
    liquidityDeposits: launched && poolVerified,
    liquidityWithdrawals: launched && poolVerified,
    campaignClaims: launched && Boolean(manifest.programs.rewards),
  };
}

export function isBase58Blockhash(value: string): boolean {
  try {
    return decodeBase58(value).length === 32;
  } catch {
    return false;
  }
}
