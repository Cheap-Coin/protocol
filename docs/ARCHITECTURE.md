# Architecture

```text
Pump.fun launch -> CHEAP/SOL bonding curve -> canonical PumpSwap pool
        |                         |                    |
        v                         v                    v
  75% owner vault          signed launch         LP read + unsigned
  25% community vault      manifest              deposit/withdraw
        |
        +-> Squads-approved direct campaigns (small)
        +-> pinned audited Merkle deployment (large)

Wallet -> SIWS session -> private portfolio/watchlist/lock/claim APIs
Wallet -> cheap-lock program -> isolated position vault -> full withdrawal
Providers -> finalized ingestion -> sourced/stamped public research APIs
```

## Authority and custody

One owner-controlled 2-of-3 Squads multisig has three independent signer devices.
Separate vaults under that multisig receive the owner and community shares. Pump
creator fees are configured 75% to the owner vault and 25% to the community vault.
The backend never holds a signing key; it builds artifacts for wallet or Squads
review and simulation.

The lock configuration and upgrade authority are transferred to Squads. Pausing
can reject new positions but cannot stop withdrawals. After an independent audit
and stability period, the program upgrade authority is frozen and the manifest is
updated with the finalized evidence.

## Public protocol surface

- `LaunchManifest` is the sole lifecycle/configuration commitment.
- `TokenSummary` carries market, authority, holder, risk-gate, score, sponsorship,
  source, and freshness data.
- `CommunityActivity` and `LeaderboardEntry` separate aggregate analytics from
  private wallet identity.
- `LockPosition` records principal/tier/state and finalized campaign references.
- `CampaignManifest` commits budget, rules, snapshot, recipients, treasury, expiry,
  transactions, and reconciliation.

## Data and execution separation

Helius finalized data is the primary chain ingestion path. Jupiter Tokens and DEX
Screener enrich discovery/market data with cached source timestamps. Provider
unavailability becomes a stale/unavailable state, never fabricated fallback data.

X activity analytics are informational. Campaign execution consumes an independent
recipient/allocation artifact; no code joins an X score directly to an airdrop.
Public ledger artifacts exclude credentials, private partner terms, and wallet-to-X
mappings.
