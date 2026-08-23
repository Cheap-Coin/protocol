# Product boundary

CheapCoin is a Solana-first research, community, benefits, rewards, and liquidity
application centered on a clean Pump.fun CHEAP launch.

The public protocol supplies verifiable commitments and self-custodial transaction
building. It does not custody funds, execute swaps, calculate investment returns,
promise rewards, or turn X activity into an automatic payout. Token unit price is
not a Cheap Score input by itself.

## Lifecycle

1. `PRELAUNCH`: no mint or pool is claimed; CHEAP-only actions are disabled.
2. `BONDING_CURVE`: the signed manifest identifies the Pump mint, curve, fee-share
   configuration, treasury vaults, and finalized verification slot.
3. `PUMPSWAP`: the manifest additionally identifies the single canonical
   CHEAP/wrapped-SOL pool and LP mint. Only then may deposit/withdraw preparation
   be enabled. Swaps remain outside the application.

## User guarantees

- Every lock deposit has a separate immutable position and vault.
- A user can withdraw the entire vault balance before or after maturity.
- Early withdrawal marks the position `ExitedEarly`; it cannot slash principal.
- Administrators cannot withdraw user principal or top up/change a position.
- A pause cannot block withdrawal.
- Published campaigns commit to asset, exact budget, rules, snapshot slot,
  allocation hash/list or root, treasury, expiration, and reconciliation.

The legacy CHEAP mint remains onchain and may still trade, but it is unsupported.
No old supply, liquidity, price, or entitlement carries into this launch.
