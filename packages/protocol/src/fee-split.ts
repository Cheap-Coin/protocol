export const BASIS_POINTS = 10_000n;
export const CREATOR_SHARE_BPS = 2_500n;
export const HOLDER_SHARE_BPS = BASIS_POINTS - CREATOR_SHARE_BPS;

export interface FeeSplit {
  creatorAmount: bigint;
  holderAmount: bigint;
}
/**
 * Splits an integer token amount without losing dust. Rounding dust always
 * remains in the holder pool so creator proceeds can never exceed 25%.
 */
export function splitCreatorFees(amount: bigint): FeeSplit {
  if (amount < 0n) {
    throw new RangeError("Fee amount cannot be negative");
  }

  const creatorAmount = (amount * CREATOR_SHARE_BPS) / BASIS_POINTS;
  return {
    creatorAmount,
    holderAmount: amount - creatorAmount,
  };
}
