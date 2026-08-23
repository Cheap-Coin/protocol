# Primary-source verification register

Production operators must re-check these primary sources immediately before any
transaction because program IDs, SDKs, instructions, and policy can change:

- Pump creator-fee sharing:
  https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/CREATOR_FEE_SHARING.md
- PumpSwap account and deposit/withdraw model:
  https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_SWAP_README.md
- Solana Foundation Merkle rewards source:
  https://github.com/solana-foundation/rewards
- Solana frontend/client guidance:
  https://solana.com/docs/frontend/client

Record the exact reviewed commit/tag, retrieval time, expected program IDs, audit
scope, and two-person comparison result in the launch or deployment evidence. A
link alone is not a pin and must not enable production functionality.

## Rewards review snapshot

Reviewed 2026-08-23 against the upstream audit register and GitHub repository API:

- OtterSec audited-through commit: `aa1cfd9276375e44e57d1917d110ff095fb6d475`.
- Declared program ID: `REWArDioXgQJ2fZKkfu9LCLjQfRwYWVVfsvcsR5hoXi`.
- Upstream `main`: `20522ed0bf7a514fcd50f872de90179e0dbbefe6`, 72 commits ahead.
- Stable tags/releases: none returned.
- The upstream README deployment table had no network rows.

These facts pin source identity but do not prove that a particular onchain binary
matches the audited commit. Production Merkle campaigns stay disabled until that
deployment mapping is independently verified and committed to a signed manifest.
