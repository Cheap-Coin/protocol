import { getAddress, isAddress } from "viem";
import type { CommunityScore } from "./community-rewards.js";
import type { Address, HolderScoreInput } from "./types.js";

export interface ParticipationThreshold {
  minimumPoints: bigint;
  minimumAcceptedEvents: number;
}

export interface ParticipationGateDecision extends ParticipationThreshold {
  address: Address;
  points: bigint;
  acceptedEvents: number;
  holderExcluded: boolean;
  pointsQualified: boolean;
  eventsQualified: boolean;
  participationQualified: boolean;
}

export interface ParticipationGateResult {
  holders: HolderScoreInput[];
  decisions: ParticipationGateDecision[];
  participationQualifiedCount: number;
}

function addressKey(address: string): string {
  return address.toLowerCase();
}

function validateThreshold(threshold: ParticipationThreshold): void {
  if (threshold.minimumPoints <= 0n) {
    throw new RangeError("Participation point minimum must be positive");
  }
  if (
    !Number.isSafeInteger(threshold.minimumAcceptedEvents) ||
    threshold.minimumAcceptedEvents <= 0
  ) {
    throw new RangeError("Participation event minimum must be a positive safe integer");
  }
}

function normalizeScores(scores: readonly CommunityScore[]): Map<string, CommunityScore> {
  const normalized = new Map<string, CommunityScore>();
  for (const score of scores) {
    if (!isAddress(score.address)) {
      throw new TypeError(`Invalid participation address: ${score.address}`);
    }
    if (score.points < 0n) {
      throw new RangeError("Participation points cannot be negative");
    }
    if (!Number.isSafeInteger(score.acceptedEvents) || score.acceptedEvents < 0) {
      throw new RangeError("Accepted event count must be a non-negative safe integer");
    }
    if ((score.points === 0n) !== (score.acceptedEvents === 0)) {
      throw new Error("Participation points and accepted event count are inconsistent");
    }

    const address = getAddress(score.address) as Address;
    const key = addressKey(address);
    if (normalized.has(key)) throw new Error(`Duplicate participation score: ${address}`);
    normalized.set(key, { ...score, address });
  }
  return normalized;
}

/**
 * Reproduces the binary participation gate used by historical V5 artifacts.
 * This is compatibility logic only: V6 Diamond Drops are holding-only and V7
 * Surprise Drops use capped weighted-random selection instead.
 *
 * Points do not multiply holder weight. The returned holder set can be passed
 * to allocateHolderPool, where exclusions, the balance floor, and the holding
 * streak remain independently enforced.
 *
 * @deprecated Use the V6 strict Diamond or V7 Surprise artifact logic for new drops.
 */
export function applyParticipationGate(
  holders: readonly HolderScoreInput[],
  scores: readonly CommunityScore[],
  threshold: ParticipationThreshold,
): ParticipationGateResult {
  validateThreshold(threshold);
  const scoreByAddress = normalizeScores(scores);
  const seenHolders = new Set<string>();

  const evaluated = holders.map((holder) => {
    if (!isAddress(holder.address)) {
      throw new TypeError(`Invalid holder address: ${holder.address}`);
    }
    const address = getAddress(holder.address) as Address;
    const key = addressKey(address);
    if (seenHolders.has(key)) throw new Error(`Duplicate holder address: ${address}`);
    seenHolders.add(key);

    const score = scoreByAddress.get(key);
    const points = score?.points ?? 0n;
    const acceptedEvents = score?.acceptedEvents ?? 0;
    const holderExcluded = Boolean(holder.excluded);
    const pointsQualified = points >= threshold.minimumPoints;
    const eventsQualified = acceptedEvents >= threshold.minimumAcceptedEvents;
    const participationQualified = !holderExcluded && pointsQualified && eventsQualified;

    return {
      holder: {
        ...holder,
        address,
        excluded: !participationQualified,
      } satisfies HolderScoreInput,
      decision: {
        address,
        points,
        acceptedEvents,
        minimumPoints: threshold.minimumPoints,
        minimumAcceptedEvents: threshold.minimumAcceptedEvents,
        holderExcluded,
        pointsQualified,
        eventsQualified,
        participationQualified,
      } satisfies ParticipationGateDecision,
    };
  }).sort((left, right) =>
    addressKey(left.holder.address).localeCompare(addressKey(right.holder.address)),
  );

  return {
    holders: evaluated.map(({ holder }) => holder),
    decisions: evaluated.map(({ decision }) => decision),
    participationQualifiedCount: evaluated.filter(
      ({ decision }) => decision.participationQualified,
    ).length,
  };
}
