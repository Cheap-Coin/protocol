# CHEAP protocol properties

These properties are the minimum behavior expected from every production build.
They are checked by unit, fuzz, and stateful invariant tests; they are also the
starting point for an independent audit and Echidna/Medusa campaign.

## Fee splitter

- Every received primary quote-token unit is routed in the same transaction.
- Creator share is exactly `floor(amount * 2,500 / 10,000)`.
- Holder share receives the remainder, so rounding never becomes trapped dust.
- The reward token and recipients never change.
- The fee manager and pool identifier can be configured only once.
- Pausing stops collection and splitting; it cannot redirect value.

## Per-asset distributor

- `reservedRewards <= rewardToken.balanceOf(distributor)` at every reachable state.
- `availableRewards + reservedRewards` equals the distributor token balance.
- Only unreserved tokens can be withdrawn.
- A drop reserves its complete budget before the first payment.
- A batch proof binds the drop ID, batch index, recipients, and amounts.
- A batch and recipient can each be paid at most once per drop.
- Payments plus withdrawals plus the live distributor balance reconcile exactly
  to total funding in the stateful harness.
- Finalized and cancelled drop identifiers cannot be reused.
- A partially executed drop can release unpaid reserves only while paused and
  after the seven-day remediation delay.
- The reward token, owner authority, and operator remain the expected values.

## Release rule

A failing property blocks release. Suppressions for Slither or Aderyn require a
written rationale beside the affected code and reviewer approval. Passing these
properties is necessary, but does not replace an independent audit.
