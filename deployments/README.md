# Solana deployment manifests

No launched manifest is published yet. In that state `pnpm deployments:validate`
prints that the application remains `PRELAUNCH`.

`launch-manifest-v1.schema.json` commits to the lifecycle, CHEAP mint and token
program, Pump programs/accounts, finalized 75/25 fee-sharing transaction, two
Squads vaults, canonical pool/LP mint after graduation, program deployments,
cluster, verification slot/blockhash, source commit, signed tag, and artifact hash.

## Safe workflow

1. Create and rehearse both Squads vaults and the 2-of-3 owner-controlled signer
   recovery process. Never put signer keys in a repository or backend.
2. Build a draft under `deployments/` whose `publication.manifestPath` names the
   intended final file. `PRELAUNCH` drafts contain no invented mint, pool, program,
   signature, tag, or artifact hash.
3. After an owner action, populate values only from finalized Solana RPC/account
   evidence and the exact Pump transaction.
4. Canonicalize without overwriting an existing artifact:

   ```bash
   pnpm deployments:format -- deployments/launch.draft.json deployments/cheap-solana-v1.manifest.json
   ```

5. Verify the draft against finalized chain state before tagging:

   ```bash
   SOLANA_RPC_URL="<private restricted RPC>" pnpm deployments:verify-chain -- deployments/cheap-solana-v1.manifest.json --draft
   ```

6. The developer reviews, commits, creates an annotated signed tag such as
   `launch/cheap-solana-v1/v1`, and then runs both checks without `--draft`:

   ```bash
   pnpm deployments:validate -- deployments/cheap-solana-v1.manifest.json --verify-tag
   SOLANA_RPC_URL="<private restricted RPC>" pnpm deployments:verify-chain -- deployments/cheap-solana-v1.manifest.json
   ```

7. Generate public application or private service configuration from the verified
   artifact; review output before deployment:

   ```bash
   pnpm deployments:env -- deployments/cheap-solana-v1.manifest.json app
   pnpm deployments:env -- deployments/cheap-solana-v1.manifest.json services
   ```

The verifier never prints `SOLANA_RPC_URL`. It binds the recorded blockhash to the
finalized slot; checks that CHEAP has no mint or freeze authority; derives the
official Pump PDAs; decodes the active, admin-revoked 75/25 sharing config; and,
after graduation, decodes and derives the index-zero CHEAP/wrapped-SOL pool and
its Token-2022 LP mint. It also retrieves each verification transaction, binds the
pool transaction to its exact recorded slot, and requires the relevant sharing
config, pool, or rewards program account to appear in that transaction. A
`BONDING_CURVE` manifest cannot claim a pool. Program presence is not an audit
claim; binary/source correspondence, audits, and upgrade-authority state require
separate deployment records.
