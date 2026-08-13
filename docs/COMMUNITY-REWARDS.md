# Community Surprise Drops

Status: deterministic weighted selection and social evidence validation are
implemented. Live provider OAuth, API collection, and funded drops are inactive
until credentials, consent, review, appeal, and randomness rehearsals pass.

Bankr can submit project-supplied raw distribution transactions from a connected
operator wallet. It does not link social identities to wallets, calculate CHEAP
eligibility, review abuse, select winners, or operate a background CHEAP service.

## Separate from Diamond Drops

CheapCoin has two independent community reward programs:

1. **COST Diamond Drops** use only CHEAP holding history. Every qualifying wallet
   shares a funded COST budget deterministically. Social activity is irrelevant.
2. **CHEAP Surprise Drops** use a weighted-random drawing among approved social
   contributors who also meet the published CHEAP holding floor. Qualification
   never guarantees selection.

The programs publish separate rules, candidate commitments, budgets, artifacts,
and ledger entries. A social decision cannot reduce or disqualify a wallet's COST
Diamond Drop.

## Pre-launch Genesis record

There is no Robinhood Chain CHEAP balance before launch. Opted-in, verified
pre-launch contributions can therefore create only a Genesis activity record.
Those points may be carried into the first post-launch Surprise round only under
rules published before that round. The wallet must then meet its CHEAP holding
floor. A Genesis record alone creates no token entitlement and promises no amount.

## Post-launch weighted drawing

Each Surprise round publishes before collection closes:

- its CHEAP budget and maximum winner count;
- the minimum CHEAP balance, holding unit, and capped holding units;
- accepted actions, points, daily/round caps, minimum points, and point cap;
- exclusions, review deadline, appeal process, and evidence policy;
- a future entropy chain and block chosen before that block is known.

An eligible wallet's selection weight is:

`capped activity points x capped CHEAP holding units`

Winners are sampled without replacement. More approved work and more CHEAP held
increase the chance of selection, but both inputs are capped and no eligible
wallet is guaranteed to win. The configured winner count must be smaller than the
eligible candidate count. Once selected, a winner's share of the fixed CHEAP
budget is proportional to its selection weight. Exact integer dust is assigned
deterministically.

The complete candidate set is frozen first. Its commitment and the future entropy
block are published before the entropy exists. After the block is finalized, the
seed and every draw can be reproduced. An operator may not choose among several
block hashes after seeing the outcome.

## Supported social evidence

Every account is linked with provider OAuth plus a short-lived, domain-bound
wallet signature and explicit consent. The production scoring allowlist is
deliberately narrow:

- original X posts, substantive quote posts, and educational threads;
- hosting or speaking in an approved X Space while verifiable records exist.

Likes, reposts, follows, replies/comments, views, impressions, follower counts,
and passive Space listening are analytics-only. They never create points. TikTok
account linking and own-video display may be implemented, but TikTok activity is
not reward-scored until its applicable platform rules and API access permit it.
Scraping is not an accepted fallback.

Qualifying promotional content must carry the project-approved disclosure and
evidence required by the campaign terms. The project is not claiming an X
partnership; this is a disclosure and platform-policy control for incentivized
content.

## Privacy and review

The private service stores keyed provider/event commitments, timestamps, consent
evidence, review state, and score records. It does not publish usernames, post
text, raw provider IDs, OAuth tokens, raw signatures, or rejected identity links.
One account per provider and one reward wallet per round is the conservative
default. Reviewers check replay, copied content, automation, coordinated abuse,
excluded project accounts, and campaign-specific evidence. Every rejection has
a reason and appeal path; finalized artifacts are never edited.

## Activation gates

Before a funded Surprise Drop:

- publish owner-approved actions, caps, dates, budget, winner count, holding
  parameters, exclusions, disclosure, and appeal terms;
- confirm X developer access, consent, retention, revocation, and deletion flows;
- complete wallet-link, CSRF/state, PKCE, replay, and substitution tests;
- freeze and publish the candidate commitment before the entropy block;
- run one unfunded shadow round and one low-value rehearsal;
- publish the full candidate decisions, entropy proof, winners, allocations,
  Merkle roots, and execution calldata without publishing private social data.

## Primary references

- [X promotion guidelines](https://help.x.com/en/rules-and-policies/x-contest-rules)
- [X authenticity policy](https://help.x.com/en/rules-and-policies/authenticity)
- [X paid-partnership policy](https://help.x.com/en/rules-and-policies/paid-partnerships-policy)
- [X developer guidelines](https://docs.x.com/developer-guidelines)
- [FTC social-media disclosure guidance](https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers)
