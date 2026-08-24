# Security tooling and evidence

Run and retain machine-readable output where supported:

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
pnpm rust:build:verifiable
cargo audit
cargo deny check
```

CI also runs dependency and filesystem secret/misconfiguration scans. The protocol
job pins Rust 1.91.1, Anchor 1.1.2 by source commit, Solana CLI 3.1.10, SBF platform
tools v1.52, LiteSVM 0.10.0, and the verifiable Anchor image by immutable manifest
digest. It uploads the ordinary and verifiable SBFs, generated IDL/type, source
commit, lockfile hash, and artifact hashes. A deployment signature is deliberately
absent because this workflow never deploys.

Anchor 1.1.2 forwards build arguments into both `cargo-build-sbf` and its IDL test
binary. A Cargo-only `--locked` argument therefore breaks IDL extraction. The
repository build wrapper runs `cargo metadata --locked`, hashes `Cargo.lock`, runs
Anchor without forwarded Cargo arguments, and fails if the lockfile changes. Anchor
also creates a development keypair during builds; the wrapper removes it only when
the current build created it, and CI proves none remains before artifact upload.

Tests must exercise principal conservation, early/mature withdrawal, pause safety,
position isolation, wrong owner/mint/token program/PDA, duplicate positions/claims,
checked arithmetic, campaign budget caps, pool/manifest mismatch, failed simulation,
and blockhash expiry.

The 2026-08-23 WSL review environment produced a fresh native build and real SBF
with the pinned toolchain. Six unit/property tests, two LiteSVM program tests, and
the SBF/IDL/TypeScript equivalence check passed locally. Docker was unavailable, so
the verifiable build remains a configured CI gate until a published run exists. Pinned
[Protocol CI run 32648847561](https://github.com/Cheap-Coin/protocol/actions/runs/32648847561)
passed formatting, Clippy, and native unit/property tests for commit
`3476e7cdb4504e28ab8ad712d81822a6cd17c78e`; it predates this migration. Pinned
[Repository Security run 32648847584](https://github.com/Cheap-Coin/protocol/actions/runs/32648847584)
passed `cargo audit`, `cargo deny check`, production dependency audit, and the
filesystem dependency/secret/misconfiguration scan for the same commit.

`deny.toml` records one narrow informational exception for unmaintained `bincode`
1.3.3, which remains transitive through Anchor 1.1.2/Solana and the feature-gated
LiteSVM graph; RustSec lists no compatible patched 1.x version. Retain CI logs and
review every new advisory. A full-lockfile `cargo audit` also reports unmaintained
`ansi_term` 0.12.1, `derivative` 2.2.0, `libsecp256k1` 0.6.0, and `paste` 1.0.15
only through the feature-gated LiteSVM/Agave test graph. `rand` 0.7.3 is present in
that same test-only path through `agave-syscalls -> libsecp256k1`; its activated
features do not include `log`, so the custom-logger conditions in
`RUSTSEC-2026-0097` are not met by this harness. These upstream notices remain
tracked rather than being silently ignored. The fresh SBF/LiteSVM/equivalence
results still do not replace a devnet rehearsal, independently reproduced
verifiable build, or audit.

LiteSVM executes the compiled program for lifecycle and invariant coverage, but its
program loader does not faithfully model the upgradeable loader's ProgramData and
upgrade-authority relationship used by `initialize_config`. The suite therefore
preloads a valid configuration account. Rehearse initializer authority, revoked mint/
freeze authority checks, and the exact deployment manifest on localnet/devnet before
any value-holding release.

The pinned 3.1.10/v1.52 toolchain currently emits an SBPFv0 artifact, and the
evidence file records that ELF flag rather than hiding it. Immediately before any
deployment, re-check the target cluster's active SBPF requirements against current
Anza guidance. If older SBPF versions are no longer accepted, perform a separately
reviewed Anchor/Solana toolchain migration and repeat every build, LiteSVM, devnet,
equivalence, reproducibility, and audit gate.

No report should use "audited" for an automated scan or self-review. Independent
findings and remediation records belong under `audits/`.
