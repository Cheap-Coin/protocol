import { describe, expect, it } from "vitest";
import {
  allocateHolderPool,
  buildDistributionCommitment,
  HoldingWindow,
  hashDistributionBatch,
  splitCreatorFees,
  streakMultiplierBps,
  verifySortedMerkleProof,
  type Address,
} from "../src/index.js";
import { keccak256, stringToHex, type Hex } from "viem";

const alice = "0x00000000000000000000000000000000000000a1" as Address;
const bob = "0x00000000000000000000000000000000000000b2" as Address;
const carol = "0x00000000000000000000000000000000000000c3" as Address;

describe("fee splitting", () => {
  it("routes exactly 25% to the creator and all rounding dust to holders", () => {
    expect(splitCreatorFees(101n)).toEqual({
      creatorAmount: 25n,
      holderAmount: 76n,
    });
  });

  it("rejects negative values", () => {
    expect(() => splitCreatorFees(-1n)).toThrow(RangeError);
  });
});

describe("streak multipliers", () => {
  it.each([
    [0, 0n],
    [1, 10_000n],
    [2, 11_500n],
    [3, 13_000n],
    [4, 15_000n],
    [5, 17_500n],
    [9, 17_500n],
    [10, 20_000n],
  ])("maps streak %s to %s bps", (streak, expected) => {
    expect(streakMultiplierBps(streak)).toBe(expected);
  });
});

describe("holder allocation", () => {
  it("excludes wallets below the floor and distributes every reward unit", () => {
    const result = allocateHolderPool(101n, 50n, [
      { address: alice, minimumBalance: 100n, streak: 1 },
      { address: bob, minimumBalance: 100n, streak: 2 },
      { address: carol, minimumBalance: 49n, streak: 10 },
    ]);

    expect(result.eligibleCount).toBe(2);
    expect(result.distributed).toBe(101n);
    expect(result.undistributed).toBe(0n);
    expect(result.allocations.map(({ address, amount }) => [address, amount])).toEqual([
      [alice, 47n],
      [bob, 54n],
    ]);
  });

  it("excludes protocol-controlled addresses regardless of balance", () => {
    const result = allocateHolderPool(100n, 50n, [
      { address: alice, minimumBalance: 1_000n, streak: 10, excluded: true },
      { address: bob, minimumBalance: 100n, streak: 1 },
    ]);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]?.address).toBe(bob);
    expect(result.allocations[0]?.amount).toBe(100n);
  });

  it("rejects duplicate addresses case-insensitively", () => {
    expect(() =>
      allocateHolderPool(100n, 50n, [
        { address: alice, minimumBalance: 100n, streak: 1 },
        {
          address: alice.toUpperCase().replace("0X", "0x") as Address,
          minimumBalance: 100n,
          streak: 1,
        },
      ]),
    ).toThrow(/Duplicate holder/);
  });
});

describe("continuous holding window", () => {
  it("records the lowest balance after sells and does not restore it on rebuy", () => {
    const window = new HoldingWindow(
      new Map<Address, bigint>([
        [alice, 100n],
        [bob, 50n],
      ]),
    );

    window.applyTransfer(alice, bob, 40n);
    window.applyTransfer(bob, alice, 20n);

    expect(window.get(alice)).toMatchObject({ balance: 80n, minimumBalance: 60n });
    expect(window.get(bob)).toMatchObject({ balance: 70n, minimumBalance: 50n });
  });

  it("keeps a new mid-window buyer at a zero minimum until the next window", () => {
    const window = new HoldingWindow(new Map([[alice, 100n]]));
    window.applyTransfer(alice, carol, 25n);
    expect(window.get(carol)).toMatchObject({ balance: 25n, minimumBalance: 0n });
  });

  it("rejects case-insensitive duplicate starting holders", () => {
    expect(
      () => new HoldingWindow(new Map<Address, bigint>([
        [alice, 100n],
        [alice.toUpperCase().replace("0X", "0x") as Address, 100n],
      ])),
    ).toThrow(/Duplicate initial holder/);
  });
});

describe("distribution commitments", () => {
  const dropId = keccak256(stringToHex("CHEAP_DROP_1"));

  it("builds verifiable allocation and Safe-approved batch proofs", () => {
    const commitment = buildDistributionCommitment(
      dropId,
      [
        { address: carol, amount: 30n },
        { address: alice, amount: 10n },
        { address: bob, amount: 20n },
      ],
      2,
    );

    expect(commitment.totalAmount).toBe(60n);
    expect(commitment.batches).toHaveLength(2);
    for (const entry of commitment.entries) {
      expect(
        verifySortedMerkleProof(
          entry.leaf,
          entry.proof,
          commitment.allocationRoot,
        ),
      ).toBe(true);
    }
    for (const batch of commitment.batches) {
      expect(
        verifySortedMerkleProof(batch.leaf, batch.proof, commitment.batchesRoot),
      ).toBe(true);
    }
  });

  it("invalidates a batch proof when an operator changes an amount", () => {
    const commitment = buildDistributionCommitment(dropId, [
      { address: alice, amount: 10n },
      { address: bob, amount: 20n },
    ]);
    const approved = commitment.batches[0];
    expect(approved).toBeDefined();
    if (!approved) return;

    const changed = hashDistributionBatch(
      dropId,
      approved.index,
      approved.recipients,
      [11n, 19n],
    );
    expect(
      verifySortedMerkleProof(
        changed.leaf,
        approved.proof,
        commitment.batchesRoot,
      ),
    ).toBe(false);
  });

  it("rejects duplicates, empty inputs, and over-sized batch settings", () => {
    expect(() => buildDistributionCommitment(dropId, [])).toThrow(/at least one/);
    expect(() =>
      buildDistributionCommitment(dropId, [
        { address: alice, amount: 10n },
        { address: alice.toUpperCase().replace("0X", "0x") as Address, amount: 20n },
      ]),
    ).toThrow(/Duplicate reward address/);
    expect(() =>
      buildDistributionCommitment(dropId, [{ address: alice, amount: 10n }], 201),
    ).toThrow(/between 1 and 200/);
    expect(() =>
      buildDistributionCommitment("0x1234" as Hex, [{ address: alice, amount: 10n }]),
    ).toThrow(/32 bytes/);
  });
});
