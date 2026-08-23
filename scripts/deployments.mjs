#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  canonicalJson,
  decodePumpSharingConfigAccount,
  decodePumpSwapPoolAccount,
  derivePumpFeeAccounts,
  derivePumpSwapPoolAddresses,
  launchManifestArtifactHash,
  parseLaunchManifestJson,
  TOKEN_2022_PROGRAM,
  WRAPPED_SOL_MINT,
} from "../packages/protocol/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deploymentDirectory = resolve(root, "deployments");
const schema = JSON.parse(readFileSync(resolve(deploymentDirectory, "launch-manifest-v1.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function usage() {
  return [
    "Usage:",
    "  node scripts/deployments.mjs validate [manifest] [--verify-tag]",
    "  node scripts/deployments.mjs format <draft.json> <manifest.json>",
    "  node scripts/deployments.mjs env <manifest> <app|services>",
    "  node scripts/deployments.mjs verify-chain <manifest> [--draft]",
    "",
    "verify-chain reads SOLANA_RPC_URL and never prints it.",
  ].join("\n");
}

function withinRoot(filePath) {
  const resolved = resolve(root, filePath);
  const path = relative(root, resolved);
  if (!path || path === ".." || path.startsWith(`..${sep}`)) throw new Error("Path must stay inside the repository");
  return { resolved, path: path.split(sep).join("/") };
}

function schemaCheck(value, label) {
  if (!validateSchema(value)) throw new Error(`${label}: ${ajv.errorsText(validateSchema.errors, { separator: "; " })}`);
}

function readManifest(filePath) {
  const location = withinRoot(filePath);
  if (!existsSync(location.resolved)) throw new Error(`Manifest does not exist: ${location.path}`);
  const source = readFileSync(location.resolved, "utf8");
  const value = JSON.parse(source);
  schemaCheck(value, location.path);
  const parsed = parseLaunchManifestJson(source);
  if (parsed.manifest.publication.manifestPath !== location.path) {
    throw new Error(`${location.path}: publication.manifestPath differs`);
  }
  return { ...location, source, ...parsed };
}

function runGit(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function verifyTag(entry) {
  const tag = entry.manifest.publication.signedTag;
  if (!tag) throw new Error(`${entry.path}: signedTag is required`);
  if (runGit(["cat-file", "-t", tag]) !== "tag") throw new Error(`${tag} is not an annotated tag`);
  runGit(["verify-tag", tag]);
  const tagged = execFileSync("git", ["show", `${tag}:${entry.path}`], { cwd: root, windowsHide: true });
  if (!tagged.equals(Buffer.from(entry.source))) throw new Error(`${tag} does not contain the exact manifest bytes`);
  runGit(["merge-base", "--is-ancestor", entry.manifest.publication.sourceCommit, `${tag}^{commit}`]);
}

function paths(argument) {
  return argument
    ? [argument]
    : readdirSync(deploymentDirectory).filter((name) => name.endsWith(".manifest.json")).sort().map((name) => `deployments/${name}`);
}

function validateCommand(args) {
  const verifySignedTag = args.includes("--verify-tag");
  const positional = args.filter((value) => value !== "--verify-tag");
  if (positional.length > 1) throw new Error(usage());
  const entries = paths(positional[0]).map(readManifest);
  if (entries.filter(({ manifest }) => manifest.lifecycle.state !== "PRELAUNCH").length > 1) {
    throw new Error("Only one launched manifest may be active");
  }
  for (const entry of entries) {
    if (verifySignedTag) verifyTag(entry);
    process.stdout.write(`${entry.path}: ${entry.manifest.lifecycle.state} ${entry.artifactSha256}${verifySignedTag ? " (tag verified)" : ""}\n`);
  }
  if (entries.length === 0) process.stdout.write("No launch manifests published; application remains PRELAUNCH.\n");
}

function formatCommand(args) {
  if (args.length !== 2) throw new Error(usage());
  const input = withinRoot(args[0]);
  const output = withinRoot(args[1]);
  if (!existsSync(input.resolved)) throw new Error(`Draft does not exist: ${input.path}`);
  if (existsSync(output.resolved)) throw new Error(`Refusing to overwrite ${output.path}`);
  const value = JSON.parse(readFileSync(input.resolved, "utf8"));
  if (value?.lifecycle?.state !== "PRELAUNCH" && value?.publication?.artifactSha256 === null) {
    value.publication.artifactSha256 = launchManifestArtifactHash(value);
  }
  schemaCheck(value, input.path);
  const parsed = parseLaunchManifestJson(JSON.stringify(value));
  if (parsed.manifest.publication.manifestPath !== output.path) throw new Error("Output path differs from publication.manifestPath");
  writeFileSync(output.resolved, canonicalJson(parsed.manifest), { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${output.path}: canonical manifest written (${parsed.artifactSha256}).\n`);
}

function dotenv(values) {
  return Object.entries(values).map(([key, value]) => `${key}=${value ?? ""}`).join("\n") + "\n";
}

function envCommand(args) {
  if (args.length !== 2 || !["app", "services"].includes(args[1])) throw new Error(usage());
  const entry = readManifest(args[0]);
  if (entry.manifest.lifecycle.state !== "PRELAUNCH") verifyTag(entry);
  const prefix = args[1] === "app" ? "NEXT_PUBLIC_" : "";
  const manifest = entry.manifest;
  process.stdout.write(dotenv({
    [`${prefix}LAUNCH_STATE`]: manifest.lifecycle.state,
    [`${prefix}SOLANA_CLUSTER`]: manifest.cluster,
    [`${prefix}LAUNCH_MANIFEST_SHA256`]: manifest.publication.artifactSha256,
    [`${prefix}LAUNCH_VERIFICATION_SLOT`]: manifest.verification.slot,
    [`${prefix}CHEAP_MINT`]: manifest.token.mint,
    [`${prefix}CHEAP_TOKEN_PROGRAM`]: manifest.token.tokenProgram,
    [`${prefix}PUMPSWAP_POOL`]: manifest.canonicalPool?.address,
    [`${prefix}PUMPSWAP_LP_MINT`]: manifest.canonicalPool?.lpMint,
    [`${prefix}PUMPSWAP_VERIFIED_SLOT`]: manifest.canonicalPool?.verifiedAtSlot,
    [`${prefix}CHEAP_LOCK_PROGRAM`]: manifest.programs.cheapLock,
    [`${prefix}OWNER_TREASURY_VAULT`]: manifest.governance.ownerTreasuryVault,
    [`${prefix}COMMUNITY_TREASURY_VAULT`]: manifest.governance.communityTreasuryVault,
  }));
}

async function rpc(url, method, params = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`RPC ${method} returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`RPC ${method} failed: ${payload.error.message}`);
  return payload.result;
}

function accountBytes(value, label) {
  if (!Array.isArray(value?.data) || typeof value.data[0] !== "string" || value.data[1] !== "base64") {
    throw new Error(`${label} did not return base64 account data`);
  }
  return Uint8Array.from(Buffer.from(value.data[0], "base64"));
}

function transactionAccountAddresses(value, label) {
  const keys = value?.transaction?.message?.accountKeys;
  if (!Array.isArray(keys)) throw new Error(`${label} transaction account list is unavailable`);
  const addresses = new Set(keys.map((key) => typeof key === "string" ? key : key?.pubkey).filter((key) => typeof key === "string"));
  for (const key of [...(value?.meta?.loadedAddresses?.writable ?? []), ...(value?.meta?.loadedAddresses?.readonly ?? [])]) {
    if (typeof key === "string") addresses.add(key);
  }
  return addresses;
}

async function verifyChainCommand(args) {
  const draft = args.includes("--draft");
  const positional = args.filter((value) => value !== "--draft");
  if (positional.length !== 1) throw new Error(usage());
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) throw new Error("SOLANA_RPC_URL is required");
  const entry = readManifest(positional[0]);
  if (entry.manifest.lifecycle.state === "PRELAUNCH") throw new Error("PRELAUNCH has no chain state to verify");
  if (!draft) verifyTag(entry);
  const manifest = entry.manifest;
  const verificationSlot = Number(manifest.verification.slot);
  if (!Number.isSafeInteger(verificationSlot) || verificationSlot <= 0) throw new Error("Manifest verification slot exceeds the safe RPC integer range");
  const finalizedSlot = await rpc(rpcUrl, "getSlot", [{ commitment: "finalized" }]);
  if (BigInt(finalizedSlot) < BigInt(manifest.verification.slot)) throw new Error("Manifest verification slot is not finalized");
  const block = await rpc(rpcUrl, "getBlock", [verificationSlot, { commitment: "finalized", transactionDetails: "none", rewards: false, maxSupportedTransactionVersion: 0 }]);
  if (!block || block.blockhash !== manifest.verification.blockhash) throw new Error("Manifest verification blockhash does not match its finalized slot");
  const addresses = [
    ["CHEAP mint", manifest.token.mint, manifest.token.tokenProgram, false],
    ["Pump global", manifest.pump.global, manifest.pump.programId, false],
    ["Pump bonding curve", manifest.pump.bondingCurve, manifest.pump.programId, false],
    ["Pump sharing config", manifest.pump.sharingConfig, manifest.pump.feesProgramId, false],
    ...(manifest.canonicalPool ? [["canonical PumpSwap pool", manifest.canonicalPool.address, manifest.pump.ammProgramId, false]] : []),
    ...(manifest.canonicalPool ? [["PumpSwap LP mint", manifest.canonicalPool.lpMint, TOKEN_2022_PROGRAM, false]] : []),
    ...(manifest.programs.cheapLock ? [["cheap-lock program", manifest.programs.cheapLock, null, true]] : []),
    ...(manifest.programs.rewards ? [["rewards program", manifest.programs.rewards.programId, null, true]] : []),
  ];
  const accountValues = new Map();
  for (const [label, address, expectedOwner, expectedExecutable] of addresses) {
    const result = await rpc(rpcUrl, "getAccountInfo", [address, { commitment: "finalized", encoding: "base64", minContextSlot: verificationSlot }]);
    if (!result?.value) throw new Error(`${label} does not exist`);
    if (expectedOwner && result.value.owner !== expectedOwner) throw new Error(`${label} owner mismatch`);
    if (Boolean(result.value.executable) !== expectedExecutable) throw new Error(`${label} executable state mismatch`);
    accountValues.set(address, result.value);
  }

  const mintResult = await rpc(rpcUrl, "getAccountInfo", [manifest.token.mint, { commitment: "finalized", encoding: "jsonParsed", minContextSlot: verificationSlot }]);
  const mintInfo = mintResult?.value?.data?.parsed;
  if (mintResult?.value?.owner !== manifest.token.tokenProgram || mintInfo?.type !== "mint") throw new Error("CHEAP mint could not be decoded by its declared token program");
  if (mintInfo.info?.isInitialized !== true || mintInfo.info?.decimals !== manifest.token.decimals) throw new Error("CHEAP mint initialization or decimals mismatch");
  if (mintInfo.info?.mintAuthority !== null || mintInfo.info?.freezeAuthority !== null) throw new Error("CHEAP mint and freeze authorities must both be revoked");

  const derivedPump = await derivePumpFeeAccounts({
    mint: manifest.token.mint,
    pumpProgramId: manifest.pump.programId,
    pumpFeesProgramId: manifest.pump.feesProgramId,
    pumpAmmProgramId: manifest.pump.ammProgramId,
  });
  for (const [label, actual, expected] of [
    ["Pump global", manifest.pump.global, derivedPump.pumpGlobal],
    ["Pump bonding curve", manifest.pump.bondingCurve, derivedPump.bondingCurve],
    ["Pump sharing config", manifest.pump.sharingConfig, derivedPump.sharingConfig],
  ]) {
    if (actual !== expected) throw new Error(`${label} does not match its canonical PDA`);
  }

  const sharing = decodePumpSharingConfigAccount(accountBytes(accountValues.get(manifest.pump.sharingConfig), "Pump sharing config"));
  if (sharing.mint !== manifest.token.mint || sharing.status !== "ACTIVE" || !sharing.adminRevoked) {
    throw new Error("Pump sharing config is not active, mint-bound, and admin-revoked");
  }
  const expectedShares = [
    { address: manifest.governance.ownerTreasuryVault, shareBps: 7_500 },
    { address: manifest.governance.communityTreasuryVault, shareBps: 2_500 },
  ];
  if (sharing.shareholders.length !== expectedShares.length || expectedShares.some((expected, index) => {
    const actual = sharing.shareholders[index];
    return !actual || actual.address !== expected.address || actual.shareBps !== expected.shareBps;
  })) throw new Error("Pump sharing config does not contain the exact rehearsed 75/25 recipients");

  if (manifest.canonicalPool) {
    const pool = decodePumpSwapPoolAccount(accountBytes(accountValues.get(manifest.canonicalPool.address), "canonical PumpSwap pool"));
    if (pool.index !== 0) throw new Error("Canonical PumpSwap pool must use index 0");
    if (pool.baseMint !== manifest.token.mint || pool.quoteMint !== WRAPPED_SOL_MINT || pool.lpMint !== manifest.canonicalPool.lpMint) {
      throw new Error("Canonical PumpSwap pool mint or LP fields differ from the manifest");
    }
    const derivedPool = await derivePumpSwapPoolAddresses({ index: pool.index, creator: pool.creator, baseMint: pool.baseMint, quoteMint: pool.quoteMint });
    if (derivedPool.pool !== manifest.canonicalPool.address || derivedPool.poolBump !== pool.bump || derivedPool.lpMint !== pool.lpMint) {
      throw new Error("Canonical PumpSwap pool or LP mint does not match its official PDA derivation");
    }
  }
  const signatures = [manifest.pump.feeSharing.finalizedSignature, manifest.canonicalPool?.verificationSignature, manifest.programs.rewards?.deploymentSignature].filter(Boolean);
  const signatureStatuses = new Map();
  if (signatures.length) {
    const statuses = await rpc(rpcUrl, "getSignatureStatuses", [signatures, { searchTransactionHistory: true }]);
    statuses.value.forEach((status, index) => {
      if (!status || status.err || status.confirmationStatus !== "finalized") throw new Error(`Verification signature ${signatures[index]} is not finalized and successful`);
      if (BigInt(status.slot) > BigInt(manifest.verification.slot)) throw new Error(`Verification signature ${signatures[index]} occurred after the manifest verification slot`);
      signatureStatuses.set(signatures[index], status);
    });
  }
  const transactionEvidence = [
    { label: "Pump fee-sharing", signature: manifest.pump.feeSharing.finalizedSignature, required: [manifest.pump.sharingConfig], exactSlot: null },
    ...(manifest.canonicalPool ? [{ label: "canonical PumpSwap pool", signature: manifest.canonicalPool.verificationSignature, required: [manifest.canonicalPool.address], exactSlot: manifest.canonicalPool.verifiedAtSlot }] : []),
    ...(manifest.programs.rewards ? [{ label: "rewards deployment", signature: manifest.programs.rewards.deploymentSignature, required: [manifest.programs.rewards.programId], exactSlot: null }] : []),
  ];
  for (const evidence of transactionEvidence) {
    const status = signatureStatuses.get(evidence.signature);
    if (evidence.exactSlot && BigInt(status.slot) !== BigInt(evidence.exactSlot)) throw new Error(`${evidence.label} verification signature slot mismatch`);
    const transaction = await rpc(rpcUrl, "getTransaction", [evidence.signature, { commitment: "finalized", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
    if (!transaction) throw new Error(`${evidence.label} verification transaction is unavailable`);
    const accounts = transactionAccountAddresses(transaction, evidence.label);
    for (const required of evidence.required) if (!accounts.has(required)) throw new Error(`${evidence.label} verification transaction does not reference ${required}`);
  }
  process.stdout.write(`${entry.path}: finalized mint authorities, Pump PDAs, 75/25 sharing, canonical pool, ownership, executability, and signatures verified at slot ${manifest.verification.slot}.\n`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "validate") return validateCommand(args);
  if (command === "format") return formatCommand(args);
  if (command === "env") return envCommand(args);
  if (command === "verify-chain") return verifyChainCommand(args);
  throw new Error(usage());
}

main().catch((error) => {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${rpcUrl ? message.split(rpcUrl).join("<redacted RPC URL>") : message}\n`);
  process.exitCode = 1;
});
