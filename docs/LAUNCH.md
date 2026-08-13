# Production launch and operations checklist

Owner-facing inputs are summarized in [OWNER-CHECKLIST.md](OWNER-CHECKLIST.md).
The exact non-broadcast launch review is in
[BANKR-SIMULATION.md](BANKR-SIMULATION.md).

## Confirmed decisions

| Item | Decision |
|---|---|
| Network | Robinhood Chain only |
| Solana | Retired from all future utility; no migration or legacy allocation |
| Product | CheapCoin covers anything worth getting for less, not groceries only |
| Primary pair | Planned CHEAP/COST Bankr/Doppler launch |
| Supply | Bankr standard fixed 100,000,000,000 CHEAP; no later minting |
| Creator-fee assets | Standard two-asset mode: CHEAP and COST; verified in simulation |
| Fee route | 25% creator, 75% community Safe for each collected asset |
| Additional RWAs | Separate immutable distributor per approved token |

## Owner inputs still required

| Input | Required decision |
|---|---|
| Shared wallets | Signers, approval threshold, and recovery process |
| Creator recipient | Address receiving the immutable 25% primary-fee share |
| CHEAP launch | Default 15% one-year vesting or no vesting; vault recipient and metadata |
| CHEAP inventory | If vesting is enabled, published policy for unlocked airdrops and burns |
| Reward rules | CHEAP floor, window length/start block, and V1 approval |
| Drop policy | Minimum economical balance and target cadence |
| Initial assets | COST only at launch, or named additional assets after testing |
| Partner offers | Only executed offers may be marked live |
| Infrastructure | Archive RPC, PostgreSQL, hosting, monitoring, and backups |

## Phase 1: governance and review

- Create separate protocol-owner and holder-reward Safes.
- Use at least a 2-of-3 approval threshold and hardware-backed signers.
- Choose a replaceable, limited distribution operator and fund it only with the
  ETH needed for bounded batch execution. Bankr may be its transaction interface,
  but no Bankr background operator or campaign service is assumed.
- Approve the holding rules, participation rules, the clean Solana retirement
  notice, and exclusions.
- Audit the contracts and independently reproduce TypeScript/Solidity roots.
- Confirm COST and every later reward asset through Robinhood's live registry.

## Phase 2: deploy the primary market

1. Deploy `CheapFeeSplitter` with canonical COST, creator recipient, holder Safe,
   and protocol-owner Safe.
2. Run a non-broadcast Bankr/Doppler simulation with chain 4663, canonical COST
   as `pairedStock`, standard two-asset fees (`quoteOnlyFees: false`), and the splitter as the CHEAP launch's
   sole fee beneficiary. Confirm the fixed 100B supply, chosen vesting mode and
   vault recipient, complete fee schedule, token ordering, pool ID, and exact
   fee-manager target used by `collectFees(poolId)`.
3. Have two people compare the simulation with the signed launch sheet.
4. Submit and verify the token, pool, fee beneficiary, vault, source code, and
   launch receipt on Blockscout and Bankr.
5. Deploy the COST `CheapBatchDistributor` with the limited operator and owner Safe.
6. Query Bankr's public fee endpoint and compare its fee-manager/pool targets and
   both fee assets with the simulation and verified contracts. Configure the
   CHEAP token, manager, and pool into the splitter once.
7. Publish every address. Remove active Solana purchase and contract links.

Do not rely on a ticker or an undocumented deployment field without a successful
simulation. Canonical COST's own token beneficiary is not part of this launch;
only the CHEAP/COST pool's CHEAP beneficiary is configured.
The primary pool accepts one quote asset; multi-RWA support is implemented in the
reward layer rather than by fragmenting the initial CHEAP market.

## Phase 3: data and shadow operation

- Apply all PostgreSQL migrations and run against a production archive RPC.
- Seed the COST reward asset and distributor in the public asset registry.
- Reindex CHEAP from launch with two providers and compare balances.
- Require `/health/ready` to report zero lag and a fresh finalized-chain check.
- Run at least one full shadow window without a payout.
- Independently reproduce strict holding decisions, allocations, and both Merkle roots.

## Phase 4: first low-value COST drop

1. Collect and split fees; reconcile the fee-manager event and both recipients.
2. Close the first window after finality and create the holder snapshot.
3. Fund only the COST distributor with the approved budget.
4. Generate the strict holder artifact, bind it to the exact holding rules bytes
   and digest, and publish its immutable URI and hash.
5. Verify token, distributor target, amount, roots, batches, and exclusions before
   the Safe signs `createDrop`.
6. Execute approved batches from the registered limited operator, reconcile all
   balances/events, and finalize. If Bankr is used, submit the artifact's exact
   raw transactions from the connected operator wallet; do not ask it to derive
   recipients or amounts.
7. Switch the application to live mode only after RPC, API, explorer, artifact,
   and onchain state agree.

## Canonical release gate

Before any live-mode switch, publish the v1 deployment manifest described in
[`../deployments/README.md`](../deployments/README.md). The release must be
canonical JSON, anchored at a finalized block, independently reproduced, bound to
the audited source commit, and contained in the matching annotated signed Git tag.
Run both the signed-tag validator and the live-chain verifier. Generate the app
and services public settings from that manifest; do not copy addresses by hand.

## Adding another RWA token

1. Confirm the token is active in Robinhood's current asset registry.
2. Record its UID, canonical chain-4663 address, name, symbol, decimals, logo,
   funding source, and any applicable operational restrictions.
3. Deploy a new `CheapBatchDistributor` with that token immutable.
4. Verify and register the distributor; complete a testnet and low-value rehearsal.
5. Fund it directly from the Safe only after the exact received amount is known.
6. Generate an asset-specific artifact and execute the normal drop runbook.

Never automatically substitute a token because another asset becomes inactive.

## Every-drop stop conditions

Stop on cursor mismatch, token-registry mismatch, amount mismatch, unexpected
asset, failed proof, changed Safe target, corporate-action uncertainty, or
canonical-token status change. A partially executed drop follows the seven-day
paused remediation path and is never silently rewritten.

## Go-live environment

Populate `.env.example`, enable HTTPS enforcement, separate public and server
secrets, restrict origins, verify the application `/api/status`, require indexer
`/health/ready` to report zero lag, and make `NEXT_PUBLIC_APP_MODE=live` the final
change.
