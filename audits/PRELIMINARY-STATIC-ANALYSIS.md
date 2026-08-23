# Preliminary engineering review

Status: self-review only; not an independent audit.

The active `cheap-lock` design isolates every `(owner, deposit_id)` into its own
position PDA and token vault, rejects a CHEAP mint with active mint/freeze authority,
uses checked timestamp arithmetic, has no administrator withdrawal path, and does
not consult pause or maturity before returning the vault balance to its owner.

Required before mainnet: successful pinned Rust/Anchor/Solana builds, LiteSVM
integration coverage, adversarial devnet rehearsal, dependency and secret scans,
reproducible SBF artifacts, independent code/operational review, remediation, and
published deployment/upgrade-authority evidence. This document records no pass or
production approval.
