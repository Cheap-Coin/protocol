# Community contribution rewards

Status: deterministic foundation implemented; live X ingestion and payouts are
not active.

Bankr can execute supplied distribution payloads, but it does not determine who
controls an X account, link that identity to a wallet, score activity, or decide
whether an account is abusive. CheapCoin must own and disclose those decisions.

## Product boundary

Normal Diamond Drop eligibility remains based on continuous CHEAP holdings. A
community contribution round is a separate optional source of allocations. It
must never silently reduce a holder-funded pool after a window begins.

The recommended funding order is:

1. use a separately approved community or partner budget; or
2. publish an exact community basis-point share before the round starts.

A wallet may receive both a holder allocation and a community allocation. The
two positive amounts are merged by address before the final batch commitment,
so a wallet is paid once per asset-specific drop.

## Deterministic scoring boundary

The public TypeScript module accepts only already-approved event commitments.
It does not call X or trust raw engagement counts. For each round it requires:

- inclusive start and end Unix timestamps;
- versioned action names and positive point values;
- per-action UTC-day and full-round caps;
- unique 32-byte event commitments;
- canonical reward wallet addresses; and
- a versioned set of excluded project or abusive wallets.

Events are sorted by time and commitment before caps are applied. The earliest
eligible event wins when a cap is reached. Unknown actions, duplicate events,
invalid addresses, malformed commitments, and out-of-round timestamps stop the
calculation instead of being silently ignored.

The output includes accepted events, rejected events with deterministic reasons,
per-wallet points, total points, exact reward allocations, and undistributed
amount. Integer division dust uses largest remainder and lowercase address order.

## Live identity and event verification

A future private ingestion service must verify both sides of a link:

1. X OAuth proves control of the provider user ID.
2. A short-lived, domain-bound wallet challenge proves control of the EVM wallet.
3. The user explicitly consents to the link and stated public-disclosure policy.
4. Nonces are one-time, expire quickly, and cannot be replayed across domains or
   chains.

The ingestion service should store provider IDs, event IDs, timestamps, rule
versions, review status, and commitments, not copies of post text or unnecessary
profile data. OAuth tokens remain encrypted service secrets and never enter a
drop artifact or public repository.

## Action policy

Use flat, capped actions tied to official campaigns. Do not score follower count,
impressions, likes received, token price promotion, repeated identical replies,
or unverifiable screenshots. Those signals are easy to buy or manipulate and
reward spam rather than useful work.

Possible actions are examples until owner approval:

- an original educational CheapCoin post;
- a substantive quote or reply on an allowlisted campaign;
- hosting or speaking in an approved community Space;
- a verified deal submission; or
- documented moderation or project work.

Weights, caps, campaign IDs, excluded wallets, funding, start time, end time, and
appeal deadline must be published before scoring. Rule changes apply only to a
future round.

## Anti-Sybil and review

No automated score proves a person is unique. Deterministic flags can identify
duplicate provider IDs, duplicate wallets, replayed event IDs, link changes,
burst activity, and shared funding patterns, but an approved reviewer makes the
final inclusion decision under published rules. Reviewers must record a reason,
support an appeal window, and never alter a finalized artifact.

One provider account and one primary reward wallet per round is the conservative
default. Wallet changes should have a cooldown and take effect in a future round.
Team, treasury, pool, router, distributor, bot, and campaign-control accounts are
excluded unless a separately disclosed grant policy names them.

## Activation gates

Community rewards remain inactive until all of the following are complete:

- owner-approved funding source, budget share, actions, weights, and caps;
- reviewed X developer access and OAuth/data-retention terms;
- wallet-link challenge implementation and security tests;
- anti-Sybil review and appeal procedures;
- a new public artifact schema that commits contribution inputs and both pools;
- deterministic fixtures and independent reproduction; and
- one unfunded shadow round followed by a low-value rehearsal.

The existing v3 Diamond Drop format remains holder-only. Adding community inputs
will use a new schema version rather than rewriting v3 evidence.
