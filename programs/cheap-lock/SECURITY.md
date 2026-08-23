# cheap-lock security properties

- Every deposit uses a unique `(owner, deposit_id)` position PDA and a separate token vault.
- The configured mint is immutable and must use the legacy SPL Token program with mint and freeze authorities revoked.
- The recorded principal is written once. There is no top-up or admin-withdraw instruction.
- A position owner may withdraw in the same transaction path before or after maturity. Pause state is never read by withdrawal.
- Early withdrawal records `ExitedEarly`; it never reduces principal. Mature withdrawal records `WithdrawnMatured`.
- The vault's entire CHEAP balance is returned so an unsolicited transfer cannot prevent closure or trap principal.
- Position records remain after withdrawal for campaign snapshot reconciliation.

These properties require independent review and LiteSVM/devnet rehearsal before mainnet. The development program ID is not a deployment claim.
