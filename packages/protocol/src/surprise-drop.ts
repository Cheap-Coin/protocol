import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  isHex,
  keccak256,
  parseAbiParameters,
  size,
  type Hex,
} from "viem";
import type { Address } from "./types.js";

const UINT256_RANGE = 1n << 256n;

export interface SurpriseDropConfig {
  roundId: Hex;
  rewardAmount: bigint;
  winnerCount: number;
  minimumPoints: bigint;
  minimumAcceptedEvents: number;
  floorTokenAmount: bigint;
  holdingUnit: bigint;
  maximumHoldingUnits: bigint;
  maximumActivityPoints: bigint;
}

export interface SurpriseCandidate {
  address: Address;
  points: bigint;
  acceptedEvents: number;
  minimumBalance: bigint;
  excluded?: boolean;
}

export interface SurpriseCandidateDecision extends SurpriseCandidate {
  excluded: boolean;
  activityQualified: boolean;
  holdingQualified: boolean;
  activityWeight: bigint;
  holdingUnits: bigint;
  selectionWeight: bigint;
  eligible: boolean;
}

export interface SurpriseCandidateSet {
  candidateCommitment: Hex;
  decisions: SurpriseCandidateDecision[];
  eligibleCount: number;
  totalSelectionWeight: bigint;
}

export interface SurpriseWinner extends SurpriseCandidateDecision {
  draw: number;
  ticket: bigint;
  totalWeightAtDraw: bigint;
  randomWord: Hex;
  rejectionCount: number;
  amount: bigint;
}

export interface SurpriseDropResult extends SurpriseCandidateSet {
  seed: Hex;
  winners: SurpriseWinner[];
  distributed: bigint;
}

function addressKey(address: Address): string {
  return address.toLowerCase();
}

function assertBytes32(value: Hex, field: string): void {
  if (!isHex(value) || size(value) !== 32) {
    throw new TypeError(`${field} must be exactly 32 bytes`);
  }
}

function validateConfig(config: SurpriseDropConfig): void {
  assertBytes32(config.roundId, "Surprise round ID");
  if (config.rewardAmount <= 0n) throw new RangeError("Surprise reward amount must be positive");
  if (!Number.isSafeInteger(config.winnerCount) || config.winnerCount <= 0) {
    throw new RangeError("Surprise winner count must be a positive safe integer");
  }
  if (config.minimumPoints <= 0n) throw new RangeError("Minimum points must be positive");
  if (
    !Number.isSafeInteger(config.minimumAcceptedEvents) ||
    config.minimumAcceptedEvents <= 0
  ) {
    throw new RangeError("Minimum accepted events must be a positive safe integer");
  }
  if (config.floorTokenAmount <= 0n) throw new RangeError("Holding floor must be positive");
  if (config.holdingUnit <= 0n || config.holdingUnit > config.floorTokenAmount) {
    throw new RangeError("Holding unit must be positive and no larger than the floor");
  }
  if (config.maximumHoldingUnits <= 0n) {
    throw new RangeError("Maximum holding units must be positive");
  }
  if (config.maximumActivityPoints < config.minimumPoints) {
    throw new RangeError("Maximum activity points cannot be below the minimum");
  }
}

function normalizeCandidates(
  config: SurpriseDropConfig,
  candidates: readonly SurpriseCandidate[],
): SurpriseCandidateDecision[] {
  const seen = new Set<string>();
  return candidates.map((candidate) => {
    if (!isAddress(candidate.address)) {
      throw new TypeError(`Invalid surprise candidate address: ${candidate.address}`);
    }
    const address = getAddress(candidate.address) as Address;
    const key = addressKey(address);
    if (seen.has(key)) throw new Error(`Duplicate surprise candidate: ${address}`);
    seen.add(key);
    if (candidate.points < 0n) throw new RangeError("Candidate points cannot be negative");
    if (!Number.isSafeInteger(candidate.acceptedEvents) || candidate.acceptedEvents < 0) {
      throw new RangeError("Accepted events must be a non-negative safe integer");
    }
    if ((candidate.points === 0n) !== (candidate.acceptedEvents === 0)) {
      throw new Error("Candidate points and accepted events are inconsistent");
    }
    if (candidate.minimumBalance < 0n) {
      throw new RangeError("Candidate minimum balance cannot be negative");
    }

    const excluded = Boolean(candidate.excluded);
    const activityQualified =
      candidate.points >= config.minimumPoints &&
      candidate.acceptedEvents >= config.minimumAcceptedEvents;
    const holdingQualified = candidate.minimumBalance >= config.floorTokenAmount;
    const activityWeight = candidate.points < config.maximumActivityPoints
      ? candidate.points
      : config.maximumActivityPoints;
    const uncappedHoldingUnits = candidate.minimumBalance / config.holdingUnit;
    const holdingUnits = uncappedHoldingUnits < config.maximumHoldingUnits
      ? uncappedHoldingUnits
      : config.maximumHoldingUnits;
    const eligible = !excluded && activityQualified && holdingQualified;
    const selectionWeight = eligible ? activityWeight * holdingUnits : 0n;
    if (eligible && selectionWeight <= 0n) {
      throw new Error(`Eligible candidate has zero selection weight: ${address}`);
    }

    return {
      ...candidate,
      address,
      excluded,
      activityQualified,
      holdingQualified,
      activityWeight,
      holdingUnits,
      selectionWeight,
      eligible,
    };
  }).sort((left, right) => addressKey(left.address).localeCompare(addressKey(right.address)));
}

export function buildSurpriseCandidateSet(
  config: SurpriseDropConfig,
  candidates: readonly SurpriseCandidate[],
): SurpriseCandidateSet {
  validateConfig(config);
  if (candidates.length === 0) throw new Error("Surprise candidate set cannot be empty");
  const decisions = normalizeCandidates(config, candidates);
  const eligible = decisions.filter((candidate) => candidate.eligible);
  if (eligible.length <= config.winnerCount) {
    throw new Error(
      "Eligible candidate count must exceed the winner count so a Surprise Drop remains non-guaranteed",
    );
  }
  if (config.rewardAmount < BigInt(config.winnerCount)) {
    throw new RangeError("Surprise budget must fund at least one base unit per winner");
  }
  const totalSelectionWeight = eligible.reduce(
    (total, candidate) => total + candidate.selectionWeight,
    0n,
  );
  if (totalSelectionWeight <= 0n || totalSelectionWeight >= UINT256_RANGE) {
    throw new RangeError("Total surprise selection weight is outside the uint256 range");
  }

  const candidateCommitment = keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "bytes32 roundId, uint256 rewardAmount, uint256 winnerCount, uint256 minimumPoints, uint256 minimumAcceptedEvents, uint256 floorTokenAmount, uint256 holdingUnit, uint256 maximumHoldingUnits, uint256 maximumActivityPoints, address[] candidates, uint256[] points, uint256[] acceptedEvents, uint256[] minimumBalances, bool[] exclusions",
      ),
      [
        config.roundId,
        config.rewardAmount,
        BigInt(config.winnerCount),
        config.minimumPoints,
        BigInt(config.minimumAcceptedEvents),
        config.floorTokenAmount,
        config.holdingUnit,
        config.maximumHoldingUnits,
        config.maximumActivityPoints,
        decisions.map(({ address }) => address),
        decisions.map(({ points }) => points),
        decisions.map(({ acceptedEvents }) => BigInt(acceptedEvents)),
        decisions.map(({ minimumBalance }) => minimumBalance),
        decisions.map(({ excluded }) => excluded),
      ],
    ),
  );

  return {
    candidateCommitment,
    decisions,
    eligibleCount: eligible.length,
    totalSelectionWeight,
  };
}

export function deriveSurpriseSeed({
  candidateCommitment,
  entropyChainId,
  entropyBlockNumber,
  entropyBlockHash,
}: {
  candidateCommitment: Hex;
  entropyChainId: bigint;
  entropyBlockNumber: bigint;
  entropyBlockHash: Hex;
}): Hex {
  assertBytes32(candidateCommitment, "Candidate commitment");
  assertBytes32(entropyBlockHash, "Entropy block hash");
  if (entropyChainId <= 0n) throw new RangeError("Entropy chain ID must be positive");
  if (entropyBlockNumber <= 0n) throw new RangeError("Entropy block number must be positive");
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "string domain, bytes32 candidateCommitment, uint256 entropyChainId, uint256 entropyBlockNumber, bytes32 entropyBlockHash",
      ),
      [
        "CHEAP_SURPRISE_DROP_V1",
        candidateCommitment,
        entropyChainId,
        entropyBlockNumber,
        entropyBlockHash,
      ],
    ),
  );
}

function drawTicket(
  seed: Hex,
  draw: number,
  totalWeight: bigint,
): { ticket: bigint; randomWord: Hex; rejectionCount: number } {
  const acceptanceLimit = UINT256_RANGE - (UINT256_RANGE % totalWeight);
  for (let rejectionCount = 0; rejectionCount < 256; rejectionCount += 1) {
    const randomWord = keccak256(
      encodeAbiParameters(
        parseAbiParameters("string domain, bytes32 seed, uint256 draw, uint256 retry"),
        ["CHEAP_SURPRISE_DRAW_V1", seed, BigInt(draw), BigInt(rejectionCount)],
      ),
    );
    const value = BigInt(randomWord);
    if (value < acceptanceLimit) {
      return { ticket: value % totalWeight, randomWord, rejectionCount };
    }
  }
  throw new Error("Unable to derive an unbiased surprise ticket");
}

function assignWinnerAmounts(
  rewardAmount: bigint,
  selected: readonly Omit<SurpriseWinner, "amount">[],
): SurpriseWinner[] {
  const reserved = BigInt(selected.length);
  const proportionalPool = rewardAmount - reserved;
  const totalWeight = selected.reduce((total, winner) => total + winner.selectionWeight, 0n);
  const provisional = selected.map((winner) => {
    const numerator = proportionalPool * winner.selectionWeight;
    return {
      winner,
      amount: 1n + (numerator / totalWeight),
      remainder: numerator % totalWeight,
    };
  });
  let dust = rewardAmount - provisional.reduce((total, item) => total + item.amount, 0n);
  provisional.sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return addressKey(left.winner.address).localeCompare(addressKey(right.winner.address));
  });
  for (let index = 0; dust > 0n; index += 1) {
    const item = provisional[index % provisional.length];
    if (!item) throw new Error("Surprise winner allocation is unexpectedly empty");
    item.amount += 1n;
    dust -= 1n;
  }
  return provisional.map(({ winner, amount }) => ({ ...winner, amount }))
    .sort((left, right) => left.draw - right.draw);
}

export function selectSurpriseDrop({
  config,
  candidates,
  seed,
}: {
  config: SurpriseDropConfig;
  candidates: readonly SurpriseCandidate[];
  seed: Hex;
}): SurpriseDropResult {
  assertBytes32(seed, "Surprise seed");
  const candidateSet = buildSurpriseCandidateSet(config, candidates);
  const remaining = candidateSet.decisions.filter((candidate) => candidate.eligible);
  const selected: Omit<SurpriseWinner, "amount">[] = [];

  for (let draw = 0; draw < config.winnerCount; draw += 1) {
    const totalWeightAtDraw = remaining.reduce(
      (total, candidate) => total + candidate.selectionWeight,
      0n,
    );
    const random = drawTicket(seed, draw, totalWeightAtDraw);
    let cursor = 0n;
    const selectedIndex = remaining.findIndex((candidate) => {
      cursor += candidate.selectionWeight;
      return random.ticket < cursor;
    });
    if (selectedIndex < 0) throw new Error("Weighted surprise selection did not resolve");
    const [winner] = remaining.splice(selectedIndex, 1);
    if (!winner) throw new Error("Weighted surprise winner is missing");
    selected.push({
      ...winner,
      draw,
      ticket: random.ticket,
      totalWeightAtDraw,
      randomWord: random.randomWord,
      rejectionCount: random.rejectionCount,
    });
  }

  const winners = assignWinnerAmounts(config.rewardAmount, selected);
  const distributed = winners.reduce((total, winner) => total + winner.amount, 0n);
  if (distributed !== config.rewardAmount) {
    throw new Error("Surprise winner allocation did not distribute the exact budget");
  }
  return { ...candidateSet, seed, winners, distributed };
}
