# Community campaign model

Community campaigns spend from the 25% Squads treasury only after an explicit
multisig approval. The analytics system does not choose recipients.

Every manifest commits to asset, exact base-unit budget, rules URI/hash, snapshot
slot, canonical sorted allocation hash, recipient list or Merkle root, source
treasury, expiration, state, prepared/executed signatures, and reconciliation.
Addresses, duplicate recipients, arithmetic, treasury balance, artifact hashes,
and simulation must validate before any unsigned Squads payload is emitted.

## Small campaigns

At most 200 recipients use explicit native SOL or checked SPL transfers. Each
recipient and exact amount is visible in the committed artifact. SPL campaigns
identify mint, token program, decimals, source token account, and destination token
accounts. Failed or partial execution is reconciled from finalized signatures; it
is never counted from a prepared transaction.

V1 transaction builders accept only the legacy SPL Token program. Token-2022
transfers stay disabled until an RPC-backed adapter inspects every extension,
accounts for transfer fees, and resolves any required transfer-hook accounts
before budget validation and simulation.

## Large campaigns

Larger lists use a deployment of the Solana Foundation Merkle rewards program only
after the exact audited commit, program ID, build/deployment signature, and audit
scope have been independently verified and recorded. Native SOL is wrapped for the
campaign; the application may separately prepare an unwrap transaction for a
claimant. A repository URL or matching program name is not sufficient verification.

The tooling pins program ID `REWArDioXgQJ2fZKkfu9LCLjQfRwYWVVfsvcsR5hoXi` and
the OtterSec audited-through commit
`aa1cfd9276375e44e57d1917d110ff095fb6d475`. On 2026-08-23, upstream `main` was
72 commits ahead of that baseline, exposed no stable tag or release, and its README
deployment table did not identify a network deployment. Large-campaign preparation
therefore remains a fail-closed production gate until an exact deployed-binary to
audited-source mapping is independently reproduced and recorded.

Duplicate claims, root substitution, expired claims, wrong asset/program, and
budget overrun are fail-closed conditions. At expiry, reconcile funded, distributed,
claimed, returned, and remaining amounts exactly.
