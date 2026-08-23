import { Buffer } from "node:buffer";
import { canonicalJson, decimalString, LEGACY_SPL_TOKEN_PROGRAM, resourceUri, sha256Bytes, sha256Digest, solanaAddress, solanaSignature, SOLANA_FOUNDATION_REWARDS_AUDITED_COMMIT, SOLANA_FOUNDATION_REWARDS_PROGRAM_ID, u64LittleEndian, utcTimestamp } from "./solana.js";
import type { CampaignAsset, CampaignManifest, DecimalString, Sha256Digest, SolanaAddress } from "./types.js";

export const SYSTEM_PROGRAM_ADDRESS = solanaAddress("11111111111111111111111111111111");
export const SPL_TOKEN_PROGRAM_ADDRESS = LEGACY_SPL_TOKEN_PROGRAM;
export const MAX_DIRECT_RECIPIENTS = 200;

export interface CampaignAllocation {
  recipient: SolanaAddress;
  amount: DecimalString;
  recipientTokenAccount?: SolanaAddress;
}

export interface InstructionAccount {
  address: SolanaAddress;
  role: "readonly" | "writable" | "readonlySigner" | "writableSigner";
}

export interface UnsignedInstruction {
  programAddress: SolanaAddress;
  accounts: InstructionAccount[];
  dataBase64: string;
  description: string;
}

export interface CampaignDraftInput {
  campaignId: string;
  asset: CampaignAsset;
  rulesUri: string;
  rulesSha256: Sha256Digest;
  snapshotSlot: DecimalString;
  allocations: CampaignAllocation[];
  sourceTreasury: SolanaAddress;
  sourceTokenAccount?: SolanaAddress;
  treasuryBalance: DecimalString;
  expiresAt: string;
  allocationListUri: string;
  merkleRoot?: Sha256Digest;
  rewardsDeployment?: { programId: SolanaAddress; auditedCommit: string; deploymentSignature: string; manifestVerified: boolean };
}

export interface BuiltCampaign {
  manifest: CampaignManifest;
  canonicalAllocationJson: string;
  instructions: UnsignedInstruction[];
}

function validateAsset(asset: CampaignAsset): CampaignAsset {
  if (!Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 9) {
    throw new TypeError("asset.decimals must be an integer from 0 through 9");
  }
  if (asset.kind === "NATIVE_SOL") {
    if (asset.mint !== null || asset.tokenProgram !== null || asset.decimals !== 9) {
      throw new TypeError("Native SOL campaigns require null mint/program and 9 decimals");
    }
    return asset;
  }
  if (asset.kind !== "SPL_TOKEN") throw new TypeError("asset.kind is invalid");
  if (!asset.mint || !asset.tokenProgram) throw new TypeError("SPL campaigns require mint and token program");
  solanaAddress(asset.mint, "asset.mint");
  solanaAddress(asset.tokenProgram, "asset.tokenProgram");
  if (asset.tokenProgram !== LEGACY_SPL_TOKEN_PROGRAM) throw new TypeError("Token-2022 campaign transfers require extension inspection and are disabled in V1");
  return asset;
}

function checkedAdd(left: bigint, right: bigint): bigint {
  const result = left + right;
  if (result > 18_446_744_073_709_551_615n) throw new RangeError("Campaign total exceeds u64");
  return result;
}

function validateRewardsDeployment(deployment: NonNullable<CampaignDraftInput["rewardsDeployment"]>): void {
  const programId = solanaAddress(deployment.programId, "rewardsDeployment.programId");
  if (programId !== SOLANA_FOUNDATION_REWARDS_PROGRAM_ID) throw new TypeError("Rewards deployment does not match the pinned Solana Foundation program ID");
  if (deployment.auditedCommit !== SOLANA_FOUNDATION_REWARDS_AUDITED_COMMIT) throw new TypeError("Rewards deployment does not match the pinned OtterSec audited-through commit");
  solanaSignature(deployment.deploymentSignature, "rewardsDeployment.deploymentSignature");
}

function prepareAllocations(asset: CampaignAsset, allocations: CampaignAllocation[]): CampaignAllocation[] {
  if (allocations.length === 0) throw new TypeError("Campaign requires at least one recipient");
  const seen = new Set<string>();
  return allocations.map((allocation, index) => {
    const recipient = solanaAddress(allocation.recipient, `allocations[${index}].recipient`);
    if (seen.has(recipient)) throw new TypeError(`Duplicate recipient: ${recipient}`);
    seen.add(recipient);
    const amount = decimalString(allocation.amount, `allocations[${index}].amount`, false);
    if (asset.kind === "SPL_TOKEN" && !allocation.recipientTokenAccount) {
      throw new TypeError(`allocations[${index}] requires recipientTokenAccount`);
    }
    if (asset.kind === "NATIVE_SOL" && allocation.recipientTokenAccount) {
      throw new TypeError(`allocations[${index}] cannot include recipientTokenAccount for native SOL`);
    }
    return {
      recipient,
      amount,
      ...(allocation.recipientTokenAccount
        ? { recipientTokenAccount: solanaAddress(allocation.recipientTokenAccount, `allocations[${index}].recipientTokenAccount`) }
        : {}),
    };
  }).sort((left, right) => left.recipient.localeCompare(right.recipient));
}

function nativeTransferData(amount: bigint): string {
  const output = new Uint8Array(12);
  output[0] = 2;
  output.set(u64LittleEndian(amount), 4);
  return Buffer.from(output).toString("base64");
}

function tokenTransferCheckedData(amount: bigint, decimals: number): string {
  const output = new Uint8Array(10);
  output[0] = 12;
  output.set(u64LittleEndian(amount), 1);
  output[9] = decimals;
  return Buffer.from(output).toString("base64");
}

function directInstructions(input: CampaignDraftInput, allocations: CampaignAllocation[]): UnsignedInstruction[] {
  if (allocations.length > MAX_DIRECT_RECIPIENTS) return [];
  if (input.asset.kind === "NATIVE_SOL") {
    return allocations.map((allocation) => ({
      programAddress: SYSTEM_PROGRAM_ADDRESS,
      accounts: [
        { address: input.sourceTreasury, role: "writableSigner" as const },
        { address: allocation.recipient, role: "writable" as const },
      ],
      dataBase64: nativeTransferData(BigInt(allocation.amount)),
      description: `Transfer ${allocation.amount} lamports from the community treasury`,
    }));
  }
  if (!input.asset.mint || !input.asset.tokenProgram || !input.sourceTokenAccount) {
    throw new TypeError("Direct SPL campaigns require the source treasury token account");
  }
  const sourceTokenAccount = solanaAddress(input.sourceTokenAccount, "sourceTokenAccount");
  return allocations.map((allocation) => ({
    programAddress: input.asset.tokenProgram as SolanaAddress,
    accounts: [
      { address: sourceTokenAccount, role: "writable" as const },
      { address: input.asset.mint as SolanaAddress, role: "readonly" as const },
      { address: allocation.recipientTokenAccount as SolanaAddress, role: "writable" as const },
      { address: input.sourceTreasury, role: "readonlySigner" as const },
    ],
    dataBase64: tokenTransferCheckedData(BigInt(allocation.amount), input.asset.decimals),
    description: `Transfer ${allocation.amount} base units from the community treasury`,
  }));
}

export function buildCampaign(input: CampaignDraftInput): BuiltCampaign {
  validateAsset(input.asset);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.campaignId) || input.campaignId.length > 96) {
    throw new TypeError("campaignId must be a lowercase slug");
  }
  const sourceTreasury = solanaAddress(input.sourceTreasury, "sourceTreasury");
  const allocations = prepareAllocations(input.asset, input.allocations);
  const budget = allocations.reduce((total, allocation) => checkedAdd(total, BigInt(allocation.amount)), 0n);
  if (budget > BigInt(decimalString(input.treasuryBalance, "treasuryBalance"))) {
    throw new RangeError("Campaign budget exceeds the verified treasury balance");
  }
  const canonicalAllocationJson = canonicalJson({
    schemaVersion: 1,
    campaignId: input.campaignId,
    asset: input.asset,
    allocations,
  });
  const allocationSha256 = sha256Bytes(canonicalAllocationJson);
  const direct = allocations.length <= MAX_DIRECT_RECIPIENTS;
  if (direct && (input.merkleRoot || input.rewardsDeployment)) throw new TypeError("Direct campaigns cannot claim Merkle deployment data");
  if (!direct) {
    if (input.asset.kind !== "SPL_TOKEN") throw new TypeError("Large campaigns require an SPL asset; wrap native SOL before campaign funding");
    if (!input.merkleRoot || !input.rewardsDeployment?.manifestVerified) throw new TypeError("Large campaigns require a Merkle root and manifest-verified rewards deployment");
    validateRewardsDeployment(input.rewardsDeployment);
  }
  const expiresAt = utcTimestamp(input.expiresAt, "expiresAt");
  const manifest: CampaignManifest = {
    schemaVersion: 1,
    campaignId: input.campaignId,
    asset: input.asset,
    budget: budget.toString() as DecimalString,
    rulesUri: resourceUri(input.rulesUri, "rulesUri"),
    rulesSha256: sha256Digest(input.rulesSha256, "rulesSha256"),
    snapshotSlot: decimalString(input.snapshotSlot, "snapshotSlot", false),
    allocationSha256,
    recipients: {
      mode: direct ? "DIRECT_LIST" : "MERKLE_ROOT",
      count: allocations.length,
      root: direct ? null : sha256Digest(input.merkleRoot, "merkleRoot"),
      listUri: resourceUri(input.allocationListUri, "allocationListUri"),
    },
    delivery: direct ? "SQUADS_BATCH" : "MERKLE_REWARDS",
    rewardsDeployment: direct ? null : {
      programId: input.rewardsDeployment!.programId,
      auditedCommit: input.rewardsDeployment!.auditedCommit,
      deploymentSignature: solanaSignature(input.rewardsDeployment!.deploymentSignature),
    },
    sourceTreasury,
    expiresAt,
    status: "DRAFT",
    reconciliation: {
      preparedSignatures: [],
      executedSignatures: [],
      distributed: "0" as DecimalString,
      remaining: budget.toString() as DecimalString,
      reconciledAt: null,
    },
  };
  validateCampaignManifest(manifest);
  return { manifest, canonicalAllocationJson, instructions: directInstructions(input, allocations) };
}

export function validateCampaignManifest(manifest: CampaignManifest): void {
  validateAsset(manifest.asset);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.campaignId)) throw new TypeError("campaignId is invalid");
  const budget = BigInt(decimalString(manifest.budget, "budget", false));
  resourceUri(manifest.rulesUri, "rulesUri");
  sha256Digest(manifest.rulesSha256, "rulesSha256");
  decimalString(manifest.snapshotSlot, "snapshotSlot", false);
  sha256Digest(manifest.allocationSha256, "allocationSha256");
  if (!Number.isInteger(manifest.recipients.count) || manifest.recipients.count < 1) throw new TypeError("recipient count is invalid");
  if (manifest.recipients.mode === "DIRECT_LIST" && manifest.recipients.root !== null) throw new TypeError("Direct list cannot claim a Merkle root");
  if (manifest.recipients.mode === "MERKLE_ROOT") sha256Digest(manifest.recipients.root, "recipients.root");
  if (manifest.delivery === "SQUADS_BATCH") {
    if (manifest.recipients.mode !== "DIRECT_LIST" || manifest.recipients.count > MAX_DIRECT_RECIPIENTS || manifest.rewardsDeployment !== null) throw new TypeError("Direct campaign delivery is inconsistent");
  } else if (manifest.delivery === "MERKLE_REWARDS") {
    if (manifest.recipients.mode !== "MERKLE_ROOT" || manifest.recipients.count <= MAX_DIRECT_RECIPIENTS || manifest.asset.kind !== "SPL_TOKEN" || !manifest.rewardsDeployment) throw new TypeError("Merkle campaign delivery is inconsistent");
    validateRewardsDeployment({ ...manifest.rewardsDeployment, manifestVerified: true });
  } else throw new TypeError("Campaign delivery is invalid");
  resourceUri(manifest.recipients.listUri, "recipients.listUri");
  solanaAddress(manifest.sourceTreasury, "sourceTreasury");
  utcTimestamp(manifest.expiresAt, "expiresAt");
  const signatures = [...manifest.reconciliation.preparedSignatures, ...manifest.reconciliation.executedSignatures];
  signatures.forEach((signature, index) => solanaSignature(signature, `reconciliation.signatures[${index}]`));
  if (new Set(signatures).size !== signatures.length) throw new TypeError("Reconciliation signatures must be unique");
  const distributed = BigInt(decimalString(manifest.reconciliation.distributed, "reconciliation.distributed"));
  const remaining = BigInt(decimalString(manifest.reconciliation.remaining, "reconciliation.remaining"));
  if (distributed + remaining !== budget) throw new TypeError("Distributed plus remaining must equal campaign budget");
  if (manifest.status === "RECONCILED") {
    if (!manifest.reconciliation.reconciledAt || manifest.reconciliation.executedSignatures.length === 0) {
      throw new TypeError("Reconciled campaigns require a timestamp and executed signatures");
    }
    utcTimestamp(manifest.reconciliation.reconciledAt, "reconciliation.reconciledAt");
  } else if (manifest.reconciliation.reconciledAt !== null) {
    throw new TypeError("Only reconciled campaigns may set reconciledAt");
  }
}
