# CHEAP Build Status

Last updated: 2026-08-10

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
- An immutable 25/75 creator/holder fee splitter and a pre-funded, committed batch
  distributor with replay protection, reserve accounting, pause controls, and a
  delayed partial-drop remediation path.
- A canonical multi-RWA registry and one isolated immutable distributor per
  approved reward token, while the primary CHEAP/COST market stays unfragmented.
- A four-repository GitHub plan, disclosure policy, protected publication flow,
  pinned CI actions, dependency/secret scanning, and public deployment/audit slots.
- Architecture, launch, migration, security, reward-rule, research, product, and
  visual-design documentation.

## Verified locally

- `pnpm check`: passed with lint warnings treated as errors, TypeScript checks,
  32 Vitest cases, production builds, browser checks, and contract tests.
- Preview browser behavior: 5 passed on desktop/mobile; dedicated live-mode data
  separation: 2 passed; on-demand visual audit: 2 passed.
- Foundry: 20 unit, fuzz, and invariant properties/tests passed. Each stateful
  property ran 16,384 calls with zero handler reverts.
- Contract formatting and lint warnings-as-errors: required by the contract package.
- Forced Solidity build and runtime-size report: passed; both contracts are well
  below the EVM runtime bytecode limit.
- Slither 0.11.6 and Aderyn 0.6.8: zero high findings; accepted medium/low notes
  are publicly triaged without hidden suppressions.
- Trivy 0.73.0: zero high/critical dependency, secret, or configuration findings.
- pnpm audit: no known vulnerabilities; GitHub workflows pass actionlint 1.7.12.

## Required before production deployment

1. Record the owner-approved launch supply, Bankr/Doppler parameters, reward floor,
   window cadence, start time, exclusions, and partner terms. The old Solana token
   is already confirmed retired with no migration allocation or future utility.
2. Create and test the creator, holder-reward, and protocol-admin Safes, including
   signer quorum, hardware-wallet usage, and recovery procedures.
3. Simulate the final Bankr deployment and record every returned contract, pool,
   initializer, token, fee-recipient, and transaction address before signing.
4. Provision a production archive RPC, PostgreSQL, monitoring, backups, web/API
   hosting, DNS, secrets, and incident alerts.
5. Run database migrations and full indexer integration tests against the production-
   equivalent PostgreSQL/RPC environment.
6. Obtain independent Solidity and operational security reviews; resolve findings,
   rehearse pause/remediation procedures, and execute an end-to-end testnet dress
   rehearsal.
7. Create the four GitHub repositories, add maintainer teams/CODEOWNERS/security
   contact, protect branches, then publish verified contracts, signed reward
   artifacts, treasury addresses, rules, and launch reconciliation.

## Deliberately outside V1

- Staking, LP incentives, automatic reinvestment, and yield claims.
- Automatic redemption of stock tokens for groceries or fiat.
- Unverified partner benefits or retailer branding in live mode.
- Any Solana bridge or migration claim. The legacy token is retired and excluded
  from the new Robinhood Chain launch.

These items can be added only after their funding model, abuse controls, user terms,
and security review are complete.
