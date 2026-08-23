# Security policy

Report vulnerabilities through GitHub's private security-reporting flow or email
`Dev@cheapcoin.fun`. Include the affected commit/program, impact, and a safe proof
of concept. Never publish an unpatched issue or send seed phrases, private keys,
provider credentials, private partner terms, signer recovery material, or user
identity mappings.

Only deployments listed in a signed, chain-verified public manifest are in scope
as supported deployments. The repository is currently pre-mainnet. No
value-holding program is production-ready without independent review or audit.

In scope are principal loss or lockout, signer/PDA confusion, account substitution,
unchecked arithmetic, initialization or upgrade-authority takeover, pause bypass,
duplicate claims, campaign over-distribution, manifest ambiguity, transaction
substitution, and reproducibility failures.

Do not move funds, access accounts that are not yours, degrade shared services, or
test third-party production systems without authorization. No bounty is promised
unless a separately signed program states one.
