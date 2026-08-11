# Security model

## Roles and keys

| Role | Recommended control | Capability |
|---|---|---|
| Protocol owner | 2-of-3 or stronger Safe | Configure pool once, pause, approve drops, rotate operator |
| Creator recipient | Safe or disclosed wallet | Receive immutable 25% COST share |
| Holder-reward treasury | Separate Safe | Hold 75% COST share and fund approved asset-specific drops |
| Batch operator | Limited hot key | Execute only root-approved batches; cannot alter recipients |
| Indexer/API | No signing key | Read finalized logs, compute and publish data |
| Web app | No custody | Read state and request user-approved wallet actions |

Production domains, deployment wallets, Safe signers, RPC credentials, database
credentials, and monitoring accounts must use separate secrets and least
privilege. No Bankr API key or operator key belongs in a browser environment.

## Enforced invariants

- COST and both fee recipients are immutable in the splitter.
- COST always splits 25/75; rounding dust goes to holders.
- Fee manager/pool configuration is one-time.
- Each distributor is permanently bound to one reward token.
- A drop is fully funded in that exact token before its commitment becomes active.
- Safe-approved batch proofs bind drop, index, recipients, and amounts.
- A wallet and batch are each usable once per drop.
- Paid value cannot exceed the reserved drop amount.
- Reserved reward tokens cannot be withdrawn.
- A finalized or cancelled drop ID cannot be reused.
- Partially paid funds require pause, seven days, and a Safe action before release.

## Threat handling

| Threat | Control |
|---|---|
| Compromised operator | Merkle root rejects changed recipients/amounts; Safe rotates operator |
| Compromised API | UI reads onchain roots/events; API cannot sign or move funds |
| RPC reorg/provider inconsistency | Finalized-block indexing, cursor hash check, fail-closed remediation state |
| Duplicate/replayed payout | Batch and recipient mappings onchain |
| Malicious token approval request | Core viewing requests no approval; writes show contract/action |
| Fake COST contract | Canonical address pinned and linked to Robinhood registry/explorer |
| Fake additional RWA | Registry verification, pinned chain-4663 address, separate distributor, Safe checklist |
| Asset paused/retired | Block new funding and drops for that asset; do not substitute another token automatically |
| Corporate action | Monitor registry multiplier/actions and pause new artifacts until balances and display units reconcile |
| Stuck recipient/batch | Atomic batch revert, then delayed paused remediation and replacement artifact |
| Database tampering | Deterministic independent recomputation, immutable artifact hash, onchain roots |
| Rule changes after seeing holders | Rules hash and window blocks published before the window |
| Supply-chain compromise | Exact package pins, lockfile policy verification, minimal approved install scripts |

GitHub Actions are pinned to immutable commit SHAs and receive read-only default
permissions. Dependabot proposes reviewed updates; no workflow follows an
unpinned third-party action tag at runtime.

## Required work before mainnet value

1. Independent audit of both contracts and the TypeScript/Solidity hashing match.
2. Fork tests against the exact Bankr initializer, pool ID, and canonical COST
   contract returned by the real launch simulation.
3. Testnet or low-value mainnet rehearsal covering fee claim, split, 201+ holder
   batches, failed batch, pause, remediation, and finalization for COST; repeat a
   low-value rehearsal before activating every additional reward token.
4. Two independent snapshot implementations must agree on balances, exclusions,
   roots, and totals for a shadow window.
5. Safe transaction simulation and human-readable signing checklist.
6. Archive RPC primary plus an independent fallback used for reconciliation.
7. Monitoring for cursor lag, hash mismatch, treasury changes, failed batches,
   unexpected beneficiary changes, pauses, and operator rotation.
8. Backups and point-in-time recovery for PostgreSQL; immutable public artifact
   storage must not depend on the database backup.
9. Confirm each artifact's token and distributor target by calling the immutable
   `rewardToken()` value before the Safe signs. Never use an automated treasury
   swap or token substitution in V1.

Passing repository tests is not an audit. No contract should be deployed with
meaningful value until these gates are complete.

The current automated and manual toolchain is specified in
[SECURITY-TOOLING.md](SECURITY-TOOLING.md), and repository access boundaries are
specified in [REPOSITORIES.md](REPOSITORIES.md).

## Frontend safety

The production UI must keep contract addresses visible, distinguish preview from
live data, display RPC/API failures rather than stale success, use a restrictive
Content Security Policy, and proxy analytics so wallet addresses are not leaked
to unrelated third parties. Wallet signatures must state their purpose; CHEAP
balance viewing never needs an ERC-20 approval or blind message signature.
