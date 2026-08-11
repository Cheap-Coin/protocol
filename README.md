# CheapCoin protocol

This is the public, MIT-licensed source of truth for the CheapCoin protocol on
Robinhood Chain. It contains the non-upgradeable fee splitter, isolated
reward-token distributors, deterministic allocation and commitment logic,
property tests, deployment records, rules, and security evidence.

The planned primary market is one `CHEAP/COST` Bankr/Doppler pool with a fixed
100B CHEAP supply and quote-only creator fees. COST creator fees are split 25%
to the creator beneficiary and 75% to the reward Safe. Other approved canonical
RWA tokens use separately funded, immutable-token distributors; they do not
create additional CHEAP launch pools.

## Trust boundaries

- The fee splitter's quote token and 25/75 ratio are immutable.
- Its fee manager and pool ID can be configured exactly once by the owner Safe.
- Every distributor is bound to exactly one reward token.
- A Safe commits the exact drop totals and Merkle roots before an operator can
  execute approved batches.
- The operator cannot alter a recipient or amount without invalidating proof.
- This repository is pre-deployment. No address is canonical until it appears
  in `deployments/` with source verification and a signed release.

## Verify locally

Requirements: Node 24+, pnpm 11+, and Foundry 1.7.1.

```bash
git clone --recurse-submodules https://github.com/Cheap-Coin/cheap-protocol.git
cd cheap-protocol
pnpm install --frozen-lockfile
pnpm check
```

CI additionally runs pinned Slither, Aderyn, Trivy, and dependency checks. These
tools do not replace an independent audit. Read `SECURITY.md` before reporting a
vulnerability and `docs/LAUNCH.md` before any deployment.
Use `docs/BANKR-SIMULATION.md` for the mandatory non-broadcast launch review.
Use `docs/COMMUNITY-REWARDS.md` for the separate, currently inactive X and
backworker scoring boundary.
