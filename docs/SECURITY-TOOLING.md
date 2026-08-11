# Security tooling and release gates

The project uses a small set of established, free tools. No scanner is treated
as an audit, and adding more scanners is not a substitute for resolving findings.

## Smart contracts

| Layer | Tool | Release rule |
|---|---|---|
| Build and tests | Foundry | Format and compiler warnings pass; all unit tests pass |
| Property tests | Foundry fuzz + invariant | No failed property, no handler revert, fixed campaign settings committed |
| Static analysis | Slither `0.11.6` | High-severity finding blocks merge; medium/low requires triage |
| Independent static analysis | Aderyn `0.6.8` | Report retained and every high finding triaged before merge |
| Known-findings research | Solodit | Manual pre-audit review by contract pattern and dependency |
| Libraries | OpenZeppelin Contracts | Exact version locked; only reviewed modules used |
| Human assurance | Independent audit | Required before meaningful mainnet value |

Contract review starts with [the explicit invariant list](../contracts/INVARIANTS.md).
Solodit is a research database, not an automated correctness badge. Search it for
fee collection, Merkle distribution, batch payout, replay, reserve accounting,
ERC-20 edge cases, and privileged remediation findings before audit freeze.
Current Slither and Aderyn results are recorded in the
[preliminary static-analysis triage](../audits/PRELIMINARY-STATIC-ANALYSIS.md).

## Application and services

| Layer | Tool/control | Release rule |
|---|---|---|
| Types and lint | TypeScript + ESLint | Zero errors and zero warnings |
| Unit/integration | Vitest | All deterministic and API tests pass |
| Browser behavior | Playwright | Preview/live separation and critical wallet flows pass |
| Dependencies | pnpm audit + Dependabot | No unresolved high/critical production advisory |
| Repository scan | Trivy `0.73.0` | No high/critical dependency, secret, or IaC finding |
| Runtime headers | Next.js CSP + Fastify Helmet | Tested in staging; no permissive production fallback |
| Abuse resistance | Fastify rate limit + strict CORS | Only documented read methods and production origins |
| Dynamic test | OWASP ZAP baseline | Run against staging once a stable URL exists |

Never upload production wallet addresses, customer analytics, database dumps, or
secrets to a third-party scanner. CI receives only the minimum read permissions.

## Finding workflow

1. Preserve the raw report as a CI artifact.
2. Reproduce the finding locally or in an isolated branch.
3. Classify impact and affected deployment state.
4. Fix and add a regression unit/property test.
5. Record any suppression beside the code with a concrete rationale.
6. Require an independent reviewer for suppressions and contract changes.

## Mainnet gate

Automated checks, independent audit, exact Bankr/Doppler launch simulation, Safe
rehearsal, canonical asset verification, frontend/API staging test, monitoring,
backups, and a low-value end-to-end distribution must all pass. A CI green check
alone never authorizes a deployment.
