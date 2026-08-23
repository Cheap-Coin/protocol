# Security tooling and evidence

Run and retain machine-readable output where supported:

```bash
pnpm install --frozen-lockfile
pnpm check
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
anchor build
cargo audit
cargo deny check
```

CI also runs dependency and filesystem secret/misconfiguration scans. Add a pinned
LiteSVM integration job and devnet rehearsal before a value-holding release. Record
Rust, Anchor, Solana, Node, pnpm, lockfile, source commit, SBF hash, IDL hash, and
deployment signature so an independent reviewer can reproduce the mapping.

Tests must exercise principal conservation, early/mature withdrawal, pause safety,
position isolation, wrong owner/mint/token program/PDA, duplicate positions/claims,
checked arithmetic, campaign budget caps, pool/manifest mismatch, failed simulation,
and blockhash expiry.

The 2026-08-23 Windows review environment did not expose Rust, Cargo, Anchor, or
Docker, so this document does not claim a fresh local Rust result. Pinned CI runs
formatting, Clippy, native tests, `cargo audit`, and `cargo deny check` after the
pivot is committed. `deny.toml` records one narrow informational exception for
unmaintained `bincode` 1.3.3 through Anchor 0.32.1; RustSec lists no patched bincode
version. Retain the CI logs and review any new advisory before release. A clean
native result is still not an SBF build or LiteSVM result.

No report should use “audited” for an automated scan or self-review. Independent
findings and remediation records belong under `audits/`.
