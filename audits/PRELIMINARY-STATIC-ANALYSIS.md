# Preliminary static-analysis triage

Date: 2026-08-10
Status: pre-deployment; rerun and bind to a signed commit at audit freeze

The source-only analysis workspace is generated from `contracts/src` plus the
exact locked OpenZeppelin dependency. This avoids monorepo/symlink parser gaps
without changing the code being reviewed.

## Results

| Tool | Version | Result |
|---|---:|---|
| Slither | 0.11.6 | 0 high, 1 medium, 1 low |
| Aderyn | 0.6.8 | 0 high, 5 low |

Foundry unit, fuzz, and invariant results are recorded separately by CI. These
scanner results are not an independent audit.

## Slither triage

### `incorrect-equality` — medium

Location: `CheapFeeSplitter._splitAvailableBalance()`.

The equality is only an exact zero-balance guard used to emit
`NoRewardsAvailable`. It does not control price, authorization, payout share, or
an approximate threshold. A nonzero balance always enters the immutable 25/75
split. Retained as a transparent, precise precondition.

### `timestamp` — low

Location: `CheapBatchDistributor.closeForRemediation()`.

Timestamp is intentionally used for a seven-day Safe review delay, not pricing,
randomness, eligibility, or an auction boundary. Normal validator timestamp drift
cannot materially bypass seven days. Retained and covered by remediation tests.

## Aderyn triage

### `centralization-risk`

Admin operations are intentionally assigned to the disclosed protocol Safe.
The operator cannot change committed batches, the owner cannot withdraw reserved
rewards, recipients/assets are immutable where value routing requires it, and
ownership transfer is two-step. Mainnet deployment with an EOA owner is blocked.

### `costly-loop` and `loop-revert`

The distributor writes each paid-recipient marker and fails an entire batch if
any entry is invalid. That atomic behavior prevents partial, ambiguous payouts.
`MAX_BATCH_SIZE` limits a batch to 200 entries; final gas limits must be established
in the Robinhood Chain dress rehearsal. A forgive-and-continue loop would violate
the published batch commitment and is rejected.

### `large-numeric-literal`

`10_000` is the conventional and readable basis-point denominator. Scientific
notation would not improve safety or gas.

### `modifier-invoked-only-once`

`onlyOperator` is kept as a named authorization boundary even though one function
currently uses it. This makes the limited hot-key capability explicit and easier
to audit; the modifier contains no external call.

## Changes made from the first scan

- Moved `nonReentrant` before other modifiers on value-moving entry points.
- Renamed the public batch marker to avoid state/struct shadowing.
- Removed balance-before-external-call accounting: fee collection now splits the
  complete canonical balance after the guarded manager call.
- Declared the fee-manager call without returndata because token balance, not
  manager-reported metadata, is authoritative.
- Added regression coverage for pre-transferred balance plus collected fees.

All accepted findings must be reviewed again by the independent auditor. A future
suppression requires reviewer approval and a rationale beside the affected code.
