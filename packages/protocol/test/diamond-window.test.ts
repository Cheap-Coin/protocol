import { describe, expect, it } from "vitest";
import { keccak256, stringToHex } from "viem";
import { deriveDiamondWindow } from "../src/index.js";

const input = {
  selectionId: keccak256(stringToHex("DIAMOND_WINDOW_1")),
  startBlock: 1_000n,
  minimumDurationBlocks: 100n,
  maximumDurationBlocks: 200n,
  entropyBlockNumber: 1_264n,
  entropyBlockHash: keccak256(stringToHex("future-finalized-robinhood-block")),
} as const;

describe("Diamond window selection", () => {
  it("selects a deterministic end inside published bounds", () => {
    const first = deriveDiamondWindow(input);
    const second = deriveDiamondWindow(input);

    expect(first).toEqual(second);
    expect(first.minimumEndBlock).toBe(1_099n);
    expect(first.maximumEndBlock).toBe(1_199n);
    expect(first.endBlock).toBeGreaterThanOrEqual(first.minimumEndBlock);
    expect(first.endBlock).toBeLessThanOrEqual(first.maximumEndBlock);
    expect(first.selectedDurationBlocks).toBe(
      first.endBlock - first.startBlock + 1n,
    );
  });

  it("requires future entropy after the longest possible window", () => {
    expect(() => deriveDiamondWindow({ ...input, entropyBlockNumber: 1_199n }))
      .toThrow(/must follow/);
  });

  it("rejects invalid duration bounds and malformed commitments", () => {
    expect(() => deriveDiamondWindow({
      ...input,
      minimumDurationBlocks: 201n,
    })).toThrow(/cannot be below/);
    expect(() => deriveDiamondWindow({
      ...input,
      selectionId: "0x1234",
    })).toThrow(/32 bytes/);
  });
});
