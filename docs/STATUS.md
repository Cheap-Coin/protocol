# Implementation status

Checked 2026-08-23.

## Implemented in source

- Solana Rust/Anchor 1.1.2 `cheap-lock` program with isolated positions, 30/90-day tiers,
  unrestricted owner withdrawal, early/mature state, and new-position-only pause.
- Hand-maintained predeployment TypeScript address/instruction builders and strict
  shared public types. The implemented open/withdraw builders now have generated-IDL
  byte-equivalence checks; the client remains clearly labeled as hand-maintained.
- A lockfile-guarded Solana CLI 3.1.10/platform-tools v1.52 SBF build, generated IDL
  contract verifier, feature-gated LiteSVM 0.10.0 suite, and pinned verifiable-build
  CI path are implemented without deployment commands.
- Pump PDA derivation, fixed 75/25 fee-share rehearsal, and reconciliation checks.
- Lifecycle launch manifests and finalized account/signature verification tooling.
- Deterministic direct campaign calculations and audit-pinned Merkle campaign gate.

## Verified in this workspace

- TypeScript lint, typecheck, unit tests, build, runtime import, and empty-manifest
  validation are part of `pnpm check`.
- In the 2026-08-23 WSL review environment, Rust 1.91.1 and Anchor 1.1.2 compiled
  the program with Solana CLI 3.1.10/platform-tools v1.52. Six native unit/property
  tests and two real-SBF LiteSVM integration tests passed. The generated IDL/SBF/
  TypeScript equivalence verifier also passed. These are local results for an
  uncommitted tree, not a published CI or release attestation.
- Pinned [Protocol CI run 32648847561](https://github.com/Cheap-Coin/protocol/actions/runs/32648847561)
  passed for commit `3476e7cdb4504e28ab8ad712d81822a6cd17c78e`, including Rust formatting,
  Clippy with warnings denied, native unit/property tests, the TypeScript suite,
  builds, and runtime checks. That run predates the Anchor 1.1.2 migration.
- Pinned [Repository Security run 32648847584](https://github.com/Cheap-Coin/protocol/actions/runs/32648847584)
  passed for the same commit, including production dependency audit, RustSec,
  Cargo Deny, and Trivy dependency/secret/misconfiguration scanning.
- Docker was not available in this review environment, so the digest-pinned
  verifiable-build path still requires its first CI run and independent reproduction.

## Not deployed or production-ready

- No new CHEAP mint or canonical PumpSwap pool is claimed.
- No mainnet lock or rewards program is claimed.
- No independent audit, devnet initializer rehearsal, published reproducible SBF
  record, Squads address, fee-share signature, or signed launch manifest is published.

The application therefore remains `PRELAUNCH`, and all CHEAP-only transaction
controls must remain disabled.
