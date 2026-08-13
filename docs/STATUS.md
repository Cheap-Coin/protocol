# CHEAP Build Status

Last updated: 2026-08-12

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
- A dual-asset 25/75 creator/community fee splitter for CHEAP and COST, plus a pre-funded,
  committed batch distributor with replay protection, reserve accounting, pause
  controls, and a delayed partial-drop remediation path.
- A canonical multi-RWA registry and one isolated immutable distributor per
  approved reward token, while the primary CHEAP/COST market stays unfragmented.
- A four-repository GitHub plan, disclosure policy, protected publication flow,
  pinned CI actions, dependency/secret scanning, and public deployment/audit slots.
- A canonical deployment-manifest schema and strict cross-field validator with
  exact-byte SHA-256 identity, versioned signed tags, finalized block anchors,
  receipt/runtime/state verification, explicit proxy implementation checks, and
  fail-closed app/services environment generation.
- Versioned V3-V7 drop evidence that binds every window or round to the exact
  published rules file and SHA-256 digest. V6 is the current strict Diamond
  format and V7 is the current weighted-random Surprise format, with complete
  drop/reconciliation CI test vectors.
- Deterministic, capped X contribution scoring; pre-launch Genesis records; a
  weighted-random CHEAP Surprise selector with committed future entropy; strict
  COST Diamond eligibility that excludes any outbound CHEAP transfer; and
  reproducible hidden Diamond window selection from future finalized entropy.
- Architecture, launch, migration, security, reward-rule, research, product, and
  visual-design documentation.

## Repository publication

- `protocol` and `rewards-ledger` are public, published, CI-verified,
  and protected against unreviewed failing changes, force-pushes, and deletion.
- `interface` and `services` are private and CI-verified. GitHub's free
  organization plan does not provide branch protection or repository rulesets
  for private repositories, so enforcement remains unavailable unless the plan
  changes or those repositories are intentionally made public.

## Verified locally

- Application `pnpm check`: passed lint, TypeScript, 14 unit tests, production
  build, and 36 desktop/mobile browser, interaction, and accessibility checks;
  12 environment-gated cases were skipped as designed. The dedicated live-mode
  matrix passed all 6 desktop/mobile cases, and the opt-in visual audit captured
  both current desktop and mobile surfaces.
- Services `pnpm check`: passed with 54 local tests and runtime-import checks; 7
  real-PostgreSQL integration cases are gated locally and configured to run
  against PostgreSQL 16 in CI.
- Rewards ledger `pnpm check`: compiled and applied 7 JSON Schemas and reproduced
  5 complete drop fixtures plus 1 linked reconciliation fixture.
- Public deterministic logic: 49 Vitest cases passed, including strict holding,
  hidden-window selection, weighted-random selection, and seeded allocation cases.
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
   partner terms, Genesis rules, Surprise Drop weights/caps/winner count, strict
   Diamond windows, and sustainable per-drop treasury budgets. Supply is
   fixed at 100B by Bankr. The old Solana token is
   already confirmed retired with no migration allocation or future utility.
2. Create and test the creator, holder-reward, and protocol-admin Safes, including
   signer quorum, hardware-wallet usage, and recovery procedures.
3. Simulate the final standard two-asset Bankr deployment and record every returned
   contract, pool, fee manager, token, beneficiary, vesting, fee asset, and transaction
   field before signing. Confirm only the CHEAP launch beneficiary is changed;
   canonical COST's own deployment beneficiary is unrelated.
4. Provision a production archive RPC, PostgreSQL, monitoring, backups, web/API
   hosting, DNS, secrets, and incident alerts.
5. Run database migrations and full indexer integration tests against the production-
   equivalent PostgreSQL/RPC environment.
6. Obtain independent Solidity and operational security reviews; resolve findings,
   rehearse pause/remediation procedures, and execute an end-to-end testnet dress
   rehearsal.
7. Publish and independently reproduce the canonical deployment manifest, exact
   SHA-256, signed release tag, finalized receipts, proxy/implementation identities,
   contract state, treasury addresses, approved rules, reward artifacts, and
   launch reconciliation. Generate app/services settings only from that release.
   Public branch protection is active; private protection remains subject to the
   GitHub plan limitation documented above.

## Deliberately outside V1

- Staking, LP incentives, automatic reinvestment, and yield claims.
- Automatic redemption of stock tokens for groceries or fiat.
- Unverified partner benefits or retailer branding in live mode.
- Any Solana bridge or migration claim. The legacy token is retired and excluded
  from the new Robinhood Chain launch.
- Live X OAuth and TikTok analytics ingestion until identity consent, deletion/retention,
  abuse review, appeal rules, credentials, and provider reviews are complete.

These items can be added only after their funding model, abuse controls, user terms,
and security review are complete.
