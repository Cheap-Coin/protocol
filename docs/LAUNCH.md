# Pump launch runbook

This runbook does not authorize or automate a launch. The owner performs launch and
signing actions after independent review.

## Before any launch transaction

1. Archive the final retired implementation with a developer-created signed tag.
2. Create three independent Squads signer keys on separate hardware/recovery
   devices. Rehearse loss of any one signer and a 2-of-3 recovery.
3. Create and label distinct owner/community vaults. Verify both addresses on two
   independent displays and with a read-only RPC query.
4. Generate the Pump account derivation and fee-share rehearsal artifact. It must
   contain exactly those vaults in this order: owner 7,500 bps, community 2,500 bps.
5. Independently compare program IDs, PDAs, current creator, mint, and all accounts
   to the current official Pump documentation/SDK.
6. Simulate the exact unsigned shareholder update. Because the final update is
   effectively one-time, stop on any discrepancy and regenerate from clean inputs.
7. Confirm the application and services still show `PRELAUNCH` and contain no
   guessed mint or price.

## After the owner launches

1. Wait for finalized commitment and reconcile the launch transaction, mint,
   token program, curve, fee-sharing config, vaults, shares, and revoked admin.
2. Publish a signed `BONDING_CURVE` manifest using the deployment workflow.
3. Enable bonding-curve lifecycle only when the deployed application consumes the
   exact committed artifact hash. Do not enable lock solely because CHEAP exists.

## After graduation

1. Derive the PumpSwap pool from the verified mint and official program state.
2. Verify that the quote mint is wrapped SOL, record reserves/LP mint, and reconcile
   the graduation transaction at a finalized slot.
3. Publish a new signed `PUMPSWAP` manifest. Only that manifest enables canonical
   deposit/withdraw preparation. Swaps remain out of scope; do not create a second
   pool or advertise farming yield.

## Programs and campaigns

Deploy `cheap-lock` to localnet/devnet first. Mainnet requires independent audit,
reproducible build, deployment manifest, Squads authority, adversarial withdrawal
rehearsal, and a defined stability period before freezing upgrades. The Merkle
rewards program is separate and may be referenced only after pinning the exact
audited commit and verifying the deployed program.
