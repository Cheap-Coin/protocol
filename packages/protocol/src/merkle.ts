import { concatHex, keccak256, type Hex } from "viem";

interface MerkleNode {
  hash: Hex;
  positions: number[];
}

export interface MerkleCommitment {
  root: Hex;
  proofs: Hex[][];
}

export function hashSortedPair(left: Hex, right: Hex): Hex {
  const [first, second] =
    left.toLowerCase() < right.toLowerCase() ? [left, right] : [right, left];
  return keccak256(concatHex([first, second]));
}

/**
 * Builds an OpenZeppelin MerkleProof-compatible tree. Node pairs are sorted;
 * an unpaired node is promoted unchanged to the next level. Leaf order remains
 * visible in the published artifact and does not affect proof verification.
 */
export function buildSortedMerkleCommitment(
  leaves: readonly Hex[],
): MerkleCommitment {
  if (leaves.length === 0) {
    throw new RangeError("A Merkle commitment requires at least one leaf");
  }

  const proofs = leaves.map((): Hex[] => []);
  let level: MerkleNode[] = leaves.map((hash, position) => ({
    hash,
    positions: [position],
  }));

  while (level.length > 1) {
    const next: MerkleNode[] = [];

    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      if (!left) throw new Error("Invalid Merkle level");
      const right = level[index + 1];

      if (!right) {
        next.push(left);
        continue;
      }

      for (const position of left.positions) proofs[position]?.push(right.hash);
      for (const position of right.positions) proofs[position]?.push(left.hash);

      next.push({
        hash: hashSortedPair(left.hash, right.hash),
        positions: [...left.positions, ...right.positions],
      });
    }

    level = next;
  }

  const root = level[0]?.hash;
  if (!root) throw new Error("Merkle root was not created");
  return { root, proofs };
}

export function verifySortedMerkleProof(
  leaf: Hex,
  proof: readonly Hex[],
  expectedRoot: Hex,
): boolean {
  const computed = proof.reduce(hashSortedPair, leaf);
  return computed.toLowerCase() === expectedRoot.toLowerCase();
}
