# Verified Bankr, Robinhood Chain, and GME findings

Checked 2026-08-10 against official documentation, live Bankr API responses, and
Robinhood Chain transactions.

## What Bankr/Doppler supplies

- Bankr's launch API deploys on Robinhood Chain by default and returns the token,
  Uniswap v4 pool ID, fee manager/beneficiary distribution, and transaction.
- `quoteOnlyFees: true` fixes creator fees in the quote asset at launch. It cannot
  be retrofitted later.
- Bankr currently documents a 0.7% pool swap fee with 95%—0.665% of trading
  volume—assigned to the creator beneficiary. Other hook and LP fee legs are
  separate; 0.665% is not the pool's total trading fee.
- The live GME launch response proves a Robinhood Chain Doppler launch can use a
  stock token as `pairedStock`. It identifies the GME Stock Token address, GME
  memecoin, pool ID, deployer, and fee recipient.
- The documented fee-manager ABI includes
  `collectFees(bytes32 poolId) returns (uint256 fees0, uint256 fees1)`, matching
  the interface used by `CheapFeeSplitter`.
- The verified GME fee manager exposes `collectFees(bytes32 poolId)`, beneficiary
  shares, and per-pool cumulative accounting. It does not expose a direct
  `claimFees(address token)` entry point; that phrase refers to a Bankr API or
  interface wrapper rather than the onchain initializer ABI.

Primary references:

- [Bankr deploy API](https://docs.bankr.bot/token-launching/api-reference/deploy-token-launch/)
- [Bankr fee redirecting](https://docs.bankr.bot/token-launching/fee-splitting/)
- [Bankr creator-fee reads and ABI](https://docs.bankr.bot/token-launching/reading-fees/)
- [Bankr fee claiming](https://docs.bankr.bot/token-launching/claiming-fees/)

## What GME demonstrates

The live GME launch is paired with the GME Stock Token and its public Diamond
Drops product uses a $50 continuous floor, lowest balance, and a streak ladder up
to 2x. However, its public Bankr app has only file/app-data permissions. Its three
visible scripts copy precomputed summary, wallet-index, and leaderboard JSON into
app storage. The transfer indexing, snapshot computation, allocation, and payout
engine therefore exist outside the visible Bankr app.

Onchain, the GME treasury first used a generic transfer helper and later called a
small custom `disperseToken(address,address[],uint256[])` contract. That confirms
the stock distribution layer is separate from the GME memecoin and Doppler pool.
Bankr subsequently confirmed directly that it can initialize standard Merkle or
batch distributors and execute distribution/burn payloads, but does not calculate
holder streaks, X activity, wallet links, allocations, or anti-Sybil decisions.
CHEAP must supply the validated recipients and exact amounts.

CHEAP reuses the sound concepts—fee-funded stock-token drops, lowest-balance
windows, streaks, batch transfers, and a public ledger—while improving the trust
boundary with immutable 25/75 routing, exact Safe-approved batch roots, reorg
handling, remediation, and versioned rules.

Live references:

- [GME Diamond Drops](https://thegameneverstopped.com/diamond-drops)
- [GME launch record](https://api.bankr.bot/token-launches/0xc2362AfF2A2a4CC1f48cF3Dab2C4e2605eb94BA3)
- [GME public Bankr app](https://api.bankr.bot/public/apps/0xe311d712bd0669896bcb47f38845ad71a641b8be/gme-diamond-drops)
- [Example 200-recipient GME distribution](https://robinhoodchain.blockscout.com/tx/0x176f065854dffb640759469db13bf73c1435784ff87db63d6f122df863ad288f)
- [GME custom distributor](https://robinhoodchain.blockscout.com/address/0x159b0Ac04c94a94302391aa4593B49Ee5D5115F2)

## Robinhood Chain facts used here

- Chain ID is 4663 and ETH is the gas token.
- It is an Arbitrum Layer 2. Soft confirmation, posting to Ethereum, and Ethereum
  finality are different settlement stages; irreversible drops should wait for
  full finality.
- The public RPC is rate-limited and not recommended for production historical
  indexing; use an archive provider.
- Canonical stock-token identity must come from Robinhood's live registry. The
  current COST deployment used by the app is
  `0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2` on chain 4663.
- Stock-token metadata includes a corporate-action multiplier. USD displays must
  not mix the raw REST equity price with token units without applying that
  multiplier.

Primary references:

- [Robinhood Chain connection and RPC guidance](https://docs.robinhood.com/chain/connecting/)
- [Robinhood Chain transaction finality](https://docs.robinhood.com/chain/transaction-finality/)
- [Canonical token contracts](https://docs.robinhood.com/chain/contracts/)
- [Stock Token metadata and prices](https://docs.robinhood.com/chain/stock-token-apis/)

## Decision for CHEAP

Use Bankr/Doppler for the launch and CHEAP/COST market. Use CHEAP-owned, audited
scoring and artifact infrastructure for Diamond Drops and partner benefits. Bankr
may execute a drop through an exact reviewed distributor instance. Set quote-only
fees and the splitter beneficiary at launch, verify the actual response, and never
infer production addresses from a ticker symbol alone.

## Direct Bankr configuration confirmation: 2026-08-10

Bankr confirmed a standard Robinhood Chain stock-paired launch uses a fixed 100B
supply and supports COST as `pairedStock`. Standard wallet launches offer either
15% vesting over one year with a 30-day cliff or no vesting; the public Bankr docs
state there is no custom percentage or schedule. Pool fees depend on the selected
launch configuration and must be captured from the final simulation.

The vendor's statement that COST and CHEAP have separate *deployment*
beneficiaries is true but easy to misapply. Canonical COST already exists, and
CheapCoin neither deploys it nor changes its beneficiary. The new CHEAP/COST pool
has one CHEAP launch beneficiary. With default mixed fees, live GME data and
Bankr's public API show that beneficiary accounting can contain both pool assets.
CHEAP instead selects `quoteOnlyFees: true`, so the direct creator share is paid
only in COST and the existing immutable 25/75 COST splitter remains sufficient.

Bankr also confirmed that distributor behavior is instance-specific: claim-for,
root mutability, expiration, and clawback are chosen during setup. No production
campaign is funded until Bankr supplies the exact Robinhood Chain implementation,
verified source, audit material, initialization values, and unsigned Safe payload
for review. "Supplied upon initialization" is not treated as pre-approval.

## Multi-RWA update: 2026-08-10

Robinhood's official `/rhj/assets` registry exposes canonical metadata, status,
chain deployments, logos, and corporate-action multipliers for many Stock Tokens.
At the time of this check, COST, SPY, AMZN, AAPL, and NVDA were active on chain
4663. WMT was not returned, so CheapCoin must not configure or advertise a WMT
reward rail unless it later appears active in the official registry.

A Uniswap pool has one quote asset. CheapCoin therefore keeps COST as the planned
primary CHEAP market and implements other RWA tokens as independently funded,
asset-specific Diamond Drops. This provides broad reward support without creating
several competing CHEAP liquidity pools. The indexer includes a registry verifier,
and each additional token uses a separate immutable distributor.

- [Robinhood Stock Token API](https://docs.robinhood.com/chain/stock-token-apis/)
- [Robinhood canonical contracts](https://docs.robinhood.com/chain/contracts/)
- [Bankr deploy API](https://docs.bankr.bot/token-launching/api-reference/deploy-token-launch/)
