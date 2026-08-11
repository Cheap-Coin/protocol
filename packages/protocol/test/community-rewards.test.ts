import { describe, expect, it } from "vitest";
import { getAddress, keccak256, stringToHex } from "viem";
import {
  allocateCommunityPool,
  mergeRewardAllocations,
  scoreCommunityContributions,
  splitHolderCommunityBudget,
  type Address,
  type ApprovedCommunityEvent,
} from "../src/index.js";

const alice = getAddress("0x00000000000000000000000000000000000000a1") as Address;
const bob = getAddress("0x00000000000000000000000000000000000000b2") as Address;
const startTime = 10 * 86_400;
const endTime = 14 * 86_400;

function event(
  id: string,
  address: Address,
  action: string,
  occurredAt: number,
): ApprovedCommunityEvent {
  return {
    eventCommitment: keccak256(stringToHex(id)),
    address,
    action,
    occurredAt,
  };
}

const rules = [
  { action: "original_post", points: 5n, perUtcDay: 1, perRound: 2 },
  { action: "reply", points: 1n, perUtcDay: 2, perRound: 4 },
] as const;

describe("community contribution scoring", () => {
  it("is deterministic and applies daily, round, and exclusion caps", () => {
    const events = [
      event("post-day-10-a", alice, "original_post", startTime + 1),
      event("post-day-10-b", alice, "original_post", startTime + 2),
      event("post-day-11", alice, "original_post", startTime + 86_400 + 1),
      event("post-day-12", alice, "original_post", startTime + 172_800 + 1),
      event("reply-day-10", alice, "reply", startTime + 3),
      event("excluded", bob, "reply", startTime + 4),
    ];
    const input = {
      startTime,
      endTime,
      rules,
      excludedAddresses: new Set([bob]),
    };
    const forward = scoreCommunityContributions({ ...input, events });
    const reversed = scoreCommunityContributions({ ...input, events: [...events].reverse() });

    expect(forward).toEqual(reversed);
    expect(forward.contributors).toEqual([
      { address: alice, points: 11n, acceptedEvents: 3 },
    ]);
    expect(forward.totalPoints).toBe(11n);
    expect(forward.rejectedEvents.map(({ reason }) => reason).sort()).toEqual([
      "daily_cap",
      "excluded_address",
      "round_cap",
    ]);
  });

  it("fails closed on duplicates, unknown actions, and out-of-round events", () => {
    const valid = event("same", alice, "reply", startTime + 1);
    expect(() => scoreCommunityContributions({
      startTime,
      endTime,
      rules,
      events: [valid, valid],
    })).toThrow(/Duplicate community event/);
    expect(() => scoreCommunityContributions({
      startTime,
      endTime,
      rules,
      events: [event("unknown", alice, "like", startTime + 1)],
    })).toThrow(/No scoring rule/);
    expect(() => scoreCommunityContributions({
      startTime,
      endTime,
      rules,
      events: [event("late", alice, "reply", endTime + 1)],
    })).toThrow(/outside the round/);
  });
});

describe("community reward allocation", () => {
  const scores = [
    { address: alice, points: 10n, acceptedEvents: 2 },
    { address: bob, points: 5n, acceptedEvents: 1 },
  ];

  it("distributes every unit deterministically by score", () => {
    const forward = allocateCommunityPool(101n, scores);
    const reversed = allocateCommunityPool(101n, [...scores].reverse());
    expect(forward).toEqual(reversed);
    expect(forward.allocations.map(({ address, amount }) => [address, amount])).toEqual([
      [alice, 67n],
      [bob, 34n],
    ]);
    expect(forward).toMatchObject({
      contributorCount: 2,
      distributed: 101n,
      undistributed: 0n,
      totalPoints: 15n,
    });
  });

  it("keeps an unfundable pool explicit", () => {
    expect(allocateCommunityPool(10n, [])).toMatchObject({
      allocations: [],
      distributed: 0n,
      undistributed: 10n,
    });
  });

  it("splits budgets and merges overlapping holder and contributor payouts", () => {
    expect(splitHolderCommunityBudget(101n, 2_500)).toEqual({
      holderAmount: 76n,
      communityAmount: 25n,
    });
    expect(mergeRewardAllocations(
      [{ address: alice, amount: 76n }],
      [
        { address: alice, amount: 10n },
        { address: bob, amount: 15n },
      ],
    )).toEqual({
      allocations: [
        { address: alice, amount: 86n },
        { address: bob, amount: 15n },
      ],
      totalAmount: 101n,
    });
  });

  it("preserves exact totals across deterministic fuzz cases", () => {
    let state = 0x5eed1234;
    const next = () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state;
    };

    for (let run = 0; run < 250; run += 1) {
      const count = (next() % 20) + 1;
      const fuzzScores = Array.from({ length: count }, (_, index) => ({
        address: getAddress(`0x${(index + 1).toString(16).padStart(40, "0")}`) as Address,
        points: BigInt((next() % 100_000) + 1),
        acceptedEvents: (next() % 50) + 1,
      }));
      const rewardAmount = BigInt(count + (next() % 1_000_000));
      const allocation = allocateCommunityPool(rewardAmount, fuzzScores);
      expect(allocation.distributed).toBe(rewardAmount);
      expect(allocation.undistributed).toBe(0n);
      expect(allocation.allocations.every(({ amount }) => amount > 0n)).toBe(true);
      expect(allocateCommunityPool(rewardAmount, [...fuzzScores].reverse())).toEqual(
        allocation,
      );

      const communityBps = next() % 10_001;
      const split = splitHolderCommunityBudget(rewardAmount, communityBps);
      expect(split.holderAmount + split.communityAmount).toBe(rewardAmount);
    }
  });
});
