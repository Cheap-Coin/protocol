# Implementation status

Checked 2026-08-23.

## Implemented in source

- Solana Rust/Anchor `cheap-lock` program with isolated positions, 30/90-day tiers,
  unrestricted owner withdrawal, early/mature state, and new-position-only pause.
- Hand-maintained predeployment TypeScript address/instruction builders and strict
  shared public types. They are not yet IDL-generated or SBF-verified.
- Pump PDA derivation, fixed 75/25 fee-share rehearsal, and reconciliation checks.
- Lifecycle launch manifests and finalized account/signature verification tooling.
- Deterministic direct campaign calculations and audit-pinned Merkle campaign gate.

## Verified in this workspace

- TypeScript lint, typecheck, unit tests, build, runtime import, and empty-manifest
  validation are part of `pnpm check`.
- Pinned [Protocol CI run 32648847561](https://github.com/Cheap-Coin/protocol/actions/runs/32648847561)
  passed for commit `3476e7cdb4504e28ab8ad712d81822a6cd17c78e`, including Rust formatting,
  Clippy with warnings denied, native unit/property tests, the TypeScript suite,
  builds, and runtime checks.
- Pinned [Repository Security run 32648847584](https://github.com/Cheap-Coin/protocol/actions/runs/32648847584)
  passed for the same commit, including production dependency audit, RustSec,
  Cargo Deny, and Trivy dependency/secret/misconfiguration scanning.
- This Windows review environment did not expose Rust, Cargo, Anchor, or Docker,
  so the Rust result above is CI evidence rather than a fresh local execution.

## Not deployed or production-ready

- No new CHEAP mint or canonical PumpSwap pool is claimed.
- No mainnet lock or rewards program is claimed.
- No independent audit, Anchor/SBF build, IDL/client equivalence proof, LiteSVM
  result, devnet rehearsal, reproducible SBF record, Squads address, fee-share
  signature, or signed launch manifest is published.

The application therefore remains `PRELAUNCH`, and all CHEAP-only transaction
controls must remain disabled.
