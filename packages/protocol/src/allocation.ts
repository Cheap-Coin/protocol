import type {
  AllocationResult,
  HolderAllocation,
  HolderScoreInput,
} from "./types.js";

const BPS = 10_000n;

export function streakMultiplierBps(streak: number): bigint {
  if (!Number.isSafeInteger(streak) || streak < 0) {
    throw new RangeError("Streak must be a non-negative safe integer");
  }
  if (streak >= 10) return 20_000n;
  if (streak >= 5) return 17_500n;
  if (streak === 4) return 15_000n;
  if (streak === 3) return 13_000n;
  if (streak === 2) return 11_500n;
  if (streak === 1) return 10_000n;
  return 0n;
}
function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/**
 * Deterministically allocates a fixed reward budget using integer arithmetic.
 * Eligible weight = minimum token balance × streak multiplier. Any division
 * remainder is assigned one unit at a time by largest remainder, with a
 * lowercase address tie-breaker so independent implementations agree.
 */
export function allocateHolderPool(
  rewardAmount: bigint,
  floorTokenAmount: bigint,
  holders: readonly HolderScoreInput[],
): AllocationResult {
  if (rewardAmount < 0n) {
    throw new RangeError("Reward amount cannot be negative");
  }
  if (floorTokenAmount <= 0n) {
    throw new RangeError("Eligibility floor must be positive");
  }

  const seen = new Set<string>();
  const scored = holders
    .map((holder) => {
      const normalized = normalizeAddress(holder.address);
      if (seen.has(normalized)) {
        throw new Error(`Duplicate holder address: ${holder.address}`);
      }
      seen.add(normalized);

      if (holder.minimumBalance < 0n) {
        throw new RangeError("Minimum balance cannot be negative");
      }

      const multiplierBps = streakMultiplierBps(holder.streak);
      const eligible =
        !holder.excluded &&
        holder.minimumBalance >= floorTokenAmount &&
        multiplierBps > 0n;
      const weight = eligible
        ? (holder.minimumBalance * multiplierBps) / BPS
        : 0n;

      return {
        ...holder,
        multiplierBps,
        weight,
      };
    })
    .filter((holder) => holder.weight > 0n);

  const totalWeight = scored.reduce((sum, holder) => sum + holder.weight, 0n);
  if (rewardAmount === 0n || totalWeight === 0n) {
    return {
      allocations: [],
      eligibleCount: scored.length,
      distributed: 0n,
      undistributed: rewardAmount,
      totalWeight,
    };
  }

  const provisional = scored.map((holder) => {
    const numerator = rewardAmount * holder.weight;
    return {
      holder,
      amount: numerator / totalWeight,
      remainder: numerator % totalWeight,
    };
  });

  const baseDistributed = provisional.reduce(
    (sum, item) => sum + item.amount,
    0n,
  );
  let dust = rewardAmount - baseDistributed;

  provisional.sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1;
    }
    return normalizeAddress(left.holder.address).localeCompare(
      normalizeAddress(right.holder.address),
    );
  });

  for (let index = 0; dust > 0n; index += 1) {
    const item = provisional[index % provisional.length];
    if (!item) break;
    item.amount += 1n;
    dust -= 1n;
  }

  const allocations: HolderAllocation[] = provisional
    .map(({ holder, amount }) => ({ ...holder, amount }))
    .sort((left, right) =>
      normalizeAddress(left.address).localeCompare(normalizeAddress(right.address)),
    );
  const distributed = allocations.reduce(
    (sum, allocation) => sum + allocation.amount,
    0n,
  );

  return {
    allocations,
    eligibleCount: allocations.length,
    distributed,
    undistributed: rewardAmount - distributed,
    totalWeight,
  };
}
