export type Address = `0x${string}`;

export interface HolderScoreInput {
  address: Address;
  minimumBalance: bigint;
  streak: number;
  outboundTransfer?: boolean;
  excluded?: boolean;
}
export interface HolderAllocation extends HolderScoreInput {
  multiplierBps: bigint;
  weight: bigint;
  amount: bigint;
}

export interface AllocationResult {
  allocations: HolderAllocation[];
  eligibleCount: number;
  distributed: bigint;
  undistributed: bigint;
  totalWeight: bigint;
}

export interface TrackedHolder {
  address: Address;
  balance: bigint;
  minimumBalance: bigint;
  outboundTransfer: boolean;
}
