import { getAddress, isAddress, isHex, size } from "viem";
import type { Address } from "./types.js";

const BPS = 10_000n;
const actionPattern = /^[a-z][a-z0-9_]{0,31}$/;

export interface CommunityActionRule {
  action: string;
  points: bigint;
  perUtcDay: number;
  perRound: number;
}

export interface ApprovedCommunityEvent {
  eventCommitment: `0x${string}`;
  address: Address;
  action: string;
  occurredAt: number;
}

export interface AcceptedCommunityEvent extends ApprovedCommunityEvent {
  points: bigint;
}

export type CommunityRejectionReason =
  | "excluded_address"
  | "daily_cap"
  | "round_cap";

export interface RejectedCommunityEvent extends ApprovedCommunityEvent {
  reason: CommunityRejectionReason;
}

export interface CommunityScore {
  address: Address;
  points: bigint;
  acceptedEvents: number;
}

export interface CommunityScoringResult {
  contributors: CommunityScore[];
  acceptedEvents: AcceptedCommunityEvent[];
  rejectedEvents: RejectedCommunityEvent[];
  totalPoints: bigint;
}

export interface CommunityAllocation extends CommunityScore {
  amount: bigint;
}

export interface CommunityAllocationResult {
  allocations: CommunityAllocation[];
  contributorCount: number;
  distributed: bigint;
  undistributed: bigint;
  totalPoints: bigint;
}

export interface RewardAllocationInput {
  address: Address;
  amount: bigint;
}

export interface MergedRewardAllocations {
  allocations: RewardAllocationInput[];
  totalAmount: bigint;
}

function addressKey(address: Address): string {
  return address.toLowerCase();
}

function validateSafeCount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive safe integer`);
  }
}

function normalizeEvent(event: ApprovedCommunityEvent): ApprovedCommunityEvent {
  if (!isHex(event.eventCommitment) || size(event.eventCommitment) !== 32) {
    throw new TypeError("Community event commitment must be exactly 32 bytes");
  }
  if (!isAddress(event.address)) {
    throw new TypeError(`Invalid community reward address: ${event.address}`);
  }
  if (!actionPattern.test(event.action)) {
    throw new TypeError(`Invalid community action: ${event.action}`);
  }
  if (!Number.isSafeInteger(event.occurredAt) || event.occurredAt < 0) {
    throw new RangeError("Community event time must be a non-negative Unix timestamp");
  }
  return {
    ...event,
    eventCommitment: event.eventCommitment.toLowerCase() as `0x${string}`,
    address: getAddress(event.address) as Address,
  };
}

/**
 * Scores an already approved set of community actions. OAuth ownership,
 * wallet-signature verification, source retrieval, and human anti-Sybil review
 * happen before this deterministic boundary.
 */
export function scoreCommunityContributions({
  startTime,
  endTime,
  rules,
  events,
  excludedAddresses = new Set(),
}: {
  startTime: number;
  endTime: number;
  rules: readonly CommunityActionRule[];
  events: readonly ApprovedCommunityEvent[];
  excludedAddresses?: ReadonlySet<string>;
}): CommunityScoringResult {
  if (
    !Number.isSafeInteger(startTime) ||
    !Number.isSafeInteger(endTime) ||
    startTime < 0 ||
    endTime < startTime
  ) {
    throw new RangeError("Community round timestamps are invalid");
  }
  if (rules.length === 0) throw new Error("At least one community action rule is required");

  const ruleByAction = new Map<string, CommunityActionRule>();
  for (const rule of rules) {
    if (!actionPattern.test(rule.action)) {
      throw new TypeError(`Invalid community action rule: ${rule.action}`);
    }
    if (ruleByAction.has(rule.action)) {
      throw new Error(`Duplicate community action rule: ${rule.action}`);
    }
    if (rule.points <= 0n) throw new RangeError("Community action points must be positive");
    validateSafeCount(rule.perUtcDay, "Daily action cap");
    validateSafeCount(rule.perRound, "Round action cap");
    if (rule.perUtcDay > rule.perRound) {
      throw new RangeError("Daily action cap cannot exceed the round cap");
    }
    ruleByAction.set(rule.action, rule);
  }

  const excluded = new Set<string>();
  for (const candidate of excludedAddresses) {
    if (!isAddress(candidate)) throw new TypeError(`Invalid excluded address: ${candidate}`);
    excluded.add(candidate.toLowerCase());
  }

  const seenCommitments = new Set<string>();
  const normalizedEvents = events.map((event) => {
    const normalized = normalizeEvent(event);
    const commitment = normalized.eventCommitment.toLowerCase();
    if (seenCommitments.has(commitment)) {
      throw new Error(`Duplicate community event commitment: ${normalized.eventCommitment}`);
    }
    seenCommitments.add(commitment);
    if (!ruleByAction.has(normalized.action)) {
      throw new Error(`No scoring rule for community action: ${normalized.action}`);
    }
    if (normalized.occurredAt < startTime || normalized.occurredAt > endTime) {
      throw new RangeError(`Community event is outside the round: ${normalized.eventCommitment}`);
    }
    return normalized;
  }).sort((left, right) =>
    left.occurredAt !== right.occurredAt
      ? left.occurredAt - right.occurredAt
      : left.eventCommitment.localeCompare(right.eventCommitment),
  );

  const dailyCounts = new Map<string, number>();
  const roundCounts = new Map<string, number>();
  const scoreByAddress = new Map<string, CommunityScore>();
  const acceptedEvents: AcceptedCommunityEvent[] = [];
  const rejectedEvents: RejectedCommunityEvent[] = [];

  for (const event of normalizedEvents) {
    const wallet = addressKey(event.address);
    const rule = ruleByAction.get(event.action);
    if (!rule) throw new Error(`Missing validated action rule: ${event.action}`);
    if (excluded.has(wallet)) {
      rejectedEvents.push({ ...event, reason: "excluded_address" });
      continue;
    }

    const roundKey = `${wallet}:${event.action}`;
    const day = Math.floor(event.occurredAt / 86_400);
    const dayKey = `${roundKey}:${day}`;
    const usedToday = dailyCounts.get(dayKey) ?? 0;
    const usedThisRound = roundCounts.get(roundKey) ?? 0;
    if (usedToday >= rule.perUtcDay) {
      rejectedEvents.push({ ...event, reason: "daily_cap" });
      continue;
    }
    if (usedThisRound >= rule.perRound) {
      rejectedEvents.push({ ...event, reason: "round_cap" });
      continue;
    }

    dailyCounts.set(dayKey, usedToday + 1);
    roundCounts.set(roundKey, usedThisRound + 1);
    acceptedEvents.push({ ...event, points: rule.points });
    const current = scoreByAddress.get(wallet);
    scoreByAddress.set(wallet, {
      address: event.address,
      points: (current?.points ?? 0n) + rule.points,
      acceptedEvents: (current?.acceptedEvents ?? 0) + 1,
    });
  }

  const contributors = [...scoreByAddress.values()].sort((left, right) =>
    addressKey(left.address).localeCompare(addressKey(right.address)),
  );
  return {
    contributors,
    acceptedEvents,
    rejectedEvents,
    totalPoints: contributors.reduce((total, contributor) => total + contributor.points, 0n),
  };
}

export function allocateCommunityPool(
  rewardAmount: bigint,
  scores: readonly CommunityScore[],
): CommunityAllocationResult {
  if (rewardAmount < 0n) throw new RangeError("Community reward amount cannot be negative");

  const seen = new Set<string>();
  const eligible = scores.map((score) => {
    if (!isAddress(score.address)) {
      throw new TypeError(`Invalid community reward address: ${score.address}`);
    }
    const address = getAddress(score.address) as Address;
    const normalized = addressKey(address);
    if (seen.has(normalized)) throw new Error(`Duplicate community score: ${address}`);
    seen.add(normalized);
    if (score.points < 0n) throw new RangeError("Community points cannot be negative");
    if (!Number.isSafeInteger(score.acceptedEvents) || score.acceptedEvents < 0) {
      throw new RangeError("Accepted event count must be a non-negative safe integer");
    }
    if ((score.points === 0n) !== (score.acceptedEvents === 0)) {
      throw new Error("Community points and accepted event count are inconsistent");
    }
    return { ...score, address };
  }).filter((score) => score.points > 0n);

  const totalPoints = eligible.reduce((total, score) => total + score.points, 0n);
  if (rewardAmount === 0n || totalPoints === 0n) {
    return {
      allocations: [],
      contributorCount: eligible.length,
      distributed: 0n,
      undistributed: rewardAmount,
      totalPoints,
    };
  }
  if (rewardAmount < BigInt(eligible.length)) {
    throw new RangeError("Community budget must fund at least one unit per contributor");
  }

  const provisional = eligible.map((score) => {
    const numerator = rewardAmount * score.points;
    return {
      score,
      amount: numerator / totalPoints,
      remainder: numerator % totalPoints,
    };
  });
  const baseDistributed = provisional.reduce((total, item) => total + item.amount, 0n);
  let dust = rewardAmount - baseDistributed;
  provisional.sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return addressKey(left.score.address).localeCompare(addressKey(right.score.address));
  });
  for (let index = 0; dust > 0n; index += 1) {
    const item = provisional[index % provisional.length];
    if (!item) break;
    item.amount += 1n;
    dust -= 1n;
  }

  const allocations = provisional.map(({ score, amount }) => ({ ...score, amount }))
    .sort((left, right) => addressKey(left.address).localeCompare(addressKey(right.address)));
  const distributed = allocations.reduce((total, allocation) => total + allocation.amount, 0n);
  return {
    allocations,
    contributorCount: allocations.length,
    distributed,
    undistributed: rewardAmount - distributed,
    totalPoints,
  };
}

export function splitHolderCommunityBudget(
  rewardAmount: bigint,
  communityBps: number,
): { holderAmount: bigint; communityAmount: bigint } {
  if (rewardAmount < 0n) throw new RangeError("Reward amount cannot be negative");
  if (!Number.isSafeInteger(communityBps) || communityBps < 0 || communityBps > 10_000) {
    throw new RangeError("Community share must be between 0 and 10,000 basis points");
  }
  const communityAmount = (rewardAmount * BigInt(communityBps)) / BPS;
  return { holderAmount: rewardAmount - communityAmount, communityAmount };
}

export function mergeRewardAllocations(
  ...pools: ReadonlyArray<readonly RewardAllocationInput[]>
): MergedRewardAllocations {
  const merged = new Map<string, RewardAllocationInput>();
  for (const pool of pools) {
    for (const allocation of pool) {
      if (!isAddress(allocation.address)) {
        throw new TypeError(`Invalid reward address: ${allocation.address}`);
      }
      if (allocation.amount <= 0n) {
        throw new RangeError("Merged reward amounts must be positive");
      }
      const address = getAddress(allocation.address) as Address;
      const normalized = addressKey(address);
      const existing = merged.get(normalized);
      merged.set(normalized, {
        address,
        amount: (existing?.amount ?? 0n) + allocation.amount,
      });
    }
  }
  const allocations = [...merged.values()].sort((left, right) =>
    addressKey(left.address).localeCompare(addressKey(right.address)),
  );
  return {
    allocations,
    totalAmount: allocations.reduce((total, allocation) => total + allocation.amount, 0n),
  };
}
