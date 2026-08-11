# Bankr launch simulation sheet

Status: pre-deployment. Nothing in this file authorizes a broadcast transaction.

## Required request

Use a Bankr **user-wallet** launch on Robinhood Chain. Do not use an organization
Partner Key: Bankr documents partner-key deployments as Base-only and without
creator vesting.

The non-broadcast request must resolve to the following configuration:

```json
{
  "tokenName": "CheapCoin",
  "tokenSymbol": "CHEAP",
  "chain": "robinhood",
  "pairedStock": "0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2",
  "quoteOnlyFees": true,
  "feeRecipient": {
    "type": "wallet",
    "value": "<DEPLOYED_CHEAP_FEE_SPLITTER>"
  },
  "simulateOnly": true
}
```

`pairedStock` is confirmed directly by Bankr for its Robinhood Chain stock-paired
flow but is not currently shown in the public generic request schema. A successful
simulation is therefore mandatory. Use Bankr's supported vesting control rather
than inventing a JSON field:

- recommended: standard 15% vesting, one year total, 30-day cliff, with the
  immutable vault recipient set to the community CHEAP Safe; or
- alternative: no vesting, which sends 100% to the launch and leaves no preminted
  CHEAP for airdrops or scheduled burns.

If the stock-paired flow cannot set the vault recipient separately from the fee
beneficiary, stop. Do not allow vested CHEAP to be assigned to the COST splitter.

## Simulation evidence to retain

Bankr must return or identify all of the following before any broadcast:

1. Chain ID 4663 and deployer address.
2. Predicted CHEAP token address and fixed 100B supply.
3. Exact canonical COST address, token ordering, and `tokenIsToken0` value.
4. Uniswap v4 pool ID, hook, initializer, and the actual quote-only fee-manager
   target that implements `collectFees(poolId)`.
5. The splitter as the only CHEAP creator-fee beneficiary and its exact share.
6. `quoteOnlyFees: true`, with the creator share paid entirely in COST.
7. Every fee leg in basis points, including total trader fee and direct creator
   share. Do not infer a custom stock-pair fee from the generic schedule.
8. Vesting enabled/disabled, vault amount, recipient, cliff, and final unlock.
9. Gas payer, estimate, calldata or unsigned transaction, and every created or
   called contract address.

Two reviewers compare the raw response with this sheet. A summary written by an
agent or support representative is not a substitute for the actual response.

## Post-launch reconciliation

Before `CheapFeeSplitter.configurePool` is signed:

1. Verify the CHEAP token, pool, hook, and fee manager on Blockscout.
2. Query Bankr's public per-token fee endpoint and record its `poolId` and manager.
3. Build an unsigned self-custody claim and compare its target with the manager.
4. Confirm the splitter's onchain beneficiary shares for the exact pool ID.
5. Confirm a simulated `collectFees(poolId)` call from the splitter succeeds.

Quote-only launches may account for creator fees on a hook rather than the generic
initializer. The exact verified call target—not a label—is configured once.

## Bankr distributor acceptance

Bankr may initialize and execute a Diamond Drop only after it provides the exact
implementation/factory address, verified source, audit reference, initialization
calldata, and unsigned Safe payload. The approved instance must have:

- immutable COST token and campaign allocation root;
- claimed bitmap or equivalent replay protection;
- claim-for support that always pays the committed recipient;
- no arbitrary pre-expiry admin withdrawal;
- expiry and post-expiry sweep only to the holder-reward Safe; and
- an exact funded-total invariant.

Start with an unfunded initialization and a low-value rehearsal. The CHEAP indexer
and scoring services—not Bankr—remain responsible for recipient eligibility and
amounts.
