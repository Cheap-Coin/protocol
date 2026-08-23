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
  and deterministic direct/Merkle campaign artifacts.
- `deployments`: the public schema and tooling for `PRELAUNCH`, `BONDING_CURVE`,
  and `PUMPSWAP` manifests.

This repository does not contain a token deployer, backend signing key, swap UI,
second liquidity pool, automatic social-reward join, or yield promise.

## Development

Requirements are Node.js 24, pnpm 11.3.0, Rust 1.91.1, Anchor 0.32.1, and
Solana CLI 3.0.10.

```bash
pnpm install --frozen-lockfile
pnpm check
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
cargo audit
cargo deny check
anchor build
```

The TypeScript suite is runnable independently. Rust and SBF commands require the
pinned local toolchain. A successful self-run is necessary but never substitutes
for independent review of a value-holding mainnet deployment.

The current lock client is hand-maintained and covered by TypeScript tests; it is
not presented as generated from an Anchor IDL. Before deployment, generate the IDL
from the reviewed SBF source and replace or independently verify the client byte for
byte, including every discriminator, account order, signer/writable flag, and argument.

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
