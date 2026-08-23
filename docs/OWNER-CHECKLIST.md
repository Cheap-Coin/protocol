# Owner checklist

## Accounts and recovery

- [ ] Three independent signer devices/recovery sets created and never uploaded.
- [ ] 2-of-3 Squads recovery rehearsed with each signer absent in turn.
- [ ] Owner and community vault addresses are distinct and independently verified.
- [ ] Private RPC/X/provider credentials are outside repositories and browser env.

## Pump launch

- [ ] Final mint metadata and owner launch decision reviewed.
- [ ] Official Pump program IDs/PDAs verified against current primary sources.
- [ ] Fee-share rehearsal names owner 75% and community 25% in exact address order.
- [ ] Effectively final shareholder transaction simulated and reviewed by two
      signers before broadcast.
- [ ] No application setting changed before finalized reconciliation.
- [ ] Signed `BONDING_CURVE` manifest published from exact finalized evidence.

## Graduation

- [ ] Canonical PumpSwap pool and LP mint derived and verified.
- [ ] Quote mint is wrapped SOL; reserves and graduation signature are finalized.
- [ ] Signed `PUMPSWAP` manifest published before liquidity controls are enabled.
- [ ] No second pool, embedded swap, or additional yield claim exists.

## Programs

- [ ] Rust formatting, Clippy, unit/property, LiteSVM, and devnet suites pass.
- [ ] Dependency, secret, and reproducible-build checks pass.
- [ ] Independent audit/review scope and remediation are published.
- [ ] Configuration and upgrade authority are held by Squads.
- [ ] Withdrawals succeed while paused and before maturity in adversarial rehearsal.
- [ ] Upgrade authority freeze occurs only after the documented stability period.

## Campaigns

- [ ] Rules, snapshot, exact budget, treasury, list/root, expiry, and hashes approved.
- [ ] Duplicate/address/total/balance checks and transaction simulation pass.
- [ ] Large-campaign rewards commit and deployment match the independent audit.
- [ ] Execution uses unsigned Squads payloads; no backend signer exists.
- [ ] Finalized signatures and exact reconciliation are published without identity
      mappings, credentials, or private partner terms.
