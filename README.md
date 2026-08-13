# CheapCoin Protocol

Public, MIT-licensed contracts and deterministic reward logic for CheapCoin on
Robinhood Chain. This repository is the canonical source for protocol code,
reward rules, deployment records, tests, and published security evidence.

The planned primary market is one `CHEAP/COST` Bankr/Doppler pool with a fixed
100B CHEAP supply and standard two-asset creator fees. Collected CHEAP and COST
are each split 25% to the creator beneficiary and 75% to the community Safe.
CHEAP can fund weighted-random Surprise Drops; COST funds strict-holding Diamond
Drops. Other approved canonical
RWA tokens use separately funded, immutable-token distributors; they do not
create additional CHEAP launch pools.

## Security model

- The fee splitter's COST token, recipients, and 25/75 ratio are immutable.
- Its CHEAP token, fee manager, and pool ID are configured together exactly once.
- Every distributor is bound to exactly one reward token.
- A Safe commits the exact drop totals and Merkle roots before an operator can
  execute approved batches.
- The operator cannot alter a recipient or amount without invalidating proof.
- This repository is pre-deployment. No address is canonical until it appears
  in `deployments/` with source verification and a signed release.

## Development

Requirements: Node 24+, pnpm 11+, and Foundry 1.7.1.

```bash
git clone --recurse-submodules https://github.com/Cheap-Coin/protocol.git
cd protocol
pnpm install --frozen-lockfile
pnpm check
```

CI additionally runs pinned Slither, Aderyn, Trivy, and dependency checks. These
tools do not replace an independent audit.

## Documentation

- `deployments/` defines canonical manifests and signed release verification.
- `docs/LAUNCH.md` and `docs/BANKR-SIMULATION.md` define the pre-broadcast review.
- `docs/RULES-v1.md` defines strict COST Diamond Drop holding rules.
- `docs/COMMUNITY-REWARDS.md` defines Genesis records and weighted-random CHEAP
  Surprise Drops.
- `SECURITY.md` explains private vulnerability reporting.
