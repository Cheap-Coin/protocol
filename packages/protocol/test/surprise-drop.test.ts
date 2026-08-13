import { describe, expect, it } from "vitest";
import { getAddress, keccak256, stringToHex } from "viem";
import {
  buildSurpriseCandidateSet,
  deriveSurpriseSeed,
  selectSurpriseDrop,
  type Address,
  type SurpriseCandidate,
  type SurpriseDropConfig,
} from "../src/index.js";

const config: SurpriseDropConfig = {
  roundId: keccak256(stringToHex("SURPRISE_ROUND_1")),
  rewardAmount: 1_000_000n,
  winnerCount: 2,
  minimumPoints: 5n,
  minimumAcceptedEvents: 1,
  floorTokenAmount: 100n,
  holdingUnit: 100n,
  maximumHoldingUnits: 10n,
  maximumActivityPoints: 20n,
};

function wallet(index: number): Address {
  return getAddress(`0x${index.toString(16).padStart(40, "0")}`) as Address;
}

const candidates: SurpriseCandidate[] = [
  { address: wallet(1), points: 5n, acceptedEvents: 1, minimumBalance: 100n },
  { address: wallet(2), points: 10n, acceptedEvents: 2, minimumBalance: 200n },
  { address: wallet(3), points: 20n, acceptedEvents: 4, minimumBalance: 1_000n },
  { address: wallet(4), points: 4n, acceptedEvents: 1, minimumBalance: 10_000n },
  { address: wallet(5), points: 20n, acceptedEvents: 4, minimumBalance: 1_000n, excluded: true },
];

describe("Bagworker Surprise Drop", () => {
  it("caps activity and holding while requiring both gates", () => {
    const set = buildSurpriseCandidateSet(config, candidates);
    expect(set.eligibleCount).toBe(3);
    expect(set.totalSelectionWeight).toBe(225n);
    expect(set.decisions).toEqual([
      expect.objectContaining({ address: wallet(1), selectionWeight: 5n, eligible: true }),
      expect.objectContaining({ address: wallet(2), selectionWeight: 20n, eligible: true }),
      expect.objectContaining({ address: wallet(3), selectionWeight: 200n, eligible: true }),
      expect.objectContaining({ address: wallet(4), selectionWeight: 0n, eligible: false }),
      expect.objectContaining({ address: wallet(5), selectionWeight: 0n, eligible: false }),
    ]);
  });

  it("derives a reproducible external entropy seed and exact winner budget", () => {
    const candidateSet = buildSurpriseCandidateSet(config, candidates);
    const seed = deriveSurpriseSeed({
      candidateCommitment: candidateSet.candidateCommitment,
      entropyChainId: 1n,
      entropyBlockNumber: 25_000_000n,
      entropyBlockHash: keccak256(stringToHex("future-finalized-l1-block")),
    });
    const forward = selectSurpriseDrop({ config, candidates, seed });
    const reversed = selectSurpriseDrop({ config, candidates: [...candidates].reverse(), seed });

    expect(forward).toEqual(reversed);
    expect(forward.winners).toHaveLength(config.winnerCount);
    expect(new Set(forward.winners.map(({ address }) => address)).size).toBe(config.winnerCount);
    expect(forward.winners.every(({ amount }) => amount > 0n)).toBe(true);
    expect(forward.distributed).toBe(config.rewardAmount);
  });

  it("refuses a guaranteed or underfunded random round", () => {
    expect(() => buildSurpriseCandidateSet(
      { ...config, winnerCount: 3 },
      candidates,
    )).toThrow(/must exceed the winner count/);
    expect(() => buildSurpriseCandidateSet(
      { ...config, rewardAmount: 1n },
      candidates,
    )).toThrow(/one base unit per winner/);
  });

  it("fails closed on duplicates and inconsistent contribution records", () => {
    expect(() => buildSurpriseCandidateSet(config, [candidates[0]!, candidates[0]!]))
      .toThrow(/Duplicate surprise candidate/);
    expect(() => buildSurpriseCandidateSet(config, [
      ...candidates.slice(0, 3),
      { address: wallet(6), points: 1n, acceptedEvents: 0, minimumBalance: 100n },
    ])).toThrow(/inconsistent/);
  });
});
