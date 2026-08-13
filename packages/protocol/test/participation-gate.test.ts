import { describe, expect, it } from "vitest";
import type { Address, CommunityScore, HolderScoreInput } from "../src/index.js";
import { applyParticipationGate } from "../src/index.js";

const alice = "0x0000000000000000000000000000000000000011" as Address;
const bob = "0x0000000000000000000000000000000000000022" as Address;
const carol = "0x0000000000000000000000000000000000000033" as Address;

function holder(
  address: Address,
  overrides: Partial<HolderScoreInput> = {},
): HolderScoreInput {
  return {
    address,
    minimumBalance: 10_000n,
    streak: 2,
    outboundTransfer: false,
    ...overrides,
  };
}

function score(
  address: Address,
  points: bigint,
  acceptedEvents: number,
): CommunityScore {
  return { address, points, acceptedEvents };
}

describe("historical participation gate compatibility", () => {
  it("applies the V5 threshold as a binary gate without changing holder weight", () => {
    const result = applyParticipationGate(
      [holder(carol, { excluded: true }), holder(bob), holder(alice)],
      [score(alice, 100n, 2), score(bob, 99n, 4), score(carol, 500n, 10)],
      { minimumPoints: 100n, minimumAcceptedEvents: 2 },
    );

    expect(result.participationQualifiedCount).toBe(1);
    expect(result.decisions.map((decision) => ({
      address: decision.address,
      pointsQualified: decision.pointsQualified,
      eventsQualified: decision.eventsQualified,
      holderExcluded: decision.holderExcluded,
      participationQualified: decision.participationQualified,
    }))).toEqual([
      {
        address: alice,
        pointsQualified: true,
        eventsQualified: true,
        holderExcluded: false,
        participationQualified: true,
      },
      {
        address: bob,
        pointsQualified: false,
        eventsQualified: true,
        holderExcluded: false,
        participationQualified: false,
      },
      {
        address: carol,
        pointsQualified: true,
        eventsQualified: true,
        holderExcluded: true,
        participationQualified: false,
      },
    ]);
    expect(result.holders[0]).toMatchObject({
      address: alice,
      minimumBalance: 10_000n,
      streak: 2,
      outboundTransfer: false,
      excluded: false,
    });
    expect(result.holders.slice(1).every((entry) => entry.excluded)).toBe(true);
  });

  it("treats a holder without a score as participation-ineligible", () => {
    const result = applyParticipationGate(
      [holder(alice)],
      [],
      { minimumPoints: 1n, minimumAcceptedEvents: 1 },
    );

    expect(result.participationQualifiedCount).toBe(0);
    expect(result.decisions[0]).toMatchObject({
      points: 0n,
      acceptedEvents: 0,
      pointsQualified: false,
      eventsQualified: false,
      participationQualified: false,
    });
    expect(result.holders[0]?.excluded).toBe(true);
  });

  it("rejects invalid thresholds and inconsistent scores", () => {
    expect(() => applyParticipationGate(
      [holder(alice)],
      [],
      { minimumPoints: 0n, minimumAcceptedEvents: 1 },
    )).toThrow("Participation point minimum must be positive");
    expect(() => applyParticipationGate(
      [holder(alice)],
      [],
      { minimumPoints: 1n, minimumAcceptedEvents: 0 },
    )).toThrow("Participation event minimum must be a positive safe integer");
    expect(() => applyParticipationGate(
      [holder(alice)],
      [score(alice, 1n, 0)],
      { minimumPoints: 1n, minimumAcceptedEvents: 1 },
    )).toThrow("Participation points and accepted event count are inconsistent");
  });

  it("rejects duplicate holder and score identities case-insensitively", () => {
    expect(() => applyParticipationGate(
      [holder(alice), holder(alice)],
      [],
      { minimumPoints: 1n, minimumAcceptedEvents: 1 },
    )).toThrow("Duplicate holder address");
    expect(() => applyParticipationGate(
      [holder(alice)],
      [score(alice, 1n, 1), score(alice, 2n, 2)],
      { minimumPoints: 1n, minimumAcceptedEvents: 1 },
    )).toThrow("Duplicate participation score");
  });
});
