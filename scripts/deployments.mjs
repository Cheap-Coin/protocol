#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createPublicClient, getAddress, http } from "viem";
import {
  deploymentContractReferences,
  deploymentEnvironment,
  parseDeploymentManifestJson,
  serializeDeploymentManifest,
  serializeDotenv,
  verifyDeploymentRuntimeCode,
} from "../packages/protocol/dist/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deploymentsDirectory = resolve(repositoryRoot, "deployments");
const deploymentSchema = JSON.parse(
  readFileSync(resolve(deploymentsDirectory, "deployment-manifest-v1.schema.json"), "utf8"),
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(deploymentSchema);
const eip1967ImplementationSlot =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const erc20MetadataAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
];

const feeSplitterAbi = [
  ...["rewardToken", "creatorRecipient", "holderTreasury", "owner", "feeManager"].map(
    (name) => ({
      type: "function",
      name,
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "address" }],
    }),
  ),
  {
    type: "function",
    name: "poolId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "poolConfigured",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  ...["CREATOR_SHARE_BPS", "HOLDER_SHARE_BPS"].map((name) => ({
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  })),
];

const distributorAbi = [
  ...["rewardToken", "operator", "owner"].map((name) => ({
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  })),
  ...["MAX_BATCH_SIZE", "REMEDIATION_DELAY"].map((name) => ({
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  })),
];

function usage() {
  return [
    "Usage:",
    "  node scripts/deployments.mjs validate [manifest] [--verify-tag]",
    "  node scripts/deployments.mjs format <draft.json> <manifest.json>",
    "  node scripts/deployments.mjs env <manifest> <app|services>",
    "  node scripts/deployments.mjs verify-chain <manifest> [--draft]",
    "",
    "verify-chain reads ROBINHOOD_RPC_URL from the environment and never prints it.",
    "env verifies the signed release tag before emitting non-secret dotenv settings.",
  ].join("\n");
}

function formatCommand(arguments_) {
  if (arguments_.length !== 2) throw new Error(usage());
  const input = pathWithinRepository(arguments_[0]);
  const output = pathWithinRepository(arguments_[1]);
  if (!existsSync(input.resolved)) throw new Error(`Draft does not exist: ${input.pathFromRoot}`);
  if (existsSync(output.resolved)) throw new Error(`Refusing to overwrite existing file: ${output.pathFromRoot}`);
  let untrusted;
  try {
    untrusted = JSON.parse(readFileSync(input.resolved, "utf8"));
  } catch (error) {
    throw new Error(`Draft is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!validateSchema(untrusted)) {
    throw new Error(
      `Draft does not match deployment-manifest-v1.schema.json: ${ajv.errorsText(
        validateSchema.errors,
        { separator: "; " },
      )}`,
    );
  }
  const canonical = serializeDeploymentManifest(untrusted);
  const parsed = parseDeploymentManifestJson(canonical);
  if (parsed.manifest.publication.manifestPath !== output.pathFromRoot) {
    throw new Error(
      `Output must match publication.manifestPath (${parsed.manifest.publication.manifestPath})`,
    );
  }
  writeFileSync(output.resolved, canonical, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${output.pathFromRoot}: canonical manifest written (${parsed.sha256}).\n`);
}

function pathWithinRepository(filePath) {
  const resolved = resolve(repositoryRoot, filePath);
  const pathFromRoot = relative(repositoryRoot, resolved);
  if (!pathFromRoot || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === "..") {
    throw new Error("Manifest path must resolve to a file inside the protocol repository");
  }
  return { resolved, pathFromRoot: pathFromRoot.split(sep).join("/") };
}

function readManifest(filePath) {
  const location = pathWithinRepository(filePath);
  if (!existsSync(location.resolved)) throw new Error(`Manifest does not exist: ${location.pathFromRoot}`);
  const source = readFileSync(location.resolved, "utf8");
  const untrusted = JSON.parse(source);
  if (!validateSchema(untrusted)) {
    throw new Error(
      `Manifest does not match deployment-manifest-v1.schema.json: ${ajv.errorsText(
        validateSchema.errors,
        { separator: "; " },
      )}`,
    );
  }
  const parsed = parseDeploymentManifestJson(source);
  if (parsed.manifest.publication.manifestPath !== location.pathFromRoot) {
    throw new Error(
      `Manifest publication path is ${parsed.manifest.publication.manifestPath}, not ${location.pathFromRoot}`,
    );
  }
  return { ...location, source, ...parsed };
}

function runGit(arguments_) {
  return execFileSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function verifySignedTag(entry) {
  const tag = entry.manifest.publication.signedTag;
  if (runGit(["cat-file", "-t", tag]) !== "tag") {
    throw new Error(`${tag} is missing or is not an annotated signed tag`);
  }
  runGit(["verify-tag", tag]);
  const taggedManifest = execFileSync(
    "git",
    ["show", `${tag}:${entry.manifest.publication.manifestPath}`],
    {
      cwd: repositoryRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (!taggedManifest.equals(Buffer.from(entry.source, "utf8"))) {
    throw new Error(`Signed tag ${tag} does not contain the exact manifest bytes being used`);
  }
  try {
    runGit(["merge-base", "--is-ancestor", entry.manifest.publication.sourceCommit, `${tag}^{commit}`]);
  } catch {
    throw new Error(
      `Source commit ${entry.manifest.publication.sourceCommit} is not an ancestor of ${tag}`,
    );
  }
}

function manifestPaths(argument) {
  if (argument) return [argument];
  return readdirSync(deploymentsDirectory)
    .filter((name) => name.endsWith(".manifest.json"))
    .sort()
    .map((name) => resolve(deploymentsDirectory, name));
}

function validateCommand(arguments_) {
  const verifyTag = arguments_.includes("--verify-tag");
  const positional = arguments_.filter((entry) => entry !== "--verify-tag");
  if (positional.length > 1) throw new Error(usage());
  const entries = manifestPaths(positional[0]).map(readManifest);
  const identifiers = new Set();
  const active = [];
  for (const entry of entries) {
    if (identifiers.has(entry.manifest.deploymentId)) {
      throw new Error(`Duplicate deployment ID: ${entry.manifest.deploymentId}`);
    }
    identifiers.add(entry.manifest.deploymentId);
    if (entry.manifest.status.state === "active") active.push(entry.manifest.deploymentId);
    if (verifyTag) verifySignedTag(entry);
    process.stdout.write(
      `${entry.pathFromRoot}: ${entry.manifest.status.state} ${entry.sha256}${
        verifyTag ? " (signed tag verified)" : ""
      }\n`,
    );
  }
  if (!positional[0]) {
    if (active.length > 1) {
      throw new Error(`Multiple active deployments are forbidden: ${active.join(", ")}`);
    }
    for (const entry of entries) {
      if (
        entry.manifest.status.state === "superseded" &&
        !identifiers.has(entry.manifest.status.supersededBy)
      ) {
        throw new Error(
          `${entry.manifest.deploymentId} references missing replacement ${entry.manifest.status.supersededBy}`,
        );
      }
    }
  }
  if (entries.length === 0) {
    process.stdout.write("No deployment manifests published; live mode remains unavailable.\n");
  } else {
    process.stdout.write(`${entries.length} canonical deployment manifest(s) verified.\n`);
  }
}

function envCommand(arguments_) {
  if (arguments_.length !== 2 || !["app", "services"].includes(arguments_[1])) {
    throw new Error(usage());
  }
  const entry = readManifest(arguments_[0]);
  verifySignedTag(entry);
  process.stdout.write(serializeDotenv(deploymentEnvironment(entry.manifest, arguments_[1])));
}

function assertEqual(label, actual, expected) {
  if (typeof actual === "string" && typeof expected === "string") {
    const bothHex = /^0x[0-9a-fA-F]+$/.test(actual) && /^0x[0-9a-fA-F]+$/.test(expected);
    if (bothHex ? actual.toLowerCase() === expected.toLowerCase() : actual === expected) return;
  } else if (actual === expected) {
    return;
  }
  throw new Error(`${label} mismatch: expected ${String(expected)}, received ${String(actual)}`);
}

async function readContract(client, address, abi, functionName) {
  return client.readContract({ address, abi, functionName });
}

async function verifyReceipt(client, label, transactionHash, blockNumber, blockHash, contractAddress) {
  const receipt = await client.getTransactionReceipt({ hash: transactionHash });
  assertEqual(`${label} receipt status`, receipt.status, "success");
  assertEqual(`${label} receipt block`, receipt.blockNumber, BigInt(blockNumber));
  assertEqual(`${label} receipt block hash`, receipt.blockHash, blockHash);
  if (contractAddress) {
    assertEqual(`${label} created contract`, receipt.contractAddress, contractAddress);
  }
}

async function verifyToken(client, label, asset, expectedSupply) {
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    readContract(client, asset.contract?.address ?? asset.address, erc20MetadataAbi, "name"),
    readContract(client, asset.contract?.address ?? asset.address, erc20MetadataAbi, "symbol"),
    readContract(client, asset.contract?.address ?? asset.address, erc20MetadataAbi, "decimals"),
    expectedSupply === undefined
      ? Promise.resolve(undefined)
      : readContract(
          client,
          asset.contract?.address ?? asset.address,
          erc20MetadataAbi,
          "totalSupply",
        ),
  ]);
  assertEqual(`${label} name`, name, asset.name);
  assertEqual(`${label} symbol`, symbol, asset.symbol);
  assertEqual(`${label} decimals`, decimals, asset.decimals);
  if (expectedSupply !== undefined) assertEqual(`${label} total supply`, totalSupply, expectedSupply);
}

async function verifyProxyPointers(client, manifest) {
  await Promise.all(
    deploymentContractReferences(manifest).map(async ({ label, reference }) => {
      if (reference.proxy.kind === "none") return;
      let actualImplementation;
      if (reference.proxy.kind === "eip1967") {
        const stored = await client.getStorageAt({
          address: reference.address,
          slot: eip1967ImplementationSlot,
        });
        if (!stored || !/^0x[0-9a-fA-F]{64}$/.test(stored)) {
          throw new Error(`${label} EIP-1967 implementation slot is empty or malformed`);
        }
        actualImplementation = getAddress(`0x${stored.slice(-40)}`);
      } else {
        const code = await client.getBytecode({ address: reference.address });
        const match = code?.toLowerCase().match(
          /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/,
        );
        if (!match?.[1]) {
          throw new Error(`${label} does not contain canonical EIP-1167 runtime bytecode`);
        }
        actualImplementation = getAddress(`0x${match[1]}`);
      }
      assertEqual(
        `${label} ${reference.proxy.kind} implementation`,
        actualImplementation,
        reference.proxy.implementation.address,
      );
    }),
  );
}

async function verifyChainCommand(arguments_) {
  const draft = arguments_.includes("--draft");
  const positional = arguments_.filter((entry) => entry !== "--draft");
  if (positional.length !== 1) throw new Error(usage());
  const rpcUrl = process.env.ROBINHOOD_RPC_URL;
  if (!rpcUrl) throw new Error("ROBINHOOD_RPC_URL is required for verify-chain");
  const entry = readManifest(positional[0]);
  if (!draft) verifySignedTag(entry);
  const manifest = entry.manifest;
  const client = createPublicClient({
    transport: http(rpcUrl, { retryCount: 2, timeout: 20_000 }),
  });
  assertEqual("RPC chain ID", await client.getChainId(), manifest.network.chainId);

  const [finalityAnchor, finalizedHead] = await Promise.all([
    client.getBlock({ blockNumber: BigInt(manifest.network.finalityBlock) }),
    client.getBlock({ blockTag: "finalized" }),
  ]);
  assertEqual("finality anchor hash", finalityAnchor.hash, manifest.network.finalityBlockHash);
  if (finalizedHead.number < BigInt(manifest.network.finalityBlock)) {
    throw new Error(
      `Manifest finality block ${manifest.network.finalityBlock} is newer than finalized head ${finalizedHead.number}`,
    );
  }

  const mismatches = await verifyDeploymentRuntimeCode(manifest, (address) =>
    client.getBytecode({ address }),
  );
  if (mismatches.length > 0) {
    throw new Error(
      `Runtime bytecode mismatch: ${mismatches
        .map((entry_) => `${entry_.label} ${entry_.address}`)
        .join(", ")}`,
    );
  }
  await verifyProxyPointers(client, manifest);

  await Promise.all([
    verifyReceipt(
      client,
      "CHEAP deployment",
      manifest.cheapToken.contract.deploymentTransactionHash,
      manifest.cheapToken.contract.deploymentBlock,
      manifest.cheapToken.contract.deploymentBlockHash,
    ),
    verifyReceipt(
      client,
      "pool initialization",
      manifest.primaryMarket.pool.initializationTransactionHash,
      manifest.primaryMarket.pool.initializationBlock,
      manifest.primaryMarket.pool.initializationBlockHash,
    ),
    verifyReceipt(
      client,
      "fee splitter deployment",
      manifest.contracts.feeSplitter.deploymentTransactionHash,
      manifest.contracts.feeSplitter.deploymentBlock,
      manifest.contracts.feeSplitter.deploymentBlockHash,
      manifest.contracts.feeSplitter.address,
    ),
    ...manifest.contracts.rewardDistributors.map((distribution) =>
      verifyReceipt(
        client,
        `${distribution.rewardAsset.symbol} distributor deployment`,
        distribution.contract.deploymentTransactionHash,
        distribution.contract.deploymentBlock,
        distribution.contract.deploymentBlockHash,
        distribution.contract.address,
      ),
    ),
    ...(manifest.vesting.mode === "linear"
      ? [
          verifyReceipt(
            client,
            "vesting vault deployment",
            manifest.vesting.vault.deploymentTransactionHash,
            manifest.vesting.vault.deploymentBlock,
            manifest.vesting.vault.deploymentBlockHash,
          ),
        ]
      : []),
  ]);

  await Promise.all([
    verifyToken(
      client,
      "CHEAP",
      { ...manifest.cheapToken, address: manifest.cheapToken.contract.address },
      BigInt(manifest.cheapToken.totalSupply),
    ),
    verifyToken(client, "COST", manifest.primaryMarket.quoteAsset),
  ]);

  const splitter = manifest.contracts.feeSplitter.address;
  const splitterChecks = [
    ["rewardToken", manifest.primaryMarket.quoteAsset.address],
    ["creatorRecipient", manifest.governance.creatorRecipient],
    ["holderTreasury", manifest.governance.holderTreasurySafe],
    ["owner", manifest.governance.protocolOwnerSafe],
    ["feeManager", manifest.primaryMarket.feeManager.address],
    ["poolId", manifest.primaryMarket.pool.poolId],
    ["poolConfigured", true],
    ["CREATOR_SHARE_BPS", 2_500n],
    ["HOLDER_SHARE_BPS", 7_500n],
  ];
  await Promise.all(
    splitterChecks.map(async ([functionName, expected]) => {
      const actual = await readContract(client, splitter, feeSplitterAbi, functionName);
      assertEqual(`fee splitter ${functionName}`, actual, expected);
    }),
  );

  await Promise.all(
    manifest.contracts.rewardDistributors.flatMap((distribution) => {
      const checks = [
        ["rewardToken", distribution.rewardAsset.address],
        ["operator", manifest.governance.distributionOperator],
        ["owner", manifest.governance.protocolOwnerSafe],
        ["MAX_BATCH_SIZE", 200n],
        ["REMEDIATION_DELAY", 604_800n],
      ];
      return checks.map(async ([functionName, expected]) => {
        const actual = await readContract(
          client,
          distribution.contract.address,
          distributorAbi,
          functionName,
        );
        assertEqual(`${distribution.rewardAsset.symbol} distributor ${functionName}`, actual, expected);
      });
    }),
  );

  process.stdout.write(
    `${entry.pathFromRoot}: ${
      draft ? "DRAFT (signature not checked)" : "signed release"
    }, finalized receipts, runtime code, token metadata, and immutable contract state verified.\n`,
  );
}

async function main() {
  const [command, ...arguments_] = process.argv.slice(2);
  if (command === "validate") return validateCommand(arguments_);
  if (command === "format") return formatCommand(arguments_);
  if (command === "env") return envCommand(arguments_);
  if (command === "verify-chain") return verifyChainCommand(arguments_);
  throw new Error(usage());
}

main().catch((error) => {
  const rpcUrl = process.env.ROBINHOOD_RPC_URL;
  const rawMessage = error instanceof Error ? error.message : String(error);
  const safeMessage = rpcUrl ? rawMessage.split(rpcUrl).join("<redacted RPC URL>") : rawMessage;
  process.stderr.write(`${safeMessage}\n`);
  process.exitCode = 1;
});
