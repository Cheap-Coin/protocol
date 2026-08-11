# CHEAP Build Status

Last updated: 2026-08-11

## Current state

The production-oriented pre-deployment foundation is implemented. It includes:

- A responsive wallet application with dashboard, Diamond Drops, benefits, deals,
  wallet, community, and settings views.
- Explicit preview and live modes so illustrative content cannot be mistaken for
  production balances, rewards, partnerships, or offers.
- Direct Robinhood Chain reads for ETH, CHEAP, COST, treasury balances, and public
  reward status.
- A finalized-log indexer, lowest-balance holding-window accounting, deterministic
  allocation, Merkle commitments, and Safe/operator transaction artifacts.
- Fail-closed RPC chain/code verification, durable finalized-target lag, stale
  readiness detection, checksum-pinned database migrations, and PostgreSQL CI.
- An immutable COST-only 25/75 creator/holder fee splitter and a pre-funded,
  committed batch distributor with replay protection, reserve accounting, pause
  controls, and a delayed partial-drop remediation path.
- A canonical multi-RWA registry and one isolated immutable distributor per
  approved reward token, while the primary CHEAP/COST market stays unfragmented.
- A four-repository GitHub plan, disclosure policy, protected publication flow,
  pinned CI actions, dependency/secret scanning, and public deployment/audit slots.
- Immutable v3 drop evidence that binds every window to the exact published
  rules file and SHA-256 digest, with full drop/reconciliation CI test vectors.
- Deterministic, capped community-contribution scoring, exact budget splitting,
  and holder/contributor allocation merging without live X ingestion or payouts.
- Architecture, launch, migration, security, reward-rule, research, product, and
  visual-design documentation.

## Repository publication

- `cheap-protocol` and `cheap-transparency` are public, published, CI-verified,
  and protected against unreviewed failing changes, force-pushes, and deletion.
- `cheap-app` and `cheap-services` are private and CI-verified. GitHub's free
  organization plan does not provide branch protection or repository rulesets
  for private repositories, so enforcement remains unavailable unless the plan
  changes or those repositories are intentionally made public.

## Verified locally

- Application `pnpm check`: passed lint, TypeScript, 9 unit tests, production
  build, 34 browser/accessibility checks, and 8 intentionally gated live/visual
  checks. The on-demand desktop/mobile visual audit also passed.
- Services `pnpm check`: passed with 21 local tests; 4 real-PostgreSQL integration
  cases are gated locally and configured to run against PostgreSQL 16 in CI.
- Transparency `pnpm check`: compiled and applied 3 JSON Schemas and reproduced
  one complete v3 drop fixture plus one linked reconciliation fixture.
- Public deterministic logic: 25 Vitest cases passed, including 250 seeded
  community-allocation invariant cases.
- Foundry: 30 unit, fuzz, and invariant properties/tests passed. Each stateful
  property ran 16,384 calls with zero handler reverts.
- Contract formatting and lint warnings-as-errors: required by the contract package.
- Forced Solidity build and runtime-size report: passed; both contracts are well
  below the EVM runtime bytecode limit.
- Slither 0.11.6 and Aderyn 0.6.8: zero high findings; accepted medium/low notes
  are publicly triaged without hidden suppressions.
- Trivy 0.73.0: zero high/critical dependency, secret, or configuration findings.
- pnpm audit: no known vulnerabilities; GitHub workflows pass actionlint 1.7.12.

## Required before production deployment

1. Record the owner-approved vesting choice, vault recipient, unlocked-CHEAP use,
   Bankr/Doppler parameters, reward floor, window cadence, start time, exclusions,
   partner terms, and any separately funded community-reward policy. Supply is
   fixed at 100B by Bankr. The old Solana token is
   already confirmed retired with no migration allocation or future utility.
2. Create and test the creator, holder-reward, and protocol-admin Safes, including
   signer quorum, hardware-wallet usage, and recovery procedures.
3. Simulate the final quote-only Bankr deployment and record every returned
   contract, pool, fee manager, token, beneficiary, vesting, fee, and transaction
   field before signing. Confirm only the CHEAP launch beneficiary is changed;
   canonical COST's own deployment beneficiary is unrelated.
4. Provision a production archive RPC, PostgreSQL, monitoring, backups, web/API
   hosting, DNS, secrets, and incident alerts.
5. Run database migrations and full indexer integration tests against the production-
   equivalent PostgreSQL/RPC environment.
6. Obtain independent Solidity and operational security reviews; resolve findings,
   rehearse pause/remediation procedures, and execute an end-to-end testnet dress
   rehearsal.
7. Publish verified deployment addresses, signed reward artifacts, treasury
   addresses, approved rules, and the launch reconciliation in the existing
   repositories. Public branch protection is active; private protection remains
   subject to the GitHub plan limitation documented above.

## Deliberately outside V1

- Staking, LP incentives, automatic reinvestment, and yield claims.
- Automatic redemption of stock tokens for groceries or fiat.
- Unverified partner benefits or retailer branding in live mode.
- Any Solana bridge or migration claim. The legacy token is retired and excluded
  from the new Robinhood Chain launch.
- Live X OAuth ingestion or social-funded drops until identity consent, abuse
  review, appeal rules, funding, and a new public artifact schema are approved.

These items can be added only after their funding model, abuse controls, user terms,
and security review are complete.
