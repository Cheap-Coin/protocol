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
- The pinned CI workflows require Rust formatting, Clippy with warnings denied,
  native unit/property tests, RustSec, Cargo Deny, and filesystem scanning.
- This Windows review environment did not expose Rust, Cargo, Anchor, or Docker,
  so no local Rust result is claimed for 2026-08-23. Retain the first post-pivot CI
  result before treating those checks as passed.

## Not deployed or production-ready

- No new CHEAP mint or canonical PumpSwap pool is claimed.
- No mainnet lock or rewards program is claimed.
- No independent audit, Anchor/SBF build, IDL/client equivalence proof, LiteSVM
  result, devnet rehearsal, reproducible SBF record, Squads address, fee-share
  signature, or signed launch manifest is published.

The application therefore remains `PRELAUNCH`, and all CHEAP-only transaction
controls must remain disabled.
