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
- [ ] Safe signers and approval threshold approved
- [ ] Hardware-wallet and signer-recovery rehearsal completed

No one person should control every launch, treasury, and reward key.

## 4. First Diamond Drop rules

- [ ] COST is the only first reward asset, or approved alternatives: __________
- [ ] Minimum CHEAP held for the full window: __________
- [ ] Window length: __________
- [ ] First window start block or date: __________
- [ ] Streak multiplier schedule: __________
- [ ] Minimum economical reward amount: __________
- [ ] Intended drop cadence: __________
- [ ] Excluded project, pool, router, treasury, distributor, and operational wallets approved
- [ ] Exact published V1 rules file and SHA-256 digest approved

Rewards are limited to the amount actually funded. No payout, asset, cadence, or
future value is guaranteed.

## 5. Community contribution rewards

- [ ] Choose one: separately funded community budget / published share of a drop
- [ ] Approved actions and simple point values: __________
- [ ] Daily and full-round limits: __________
- [ ] Decide whether X-to-wallet links may be shown publicly
- [ ] Reviewer and appeal deadline: __________

Social activity does not automatically earn a reward. Only pre-announced,
verified, capped actions may enter an approved round. Normal holder eligibility
continues under its own published rules.

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
