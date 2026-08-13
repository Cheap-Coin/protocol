# CheapCoin owner decisions

This checklist keeps launch decisions short and reviewable. Technical deployment
does not begin until every required blank is completed and approved by the owner.

## 1. Launch identity

- [ ] Final token name and symbol: `CheapCoin` / `CHEAP`, or: __________
- [ ] Final public description approved
- [ ] Gold cart coin, website, and official social links approved
- [x] Robinhood Chain is the only network for the new launch
- [x] The old Solana token receives no migration allocation or future utility

## 2. Supply and launch allocation

- [x] Total CHEAP supply: 100,000,000,000 fixed by the Bankr launch
- [ ] Choose one: default 15% vesting / no vesting
- [ ] If vested, community vault Safe address: __________
- [ ] If vested, approved use of unlocked CHEAP (airdrops/burns): __________
- [ ] Initial COST Diamond Drop budget, if any beyond earned fees: __________

With default vesting, 85% seeds the CHEAP/COST launch and 15% unlocks over one
year after a 30-day cliff. With no vesting, 100% enters the launch and CheapCoin
has no preminted CHEAP for community airdrops or scheduled burns. Bankr does not
offer a custom percentage or schedule in its standard launch.

## 3. Shared-wallet control

- [ ] Creator recipient address for the 25% fee share: __________
- [ ] Holder-reward Safe address for the 75% fee share: __________
- [ ] Community CHEAP vault Safe address, if vesting is enabled: __________
- [ ] Deployed `CheapFeeSplitter` address used as Bankr fee beneficiary: __________
- [ ] Protocol-owner Safe address: __________
- [ ] Limited drop-operator address: __________
- [ ] Operator transaction interface: Bankr / hardware wallet / CLI / other: __________
- [ ] Non-Bankr fallback for the same raw transactions tested
- [ ] Safe signers and approval threshold approved
- [ ] Hardware-wallet and signer-recovery rehearsal completed

No one person should control every launch, treasury, and reward key. Bankr does
not provide a background Diamond Drop operator; if selected here, it is only the
connected operator wallet's interface for submitting prebuilt transactions.

## 4. First Diamond Drop rules

- [ ] COST is the only first reward asset, or approved alternatives: __________
- [ ] Minimum CHEAP held for the full window: __________
- [ ] Minimum and maximum hidden window length: __________
- [ ] First window start block and hidden-end commitment: __________
- [ ] Streak multiplier schedule: __________
- [ ] Minimum economical reward amount: __________
- [ ] Intended drop cadence: __________
- [ ] Treasury reserve rule or maximum COST budget per drop: __________
- [ ] Excluded project, pool, router, treasury, distributor, and operational wallets approved
- [ ] Exact published V1 rules file and SHA-256 digest approved

Rewards are limited to the amount actually funded. No payout, asset, cadence, or
future value is guaranteed.

## 5. Community Surprise Drops

- [ ] Genesis program start/end and appeal deadline: __________
- [ ] Approved original X actions and simple point values: __________
- [ ] Daily and full-round limits: __________
- [ ] Plain-language Genesis statement approved: points do not promise a token amount
- [ ] Post-launch minimum points/events and CHEAP holding floor: __________
- [ ] Activity-point cap and CHEAP holding-weight cap: __________
- [ ] Winner count and fixed CHEAP budget per round: __________
- [ ] Future finalized entropy block rule: __________
- [ ] Decide whether account links may be shown publicly
- [ ] Reviewer, deletion contact, and appeal process: __________

COST Diamond Drops depend only on strict CHEAP holding. Surprise Drops are a
separate weighted-random CHEAP program for approved contributors who also hold
CHEAP. Higher capped activity and holding weights improve the odds and selected
amount, but selection is never guaranteed. Likes, reposts, follows, comments,
views, and Space listening are not paid point events.

## 6. Partner benefits

For every offer shown as live, record:

- [ ] Signed partner approval
- [ ] Benefit and eligibility terms
- [ ] Start and end dates
- [ ] Quantity or budget limit
- [ ] Geographic or account restrictions
- [ ] Redemption process and support contact
- [ ] Permission to display the partner name and brand assets

Planned categories and demonstrations remain clearly labelled until these items
are complete.

## 7. Production operations

- [ ] Hosting and database provider selected
- [ ] Production archive RPC and backup provider selected
- [ ] Monitoring, backups, and incident alerts tested
- [ ] Indexer readiness tested at zero finalized-block lag
- [ ] Public support contact confirmed
- [ ] Independent contract review scheduled or completed
- [ ] Testnet dress rehearsal completed
- [ ] Final Bankr/Doppler simulation reviewed before signing

## Approval

- Owner: __________
- Approved date: __________
- Rules version or Git commit: __________
