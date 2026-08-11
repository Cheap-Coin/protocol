# Canonical deployments

No CheapCoin Robinhood Chain contracts are deployed yet. Live application mode
must remain unavailable until this directory contains one active, signed, and
independently verified deployment manifest.

## Public trust record

Each `*.manifest.json` file binds all production-facing configuration to one
release:

- Robinhood Chain ID and a finalized block/hash anchor;
- CHEAP address, fixed 100B supply, deployment receipt, and runtime-code hash;
- canonical COST identity and registry/source-verification evidence;
- pool ID, token ordering, actual fee parameters, fee manager, and beneficiary;
- protocol-owner Safe, creator recipient, holder-reward Safe, and limited operator;
- splitter/distributor addresses, constructor values, compiler settings, receipts,
  and runtime-code hashes;
- an explicit non-proxy, EIP-1967, or EIP-1167 classification for every code
  reference, including the pinned implementation address/code when applicable;
- vesting mode and, when enabled, its exact allocation, recipient, dates, vault,
  receipt, and runtime-code hash; and
- the full source commit, canonical path, and annotated signed Git release tag.

The machine-readable schema is
[`deployment-manifest-v1.schema.json`](deployment-manifest-v1.schema.json). The
TypeScript validator additionally enforces checksum addresses and cross-field
invariants that JSON Schema alone cannot express.

## Canonical bytes and identity

Manifest files use sorted, whitespace-free, integer-only JSON plus one final
newline. Their displayed SHA-256 is the digest of those exact UTF-8 bytes. A
formatting-only edit therefore cannot silently produce a different trusted file.

```bash
pnpm deployments:format -- deployments/launch.draft.json deployments/robinhood-mainnet-v1.manifest.json
pnpm deployments:validate
```

The formatter refuses to overwrite a file and requires the destination to match
`publication.manifestPath`. Draft files are not canonical releases and must be
removed before publication.

## Release and independent verification

1. Record the audited contract source commit in `publication.sourceCommit`.
2. Fill a draft only from finalized explorer, Bankr, Safe, and RPC evidence.
3. Format it, then verify its chain data before signing:

   ```bash
   ROBINHOOD_RPC_URL="<private archive RPC>" pnpm deployments:verify-chain -- deployments/robinhood-mainnet-v1.manifest.json --draft
   ```

4. Have a second reviewer reproduce the digest and verification results.
5. Commit the canonical manifest manually. For its first publication, use
   `publication.releaseSequence = 1` and create the annotated signed tag named
   exactly `deployment/<deploymentId>/v1`. Push the commit and tag atomically.
6. Verify the complete signed release again without `--draft`:

   ```bash
   pnpm deployments:validate -- deployments/robinhood-mainnet-v1.manifest.json --verify-tag
   ROBINHOOD_RPC_URL="<private archive RPC>" pnpm deployments:verify-chain -- deployments/robinhood-mainnet-v1.manifest.json
   ```

The signing key or SSH signing-key fingerprint must be published through the
project security channel before launch. `git verify-tag` must trust that disclosed
identity; an arbitrary valid signature is not sufficient.

The live-chain verifier checks EIP-1967 storage slots and canonical EIP-1167
runtime pointers, then hashes both proxy and implementation bytecode. An unknown
proxy pattern is a stop condition and requires a reviewed schema/tooling update;
it must not be mislabeled `none` merely to pass validation.

## Generate live settings

Only a canonical manifest with `status.state = "active"` and a locally verifiable
signed tag can generate settings:

```bash
pnpm deployments:env -- deployments/robinhood-mainnet-v1.manifest.json app
pnpm deployments:env -- deployments/robinhood-mainnet-v1.manifest.json services
```

Output contains public addresses, blocks, the release tag, and the exact manifest
SHA-256. It deliberately excludes RPC/API keys, database credentials, WalletConnect
IDs, signing keys, and other infrastructure settings. Those remain independently
managed secrets.

## Supersession

Deployment files and signed tags remain in Git history. A replacement receives a
new deployment ID and manifest. The prior record is then marked `superseded` with
a reason and replacement ID, its `releaseSequence` is incremented, and that exact
change receives a new immutable tag such as `deployment/<old-id>/v2`. Generators
reject a superseded record. At most one checked-in manifest may be active. A
signed tag is never moved, deleted, or reused.

An address absent from the current active signed manifest is not a supported
CheapCoin contract. Passing repository or chain checks is evidence, not a substitute
for the required independent audit and launch review.
