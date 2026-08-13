# Bankr launch simulation sheet

Status: pre-deployment. Nothing in this file authorizes a broadcast transaction.

## Required request

Use a Bankr user-wallet launch on Robinhood Chain. Do not use an organization
Partner Key: Bankr documents partner-key deployments as Base-only and without
creator vesting.

The non-broadcast request must resolve to the following configuration:

```json
{
  "tokenName": "CheapCoin",
  "tokenSymbol": "CHEAP",
  "chain": "robinhood",
  "pairedStock": "0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2",
  "quoteOnlyFees": false,
  "feeRecipient": {
    "type": "wallet",
    "value": "<DEPLOYED_CHEAP_FEE_SPLITTER>"
  },
  "simulateOnly": true
}
```

`pairedStock` is confirmed directly by Bankr for its Robinhood Chain stock-paired
flow but is not currently shown in the public generic request schema. A successful
simulation is therefore mandatory. Use Bankr's supported vesting control:

- recommended: standard 15% vesting, one year total and 30-day cliff; or
- alternative: no vesting, which sends 100% to the launch and leaves no preminted
  CHEAP for separate airdrops or burns.

If the stock-paired flow cannot set the vesting beneficiary independently from
the fee beneficiary, stop and review the complete response. Do not assume a field
or recipient that the simulation does not prove.

## Simulation evidence to retain

Bankr must return or identify all of the following before any broadcast:

1. Chain ID 4663 and deployer address.
2. Predicted CHEAP token address and fixed 100B supply.
3. Exact canonical COST address, token ordering, and `tokenIsToken0` value.
4. Uniswap v4 pool ID, hook, initializer, and actual fee-manager target that
   implements `collectFees(poolId)`.
5. The splitter as the only CHEAP launch creator-fee beneficiary and its exact share.
6. Standard two-asset creator fees, with the launched-token leg paid in CHEAP and
   the quote-token leg paid in COST. Native ETH is gas, not an assumed fee asset.
7. Every fee leg in basis points. Do not infer a custom stock-pair rate from a
   generic schedule or a support message.
8. Vesting enabled/disabled, allocation, recipient, cliff, and final unlock.
9. Gas payer, estimate, calldata or unsigned transaction, and every created or
   called contract address.

Two reviewers compare the raw response with this sheet. A summary written by an
agent or support representative is not a substitute for the actual response.

## Post-launch reconciliation

Before `CheapFeeSplitter.configurePool` is signed:

1. Verify the CHEAP token, pool, hook, and fee manager on Blockscout.
2. Query Bankr's public per-token fee endpoint and record its pool ID, manager,
   token ordering, and both fee assets.
3. Build an unsigned self-custody claim and compare its target with the manager.
4. Confirm the splitter is the beneficiary for the exact pool ID.
5. Confirm a simulated `collectFees(poolId)` call from the splitter returns CHEAP
   and/or COST, then complete one low-value collection and reconcile both assets.
6. Configure the verified CHEAP token, fee manager, and pool exactly once.

## Distribution boundary

Bankr has no documented CHEAP-specific campaign factory, eligibility engine,
background operator, or custom gas-sponsorship service for this program. It can
submit arbitrary EVM transactions (`to`, `value`, `data`) from a connected wallet.
That generic transaction path is optional and is not part of launch acceptance.

CheapCoin deploys its own reviewed `CheapBatchDistributor` for each reward asset.
The indexer and scoring services determine recipients and amounts, the Safe
commits the exact roots and budget, and a replaceable limited operator submits
only committed batches. If Bankr is used as the operator interface, the connected
wallet must be the registered operator and hold sufficient gas where sponsorship
does not apply. No Bankr prompt is trusted to calculate or alter a campaign.

Start with an unfunded deployment rehearsal and a low-value end-to-end drop. A
Bankr outage must never prevent the Safe from rotating the operator or executing
the same published calldata through another wallet interface.
