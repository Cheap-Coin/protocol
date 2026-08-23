# Security model

## cheap-lock invariants

- The configuration permanently fixes one CHEAP mint and legacy SPL Token program.
- Mint and freeze authorities must already be revoked at initialization.
- Initialization is authorized by the program's upgrade authority; configuration
  authority is then transferred to Squads.
- `(owner, deposit_id)` uniquely identifies a position and its isolated vault.
- Principal, tier, open time, and unlock time cannot be edited or topped up.
- Only the position owner can withdraw; the entire vault balance is returned.
- Maturity changes recorded eligibility state, never withdrawal permission.
- Pause applies only to opening a position. There is no admin seizure path.

Finalized campaign eligibility is recorded by campaign artifacts/indexing rather
than made mutable by lock withdrawal. The retained position account is the public
historical anchor.

## Operational controls

The owner manages a 2-of-3 Squads multisig but keeps each signer on an independent
device/recovery path. Owner/community fee vaults are separate. Backend services
have read/provider credentials only and emit unsigned artifacts. Provider data is
accepted at finalized commitment for balances, locks, pool, and campaign execution.

All transaction builders bind cluster, fee payer, program/account addresses,
recent blockhash, last valid block height, instructions, and successful simulation
into a canonical SHA-256 artifact. Signing material and pre-collected signatures
are rejected from unsigned artifacts.

## Production gates

Mainnet requires an independent audit, exact source/deployment mapping, reproducible
build, dependency review, devnet failure drills, withdrawal invariant tests, signed
manifest, monitoring, incident contacts, and documented upgrade freeze process.
Passing repository CI alone cannot satisfy these gates.
