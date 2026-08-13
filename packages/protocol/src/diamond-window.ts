import {
  encodeAbiParameters,
  isHex,
  keccak256,
  parseAbiParameters,
  size,
  type Hex,
} from "viem";

const UINT256_RANGE = 1n << 256n;

export interface DiamondWindowSelectionInput {
  selectionId: Hex;
  startBlock: bigint;
  minimumDurationBlocks: bigint;
  maximumDurationBlocks: bigint;
  entropyBlockNumber: bigint;
  entropyBlockHash: Hex;
}

export interface DiamondWindowSelection extends DiamondWindowSelectionInput {
  minimumEndBlock: bigint;
  maximumEndBlock: bigint;
  selectedDurationBlocks: bigint;
  endBlock: bigint;
  randomWord: Hex;
  rejectionCount: number;
}

function assertBytes32(value: Hex, field: string): void {
  if (!isHex(value) || size(value) !== 32) {
    throw new TypeError(`${field} must be exactly 32 bytes`);
  }
}

/**
 * Selects an inclusive Diamond Drop end block from published duration bounds.
 * The entropy block must occur after the longest possible window, preventing an
 * operator from choosing the end after observing which wallets transferred.
 */
export function deriveDiamondWindow(
  input: DiamondWindowSelectionInput,
): DiamondWindowSelection {
  assertBytes32(input.selectionId, "Diamond selection ID");
  assertBytes32(input.entropyBlockHash, "Diamond entropy block hash");
  if (input.startBlock < 0n) throw new RangeError("Diamond start block cannot be negative");
  if (input.minimumDurationBlocks <= 0n) {
    throw new RangeError("Minimum Diamond duration must be positive");
  }
  if (input.maximumDurationBlocks < input.minimumDurationBlocks) {
    throw new RangeError("Maximum Diamond duration cannot be below the minimum");
  }

  const minimumEndBlock = input.startBlock + input.minimumDurationBlocks - 1n;
  const maximumEndBlock = input.startBlock + input.maximumDurationBlocks - 1n;
  if (input.entropyBlockNumber <= maximumEndBlock) {
    throw new RangeError("Diamond entropy block must follow the maximum possible end block");
  }

  const outcomeCount = input.maximumDurationBlocks - input.minimumDurationBlocks + 1n;
  const acceptanceLimit = UINT256_RANGE - (UINT256_RANGE % outcomeCount);
  for (let rejectionCount = 0; rejectionCount < 256; rejectionCount += 1) {
    const randomWord = keccak256(
      encodeAbiParameters(
        parseAbiParameters(
          "string domain, bytes32 selectionId, uint256 startBlock, uint256 minimumDurationBlocks, uint256 maximumDurationBlocks, uint256 entropyBlockNumber, bytes32 entropyBlockHash, uint256 retry",
        ),
        [
          "CHEAP_DIAMOND_WINDOW_V1",
          input.selectionId,
          input.startBlock,
          input.minimumDurationBlocks,
          input.maximumDurationBlocks,
          input.entropyBlockNumber,
          input.entropyBlockHash,
          BigInt(rejectionCount),
        ],
      ),
    );
    const value = BigInt(randomWord);
    if (value < acceptanceLimit) {
      const selectedDurationBlocks = input.minimumDurationBlocks + (value % outcomeCount);
      return {
        ...input,
        minimumEndBlock,
        maximumEndBlock,
        selectedDurationBlocks,
        endBlock: input.startBlock + selectedDurationBlocks - 1n,
        randomWord,
        rejectionCount,
      };
    }
  }
  throw new Error("Unable to derive an unbiased Diamond window");
}
