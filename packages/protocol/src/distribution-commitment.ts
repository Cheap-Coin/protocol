import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  isHex,
  keccak256,
  size,
  type Address,
  type Hex,
} from "viem";
import { buildSortedMerkleCommitment } from "./merkle.js";

export interface RewardEntry {
  address: Address;
  amount: bigint;
}

export interface CommittedRewardEntry extends RewardEntry {
  leaf: Hex;
  proof: Hex[];
}

export interface DistributionBatch {
  index: number;
  recipients: Address[];
  amounts: bigint[];
  batchHash: Hex;
  leaf: Hex;
  proof: Hex[];
}

export interface DistributionCommitment {
  allocationRoot: Hex;
  batchesRoot: Hex;
  entries: CommittedRewardEntry[];
  batches: DistributionBatch[];
  totalAmount: bigint;
}

function doubleHash(encoded: Hex): Hex {
  return keccak256(keccak256(encoded));
}

export function hashRewardEntry(entry: RewardEntry): Hex {
  return doubleHash(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [entry.address, entry.amount],
    ),
  );
}

export function hashDistributionBatch(
  dropId: Hex,
  index: number,
  recipients: readonly Address[],
  amounts: readonly bigint[],
): { batchHash: Hex; leaf: Hex } {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError("Batch index must be a non-negative safe integer");
  }
  if (recipients.length === 0 || recipients.length !== amounts.length) {
    throw new RangeError("Batch recipients and amounts must be non-empty and aligned");
  }

  const batchHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address[]" },
        { type: "uint256[]" },
      ],
      [dropId, BigInt(index), [...recipients], [...amounts]],
    ),
  );

  return { batchHash, leaf: keccak256(batchHash) };
}

/**
 * Produces both public holder-allocation proofs and the compact batch root that
 * the owner Safe approves on-chain. The operator can execute those batches but
 * cannot change a recipient or amount without invalidating its proof.
 */
export function buildDistributionCommitment(
  dropId: Hex,
  rawEntries: readonly RewardEntry[],
  maxBatchSize = 200,
): DistributionCommitment {
  if (!isHex(dropId) || size(dropId) !== 32) {
    throw new TypeError("Drop ID must be exactly 32 bytes");
  }
  if (
    !Number.isSafeInteger(maxBatchSize) ||
    maxBatchSize <= 0 ||
    maxBatchSize > 200
  ) {
    throw new RangeError("Batch size must be between 1 and 200");
  }
  if (rawEntries.length === 0) {
    throw new RangeError("A distribution requires at least one reward entry");
  }

  const seen = new Set<string>();
  const normalized = rawEntries
    .map((entry) => {
      if (!isAddress(entry.address)) throw new TypeError(`Invalid address: ${entry.address}`);
      if (entry.amount <= 0n) throw new RangeError("Reward amounts must be positive");
      const address = getAddress(entry.address);
      const key = address.toLowerCase();
      if (seen.has(key)) throw new Error(`Duplicate reward address: ${address}`);
      seen.add(key);
      return { address, amount: entry.amount };
    })
    .sort((left, right) =>
      left.address.toLowerCase().localeCompare(right.address.toLowerCase()),
    );

  const allocationLeaves = normalized.map(hashRewardEntry);
  const allocationTree = buildSortedMerkleCommitment(allocationLeaves);
  const uncommittedBatches: Omit<DistributionBatch, "proof">[] = [];

  for (let offset = 0; offset < normalized.length; offset += maxBatchSize) {
    const entries = normalized.slice(offset, offset + maxBatchSize);
    const index = uncommittedBatches.length;
    const recipients = entries.map((entry) => entry.address);
    const amounts = entries.map((entry) => entry.amount);
    const hashes = hashDistributionBatch(dropId, index, recipients, amounts);
    uncommittedBatches.push({ index, recipients, amounts, ...hashes });
  }

  const batchesTree = buildSortedMerkleCommitment(
    uncommittedBatches.map((batch) => batch.leaf),
  );

  return {
    allocationRoot: allocationTree.root,
    batchesRoot: batchesTree.root,
    entries: normalized.map((entry, index) => ({
      ...entry,
      leaf: allocationLeaves[index] as Hex,
      proof: allocationTree.proofs[index] ?? [],
    })),
    batches: uncommittedBatches.map((batch, index) => ({
      ...batch,
      proof: batchesTree.proofs[index] ?? [],
    })),
    totalAmount: normalized.reduce((total, entry) => total + entry.amount, 0n),
  };
}
