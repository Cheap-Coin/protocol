# CheapCoin Protocol

Public Solana protocol, predeployment TypeScript transaction builders, launch commitments, and
campaign calculation libraries for the CheapCoin relaunch.

No new CHEAP mint, canonical pool, or mainnet CheapCoin program is deployed by
this repository state. The application must remain `PRELAUNCH` until the owner
launches through Pump.fun and publishes a signed, chain-verified launch manifest.
The development program ID in `Anchor.toml` is not a deployment claim.

## Active components

- `programs/cheap-lock`: isolated 30-day and 90-day CHEAP commitment positions.
  Full principal is withdrawable at any time; early withdrawal changes eligibility
  state but never principal. Pausing affects new positions only.
- `packages/protocol`: strict Solana types, launch-manifest verification, Pump
  account derivation and 75/25 fee-share rehearsal, lock instruction builders,
  deterministic direct/Merkle campaign artifacts, and generated-IDL equivalence
  checks for the implemented lock instructions.
- `deployments`: the public schema and tooling for `PRELAUNCH`, `BONDING_CURVE`,
  and `PUMPSWAP` manifests.

This repository does not contain a token deployer, backend signing key, swap UI,
second liquidity pool, automatic social-reward join, or yield promise.

## Development

Requirements are Node.js 24, pnpm 11.3.0, Rust 1.91.1, Anchor 1.1.2, Solana
CLI 3.1.10 with SBF platform tools v1.52, and LiteSVM 0.10.0 for integration
tests. Docker is additionally required for the pinned verifiable build.

```bash
pnpm install --frozen-lockfile
pnpm check
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
pnpm rust:build-sbf
pnpm rust:clippy:litesvm
pnpm rust:test:litesvm
pnpm rust:artifacts:verify
cargo audit
cargo deny check
```

The TypeScript suite is runnable independently. Rust and SBF commands require the
pinned local toolchain. A successful self-run is necessary but never substitutes
for independent review of a value-holding mainnet deployment.

`pnpm rust:build-sbf` first validates `Cargo.lock`, invokes Anchor, and then fails
if the build changed the lockfile. This wrapper avoids an Anchor 1.1.2 forwarding
edge case where a Cargo-only `--locked` flag is also sent to the IDL test binary.
`pnpm rust:build:verifiable` uses the same guard and an immutable Anchor builder
image digest. The wrapper removes an ignored development keypair only when that
build created it; it never deletes a keypair that already existed.

The current Kit-native lock client is hand-maintained rather than generated. The
artifact verifier compares the implemented open and withdrawal instructions
byte-for-byte with the generated Anchor IDL, including program ID, discriminators,
PDA seeds, account order, signer/writable roles, and argument encoding. It also
validates the complete IDL instruction/error/type surface and writes hash evidence
under ignored `target/evidence/`; CI uploads the SBF, IDL, generated IDL type, and
evidence for review.

## Deployment boundary

The owner controls an owner-managed 2-of-3 Squads multisig using three independent
hardware/recovery devices. Separate owner and community treasury vaults are the
only Pump fee recipients: 75% owner and 25% community. The effectively final Pump
shareholder update must be rehearsed byte-for-byte before it is proposed.

After launch, publish a canonical manifest and signed tag according to
[deployments/README.md](./deployments/README.md). Liquidity actions remain disabled
until the manifest reaches `PUMPSWAP` and verifies the canonical CHEAP/wrapped-SOL
pool and LP mint. Mainnet lock and rewards programs remain disabled until their
audit and deployment records are complete.

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md),
[docs/LAUNCH.md](./docs/LAUNCH.md), [docs/CAMPAIGNS.md](./docs/CAMPAIGNS.md), and
[docs/SECURITY.md](./docs/SECURITY.md).
