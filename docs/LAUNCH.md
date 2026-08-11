# Production launch and operations checklist

Owner-facing inputs are summarized in [OWNER-CHECKLIST.md](OWNER-CHECKLIST.md).

## Confirmed decisions

| Item | Decision |
|---|---|
| Network | Robinhood Chain only |
| Solana | Retired from all future utility; no migration or legacy allocation |
| Product | CheapCoin covers anything worth getting for less, not groceries only |
| Primary pair | Planned CHEAP/COST Bankr/Doppler launch |
| Fee route | 25% creator, 75% holder-reward Safe |
| Additional RWAs | Separate immutable distributor per approved token |

## Owner inputs still required

| Input | Required decision |
|---|---|
| Shared wallets | Signers, approval threshold, and recovery process |
| Creator recipient | Address receiving the immutable 25% primary-fee share |
| CHEAP launch | Total supply, vault allocation, vesting, metadata, and funding |
| Reward rules | CHEAP floor, window length/start block, and V1 approval |
| Drop policy | Minimum economical balance and target cadence |
| Initial assets | COST only at launch, or named additional assets after testing |
| Partner offers | Only executed offers may be marked live |
| Infrastructure | Archive RPC, PostgreSQL, hosting, monitoring, and backups |

## Phase 1: governance and review

- Create separate protocol-owner and holder-reward Safes.
- Use at least a 2-of-3 approval threshold and hardware-backed signers.
- Approve `RULES-v1.md`, the clean Solana retirement notice, and exclusions.
- Audit the contracts and independently reproduce TypeScript/Solidity roots.
- Confirm COST and every later reward asset through Robinhood's live registry.

## Phase 2: deploy the primary market

1. Deploy `CheapFeeSplitter` with canonical COST, creator recipient, holder Safe,
   and protocol-owner Safe.
2. Simulate the Bankr/Doppler launch. Confirm chain 4663, canonical COST pairing,
   quote-only fees, splitter beneficiary, supply, vault, and all returned addresses.
3. Have two people compare the simulation with the signed launch sheet.
4. Submit and verify the token, pool, fee beneficiary, vault, source code, and
   launch receipt on Blockscout and Bankr.
5. Deploy the COST `CheapBatchDistributor` with the limited operator and owner Safe.
6. Configure the verified fee manager and pool ID into the splitter exactly once.
7. Publish every address. Remove active Solana purchase and contract links.

Do not rely on an undocumented deployment field without a successful simulation.
The primary pool accepts one quote asset; multi-RWA support is implemented in the
reward layer rather than by fragmenting the initial CHEAP market.

## Phase 3: data and shadow operation

- Apply all PostgreSQL migrations and run against a production archive RPC.
- Seed the COST reward asset and distributor in the public asset registry.
- Reindex CHEAP from launch with two providers and compare balances.
- Run at least one full shadow window without a payout.
- Independently reproduce holder scores, allocations, and both Merkle roots.

## Phase 4: first low-value COST drop

1. Collect and split fees; reconcile the fee-manager event and both recipients.
2. Close the first window after finality and create the holder snapshot.
3. Fund only the COST distributor with the approved budget.
4. Generate the asset-aware artifact and publish its immutable URI and hash.
5. Verify token, distributor target, amount, roots, batches, and exclusions before
   the Safe signs `createDrop`.
6. Execute approved batches, reconcile all balances/events, and finalize.
7. Switch the application to live mode only after RPC, API, explorer, artifact,
   and onchain state agree.

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
secrets, restrict origins, verify `/api/status` and indexer `/health`, and make
`NEXT_PUBLIC_APP_MODE=live` the final change.
