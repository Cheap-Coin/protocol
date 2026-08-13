import {
  getAddress,
  isAddress,
  isHex,
  keccak256,
  sha256,
  size,
  stringToBytes,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";

export const ROBINHOOD_CHAIN_ID = 4_663;
export const CANONICAL_COST_ADDRESS = getAddress(
  "0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2",
);
export const CHEAP_DISPLAY_SUPPLY = 100_000_000_000n;

export interface RuntimeCodeReference {
  address: Address;
  runtimeCodeHash: Hex;
  sourceVerificationUrl: string;
}

export type ProxyConfiguration =
  | { kind: "none" }
  | {
      kind: "eip1967" | "eip1167";
      implementation: RuntimeCodeReference;
    };

export interface CodeReference extends RuntimeCodeReference {
  proxy: ProxyConfiguration;
}

export interface VerifiedContractDeployment extends CodeReference {
  deploymentTransactionHash: Hex;
  deploymentBlock: string;
  deploymentBlockHash: Hex;
}

export interface CompilerSettings {
  solcVersion: string;
  optimizer: boolean;
  optimizerRuns: number;
  evmVersion: string;
  viaIr: boolean;
  metadataBytecodeHash: string;
}

export interface ProtocolContractDeployment extends VerifiedContractDeployment {
  compiler: CompilerSettings;
}

export interface RewardAssetReference extends CodeReference {
  name: string;
  symbol: string;
  decimals: number;
  registryUrl: string;
  registryVerifiedAtBlock: string;
}

export interface RewardDistributorDeployment {
  rewardAsset: RewardAssetReference;
  contract: ProtocolContractDeployment;
  constructorArguments: {
    rewardToken: Address;
    operator: Address;
    initialOwner: Address;
  };
}

export type DeploymentReleaseStatus =
  | { state: "active" }
  | { state: "superseded"; reason: string; supersededBy: string };

export type VestingConfiguration =
  | { mode: "none" }
  | {
      mode: "linear";
      allocationBps: 1_500;
      allocation: string;
      beneficiary: Address;
      startsAt: string;
      cliffEndsAt: string;
      fullyVestedAt: string;
      vault: VerifiedContractDeployment;
    };

export interface DeploymentManifestV1 {
  schemaVersion: 1;
  deploymentId: string;
  status: DeploymentReleaseStatus;
  network: {
    chainId: typeof ROBINHOOD_CHAIN_ID;
    name: "Robinhood Chain";
    finalityBlock: string;
    finalityBlockHash: Hex;
  };
  publication: {
    publishedAt: string;
    releaseSequence: number;
    sourceRepository: "https://github.com/Cheap-Coin/protocol";
    sourceCommit: string;
    signedTag: string;
    manifestPath: string;
  };
  cheapToken: {
    name: "CheapCoin";
    symbol: "CHEAP";
    decimals: number;
    totalSupply: string;
    contract: VerifiedContractDeployment;
  };
  primaryMarket: {
    quoteAsset: RewardAssetReference;
    pool: {
      poolId: Hex;
      initializationTransactionHash: Hex;
      initializationBlock: string;
      initializationBlockHash: Hex;
      tokenIsToken0: boolean;
      creatorFeeAssets: "both_pool_assets";
      swapFeePips: number;
      creatorFeePips: number;
    };
    feeManager: CodeReference;
    feeBeneficiary: Address;
  };
  governance: {
    protocolOwnerSafe: Address;
    creatorRecipient: Address;
    holderTreasurySafe: Address;
    distributionOperator: Address;
  };
  contracts: {
    feeSplitter: ProtocolContractDeployment;
    feeSplitterConstructorArguments: {
      quoteToken: Address;
      creatorRecipient: Address;
      communityTreasury: Address;
      initialOwner: Address;
    };
    rewardDistributors: RewardDistributorDeployment[];
  };
  vesting: VestingConfiguration;
}

export type DeploymentEnvironmentTarget = "app" | "services";

export interface ParsedDeploymentManifest {
  manifest: DeploymentManifestV1;
  canonicalJson: string;
  sha256: Hex;
}

type JsonRecord = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new TypeError(`${path}: ${message}`);
}

function record(value: unknown, path: string, keys: readonly string[]): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "expected an object");
  }
  const result = value as JsonRecord;
  const unexpected = Object.keys(result).filter((key) => !keys.includes(key));
  if (unexpected.length > 0) {
    fail(path, `unexpected field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}`);
  }
  for (const key of keys) {
    if (!(key in result)) fail(path, `missing required field: ${key}`);
  }
  return result;
}

function text(value: unknown, path: string, maximumLength = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumLength) {
    return fail(path, `expected a non-empty string no longer than ${maximumLength} characters`);
  }
  return value;
}

function literal<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  path: string,
): T {
  if (value !== expected) fail(path, `expected ${JSON.stringify(expected)}`);
  return expected;
}

function integer(value: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    return fail(path, `expected an integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function decimal(value: unknown, path: string, allowZero = false): string {
  const result = text(value, path, 128);
  if (!/^(0|[1-9][0-9]*)$/.test(result) || (!allowZero && result === "0")) {
    fail(path, `expected a canonical ${allowZero ? "non-negative" : "positive"} decimal string`);
  }
  return result;
}

function address(value: unknown, path: string): Address {
  const result = text(value, path, 42);
  if (!isAddress(result)) fail(path, "expected an EVM address");
  const checksummed = getAddress(result);
  if (checksummed === zeroAddress) fail(path, "zero address is not allowed");
  if (result !== checksummed) fail(path, `address must use checksum form ${checksummed}`);
  return checksummed;
}

function hash32(value: unknown, path: string): Hex {
  const result = text(value, path, 66);
  if (!isHex(result, { strict: true }) || size(result) !== 32 || /^0x0{64}$/.test(result)) {
    fail(path, "expected a non-zero 32-byte hex value");
  }
  if (result !== result.toLowerCase()) fail(path, "hex values must use lowercase characters");
  return result as Hex;
}

function httpsUrl(value: unknown, path: string): string {
  const result = text(value, path, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(result);
  } catch {
    return fail(path, "expected a valid HTTPS URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
    fail(path, "expected an HTTPS URL without credentials or a fragment");
  }
  return result;
}

function timestamp(value: unknown, path: string): string {
  const result = text(value, path, 20);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(result)) {
    fail(path, "expected a UTC timestamp in YYYY-MM-DDTHH:mm:ssZ form");
  }
  const parsed = Date.parse(result);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().replace(".000Z", "Z") !== result) {
    fail(path, "expected a real UTC calendar timestamp");
  }
  return result;
}

function parseCodeReference(value: unknown, path: string): CodeReference {
  const input = record(value, path, [
    "address",
    "runtimeCodeHash",
    "sourceVerificationUrl",
    "proxy",
  ]);
  const parsedAddress = address(input.address, `${path}.address`);
  return {
    address: parsedAddress,
    runtimeCodeHash: hash32(input.runtimeCodeHash, `${path}.runtimeCodeHash`),
    sourceVerificationUrl: httpsUrl(input.sourceVerificationUrl, `${path}.sourceVerificationUrl`),
    proxy: parseProxy(input.proxy, `${path}.proxy`, parsedAddress),
  };
}

function parseProxy(value: unknown, path: string, proxyAddress: Address): ProxyConfiguration {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "expected an object");
  }
  const kind = (value as JsonRecord).kind;
  if (kind === "none") {
    record(value, path, ["kind"]);
    return { kind };
  }
  if (kind !== "eip1967" && kind !== "eip1167") {
    return fail(`${path}.kind`, "expected none, eip1967, or eip1167");
  }
  const input = record(value, path, ["kind", "implementation"]);
  const implementationInput = record(input.implementation, `${path}.implementation`, [
    "address",
    "runtimeCodeHash",
    "sourceVerificationUrl",
  ]);
  const implementation = {
    address: address(implementationInput.address, `${path}.implementation.address`),
    runtimeCodeHash: hash32(
      implementationInput.runtimeCodeHash,
      `${path}.implementation.runtimeCodeHash`,
    ),
    sourceVerificationUrl: httpsUrl(
      implementationInput.sourceVerificationUrl,
      `${path}.implementation.sourceVerificationUrl`,
    ),
  };
  if (sameAddress(proxyAddress, implementation.address)) {
    fail(`${path}.implementation.address`, "proxy and implementation must be different contracts");
  }
  return { kind, implementation };
}

function parseVerifiedContract(value: unknown, path: string): VerifiedContractDeployment {
  const input = record(value, path, [
    "address",
    "runtimeCodeHash",
    "sourceVerificationUrl",
    "proxy",
    "deploymentTransactionHash",
    "deploymentBlock",
    "deploymentBlockHash",
  ]);
  return {
    ...parseCodeReference(
      {
        address: input.address,
        runtimeCodeHash: input.runtimeCodeHash,
        sourceVerificationUrl: input.sourceVerificationUrl,
        proxy: input.proxy,
      },
      path,
    ),
    deploymentTransactionHash: hash32(
      input.deploymentTransactionHash,
      `${path}.deploymentTransactionHash`,
    ),
    deploymentBlock: decimal(input.deploymentBlock, `${path}.deploymentBlock`),
    deploymentBlockHash: hash32(input.deploymentBlockHash, `${path}.deploymentBlockHash`),
  };
}

function parseCompiler(value: unknown, path: string): CompilerSettings {
  const input = record(value, path, [
    "solcVersion",
    "optimizer",
    "optimizerRuns",
    "evmVersion",
    "viaIr",
    "metadataBytecodeHash",
  ]);
  const solcVersion = text(input.solcVersion, `${path}.solcVersion`, 64);
  if (!/^0\.8\.28(?:\+[0-9A-Za-z.-]+)?$/.test(solcVersion)) {
    fail(`${path}.solcVersion`, "expected the pinned 0.8.28 compiler version");
  }
  const evmVersion = text(input.evmVersion, `${path}.evmVersion`, 32);
  if (evmVersion !== "cancun") fail(`${path}.evmVersion`, "expected cancun");
  const metadataBytecodeHash = text(
    input.metadataBytecodeHash,
    `${path}.metadataBytecodeHash`,
    16,
  );
  if (metadataBytecodeHash !== "none") {
    fail(`${path}.metadataBytecodeHash`, "expected none");
  }
  return {
    solcVersion,
    optimizer: literal(input.optimizer, true, `${path}.optimizer`),
    optimizerRuns: integer(input.optimizerRuns, `${path}.optimizerRuns`, 10_000, 10_000),
    evmVersion,
    viaIr: literal(input.viaIr, false, `${path}.viaIr`),
    metadataBytecodeHash,
  };
}

function parseProtocolContract(value: unknown, path: string): ProtocolContractDeployment {
  const input = record(value, path, [
    "address",
    "runtimeCodeHash",
    "sourceVerificationUrl",
    "proxy",
    "deploymentTransactionHash",
    "deploymentBlock",
    "deploymentBlockHash",
    "compiler",
  ]);
  return {
    ...parseVerifiedContract(
      {
        address: input.address,
        runtimeCodeHash: input.runtimeCodeHash,
        sourceVerificationUrl: input.sourceVerificationUrl,
        proxy: input.proxy,
        deploymentTransactionHash: input.deploymentTransactionHash,
        deploymentBlock: input.deploymentBlock,
        deploymentBlockHash: input.deploymentBlockHash,
      },
      path,
    ),
    compiler: parseCompiler(input.compiler, `${path}.compiler`),
  };
}

function parseRewardAsset(value: unknown, path: string): RewardAssetReference {
  const input = record(value, path, [
    "name",
    "symbol",
    "decimals",
    "address",
    "runtimeCodeHash",
    "sourceVerificationUrl",
    "proxy",
    "registryUrl",
    "registryVerifiedAtBlock",
  ]);
  const symbol = text(input.symbol, `${path}.symbol`, 12);
  if (!/^[A-Z][A-Z0-9]{1,11}$/.test(symbol)) {
    fail(`${path}.symbol`, "expected an uppercase token symbol");
  }
  return {
    name: text(input.name, `${path}.name`, 128),
    symbol,
    decimals: integer(input.decimals, `${path}.decimals`, 0, 36),
    ...parseCodeReference(
      {
        address: input.address,
        runtimeCodeHash: input.runtimeCodeHash,
        sourceVerificationUrl: input.sourceVerificationUrl,
        proxy: input.proxy,
      },
      path,
    ),
    registryUrl: httpsUrl(input.registryUrl, `${path}.registryUrl`),
    registryVerifiedAtBlock: decimal(
      input.registryVerifiedAtBlock,
      `${path}.registryVerifiedAtBlock`,
    ),
  };
}

function parseStatus(value: unknown, deploymentId: string): DeploymentReleaseStatus {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("status", "expected an object");
  }
  const state = (value as JsonRecord).state;
  if (state === "active") {
    record(value, "status", ["state"]);
    return { state };
  }
  if (state === "superseded") {
    const input = record(value, "status", ["state", "reason", "supersededBy"]);
    const supersededBy = text(input.supersededBy, "status.supersededBy", 80);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(supersededBy) || supersededBy === deploymentId) {
      fail("status.supersededBy", "expected a different kebab-case deployment ID");
    }
    return {
      state,
      reason: text(input.reason, "status.reason", 500),
      supersededBy,
    };
  }
  return fail("status.state", "expected active or superseded");
}

function parseVesting(value: unknown, cheapSupply: bigint): VestingConfiguration {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("vesting", "expected an object");
  }
  const mode = (value as JsonRecord).mode;
  if (mode === "none") {
    record(value, "vesting", ["mode"]);
    return { mode };
  }
  if (mode !== "linear") return fail("vesting.mode", "expected none or linear");
  const input = record(value, "vesting", [
    "mode",
    "allocationBps",
    "allocation",
    "beneficiary",
    "startsAt",
    "cliffEndsAt",
    "fullyVestedAt",
    "vault",
  ]);
  const allocationBps = literal(input.allocationBps, 1_500, "vesting.allocationBps");
  const allocation = decimal(input.allocation, "vesting.allocation");
  if (BigInt(allocation) !== (cheapSupply * BigInt(allocationBps)) / 10_000n) {
    fail("vesting.allocation", "must equal exactly 15% of the fixed CHEAP supply");
  }
  const startsAt = timestamp(input.startsAt, "vesting.startsAt");
  const cliffEndsAt = timestamp(input.cliffEndsAt, "vesting.cliffEndsAt");
  const fullyVestedAt = timestamp(input.fullyVestedAt, "vesting.fullyVestedAt");
  if (!(Date.parse(startsAt) < Date.parse(cliffEndsAt) && Date.parse(cliffEndsAt) < Date.parse(fullyVestedAt))) {
    fail("vesting", "timestamps must increase from start through cliff to full vesting");
  }
  return {
    mode,
    allocationBps,
    allocation,
    beneficiary: address(input.beneficiary, "vesting.beneficiary"),
    startsAt,
    cliffEndsAt,
    fullyVestedAt,
    vault: parseVerifiedContract(input.vault, "vesting.vault"),
  };
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function requireSameAddress(left: Address, right: Address, path: string, expected: string): void {
  if (!sameAddress(left, right)) fail(path, `must equal ${expected} (${right})`);
}

function parseRewardDistributor(
  value: unknown,
  index: number,
  governance: DeploymentManifestV1["governance"],
): RewardDistributorDeployment {
  const path = `contracts.rewardDistributors[${index}]`;
  const input = record(value, path, ["rewardAsset", "contract", "constructorArguments"]);
  const rewardAsset = parseRewardAsset(input.rewardAsset, `${path}.rewardAsset`);
  const contract = parseProtocolContract(input.contract, `${path}.contract`);
  const argumentsInput = record(input.constructorArguments, `${path}.constructorArguments`, [
    "rewardToken",
    "operator",
    "initialOwner",
  ]);
  const constructorArguments = {
    rewardToken: address(argumentsInput.rewardToken, `${path}.constructorArguments.rewardToken`),
    operator: address(argumentsInput.operator, `${path}.constructorArguments.operator`),
    initialOwner: address(argumentsInput.initialOwner, `${path}.constructorArguments.initialOwner`),
  };
  requireSameAddress(
    constructorArguments.rewardToken,
    rewardAsset.address,
    `${path}.constructorArguments.rewardToken`,
    "the reward asset",
  );
  requireSameAddress(
    constructorArguments.operator,
    governance.distributionOperator,
    `${path}.constructorArguments.operator`,
    "the distribution operator",
  );
  requireSameAddress(
    constructorArguments.initialOwner,
    governance.protocolOwnerSafe,
    `${path}.constructorArguments.initialOwner`,
    "the protocol owner Safe",
  );
  return { rewardAsset, contract, constructorArguments };
}

/**
 * Parses untrusted JSON data and enforces the release's cross-field security
 * invariants. Unknown fields fail so a misspelled production setting cannot be
 * silently ignored.
 */
export function validateDeploymentManifest(value: unknown): DeploymentManifestV1 {
  const input = record(value, "manifest", [
    "schemaVersion",
    "deploymentId",
    "status",
    "network",
    "publication",
    "cheapToken",
    "primaryMarket",
    "governance",
    "contracts",
    "vesting",
  ]);
  const schemaVersion = literal(input.schemaVersion, 1, "schemaVersion");
  const deploymentId = text(input.deploymentId, "deploymentId", 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(deploymentId)) {
    fail("deploymentId", "expected a kebab-case identifier");
  }
  const status = parseStatus(input.status, deploymentId);

  const networkInput = record(input.network, "network", [
    "chainId",
    "name",
    "finalityBlock",
    "finalityBlockHash",
  ]);
  const network = {
    chainId: literal(networkInput.chainId, ROBINHOOD_CHAIN_ID, "network.chainId"),
    name: literal(networkInput.name, "Robinhood Chain", "network.name"),
    finalityBlock: decimal(networkInput.finalityBlock, "network.finalityBlock"),
    finalityBlockHash: hash32(networkInput.finalityBlockHash, "network.finalityBlockHash"),
  } as const;

  const publicationInput = record(input.publication, "publication", [
    "publishedAt",
    "releaseSequence",
    "sourceRepository",
    "sourceCommit",
    "signedTag",
    "manifestPath",
  ]);
  const sourceCommit = text(publicationInput.sourceCommit, "publication.sourceCommit", 40);
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
    fail("publication.sourceCommit", "expected a full lowercase Git commit SHA");
  }
  const releaseSequence = integer(
    publicationInput.releaseSequence,
    "publication.releaseSequence",
    1,
    999_999,
  );
  const expectedTag = `deployment/${deploymentId}/v${releaseSequence}`;
  const signedTag = text(publicationInput.signedTag, "publication.signedTag", 100);
  if (signedTag !== expectedTag) {
    fail("publication.signedTag", `expected ${expectedTag}`);
  }
  const expectedPath = `deployments/${deploymentId}.manifest.json`;
  const manifestPath = text(publicationInput.manifestPath, "publication.manifestPath", 128);
  if (manifestPath !== expectedPath) {
    fail("publication.manifestPath", `expected ${expectedPath}`);
  }
  const publication = {
    publishedAt: timestamp(publicationInput.publishedAt, "publication.publishedAt"),
    releaseSequence,
    sourceRepository: literal(
      publicationInput.sourceRepository,
      "https://github.com/Cheap-Coin/protocol",
      "publication.sourceRepository",
    ),
    sourceCommit,
    signedTag,
    manifestPath,
  } as const;
  if (status.state === "superseded" && releaseSequence < 2) {
    fail("publication.releaseSequence", "a supersession must publish a new release sequence");
  }

  const cheapInput = record(input.cheapToken, "cheapToken", [
    "name",
    "symbol",
    "decimals",
    "totalSupply",
    "contract",
  ]);
  const decimals = integer(cheapInput.decimals, "cheapToken.decimals", 0, 36);
  const totalSupply = decimal(cheapInput.totalSupply, "cheapToken.totalSupply");
  const expectedSupply = CHEAP_DISPLAY_SUPPLY * 10n ** BigInt(decimals);
  if (BigInt(totalSupply) !== expectedSupply) {
    fail(
      "cheapToken.totalSupply",
      `must represent the fixed 100B supply at ${decimals} decimals (${expectedSupply})`,
    );
  }
  const cheapToken = {
    name: literal(cheapInput.name, "CheapCoin", "cheapToken.name"),
    symbol: literal(cheapInput.symbol, "CHEAP", "cheapToken.symbol"),
    decimals,
    totalSupply,
    contract: parseVerifiedContract(cheapInput.contract, "cheapToken.contract"),
  } as const;

  const governanceInput = record(input.governance, "governance", [
    "protocolOwnerSafe",
    "creatorRecipient",
    "holderTreasurySafe",
    "distributionOperator",
  ]);
  const governance = {
    protocolOwnerSafe: address(governanceInput.protocolOwnerSafe, "governance.protocolOwnerSafe"),
    creatorRecipient: address(governanceInput.creatorRecipient, "governance.creatorRecipient"),
    holderTreasurySafe: address(
      governanceInput.holderTreasurySafe,
      "governance.holderTreasurySafe",
    ),
    distributionOperator: address(
      governanceInput.distributionOperator,
      "governance.distributionOperator",
    ),
  };
  if (sameAddress(governance.protocolOwnerSafe, governance.holderTreasurySafe)) {
    fail("governance", "protocol owner and holder treasury must be separate Safes");
  }
  if (sameAddress(governance.creatorRecipient, governance.holderTreasurySafe)) {
    fail("governance", "creator recipient and holder treasury must be separate");
  }
  if (
    sameAddress(governance.distributionOperator, governance.protocolOwnerSafe) ||
    sameAddress(governance.distributionOperator, governance.holderTreasurySafe)
  ) {
    fail("governance.distributionOperator", "limited operator must not be a governance Safe");
  }

  const marketInput = record(input.primaryMarket, "primaryMarket", [
    "quoteAsset",
    "pool",
    "feeManager",
    "feeBeneficiary",
  ]);
  const quoteAsset = parseRewardAsset(marketInput.quoteAsset, "primaryMarket.quoteAsset");
  if (quoteAsset.symbol !== "COST") fail("primaryMarket.quoteAsset.symbol", "expected COST");
  requireSameAddress(
    quoteAsset.address,
    CANONICAL_COST_ADDRESS,
    "primaryMarket.quoteAsset.address",
    "canonical COST",
  );
  const poolInput = record(marketInput.pool, "primaryMarket.pool", [
    "poolId",
    "initializationTransactionHash",
    "initializationBlock",
    "initializationBlockHash",
    "tokenIsToken0",
    "creatorFeeAssets",
    "swapFeePips",
    "creatorFeePips",
  ]);
  if (typeof poolInput.tokenIsToken0 !== "boolean") {
    fail("primaryMarket.pool.tokenIsToken0", "expected a boolean");
  }
  const primaryMarket = {
    quoteAsset,
    pool: {
      poolId: hash32(poolInput.poolId, "primaryMarket.pool.poolId"),
      initializationTransactionHash: hash32(
        poolInput.initializationTransactionHash,
        "primaryMarket.pool.initializationTransactionHash",
      ),
      initializationBlock: decimal(
        poolInput.initializationBlock,
        "primaryMarket.pool.initializationBlock",
      ),
      initializationBlockHash: hash32(
        poolInput.initializationBlockHash,
        "primaryMarket.pool.initializationBlockHash",
      ),
      tokenIsToken0: poolInput.tokenIsToken0,
      creatorFeeAssets: literal(
        poolInput.creatorFeeAssets,
        "both_pool_assets",
        "primaryMarket.pool.creatorFeeAssets",
      ),
      swapFeePips: integer(poolInput.swapFeePips, "primaryMarket.pool.swapFeePips", 1, 1_000_000),
      creatorFeePips: integer(
        poolInput.creatorFeePips,
        "primaryMarket.pool.creatorFeePips",
        1,
        1_000_000,
      ),
    },
    feeManager: parseCodeReference(marketInput.feeManager, "primaryMarket.feeManager"),
    feeBeneficiary: address(marketInput.feeBeneficiary, "primaryMarket.feeBeneficiary"),
  };

  const contractsInput = record(input.contracts, "contracts", [
    "feeSplitter",
    "feeSplitterConstructorArguments",
    "rewardDistributors",
  ]);
  const feeSplitter = parseProtocolContract(contractsInput.feeSplitter, "contracts.feeSplitter");
  const feeArgsInput = record(
    contractsInput.feeSplitterConstructorArguments,
    "contracts.feeSplitterConstructorArguments",
    ["quoteToken", "creatorRecipient", "communityTreasury", "initialOwner"],
  );
  const feeSplitterConstructorArguments = {
    quoteToken: address(
      feeArgsInput.quoteToken,
      "contracts.feeSplitterConstructorArguments.quoteToken",
    ),
    creatorRecipient: address(
      feeArgsInput.creatorRecipient,
      "contracts.feeSplitterConstructorArguments.creatorRecipient",
    ),
    communityTreasury: address(
      feeArgsInput.communityTreasury,
      "contracts.feeSplitterConstructorArguments.communityTreasury",
    ),
    initialOwner: address(
      feeArgsInput.initialOwner,
      "contracts.feeSplitterConstructorArguments.initialOwner",
    ),
  };
  requireSameAddress(
    primaryMarket.feeBeneficiary,
    feeSplitter.address,
    "primaryMarket.feeBeneficiary",
    "the CHEAP fee splitter",
  );
  requireSameAddress(
    feeSplitterConstructorArguments.quoteToken,
    quoteAsset.address,
    "contracts.feeSplitterConstructorArguments.quoteToken",
    "canonical COST",
  );
  requireSameAddress(
    feeSplitterConstructorArguments.creatorRecipient,
    governance.creatorRecipient,
    "contracts.feeSplitterConstructorArguments.creatorRecipient",
    "the creator recipient",
  );
  requireSameAddress(
    feeSplitterConstructorArguments.communityTreasury,
    governance.holderTreasurySafe,
    "contracts.feeSplitterConstructorArguments.communityTreasury",
    "the community treasury Safe",
  );
  requireSameAddress(
    feeSplitterConstructorArguments.initialOwner,
    governance.protocolOwnerSafe,
    "contracts.feeSplitterConstructorArguments.initialOwner",
    "the protocol owner Safe",
  );
  if (!Array.isArray(contractsInput.rewardDistributors) || contractsInput.rewardDistributors.length === 0) {
    fail("contracts.rewardDistributors", "expected at least the primary COST distributor");
  }
  const rewardDistributors = contractsInput.rewardDistributors.map((entry, index) =>
    parseRewardDistributor(entry, index, governance),
  );

  const seenRewardAddresses = new Set<string>();
  const seenRewardSymbols = new Set<string>();
  const seenDistributorAddresses = new Set<string>();
  for (const distributor of rewardDistributors) {
    const assetAddress = distributor.rewardAsset.address.toLowerCase();
    const distributorAddress = distributor.contract.address.toLowerCase();
    if (seenRewardAddresses.has(assetAddress)) {
      fail("contracts.rewardDistributors", `duplicate reward asset ${distributor.rewardAsset.address}`);
    }
    if (seenRewardSymbols.has(distributor.rewardAsset.symbol)) {
      fail("contracts.rewardDistributors", `duplicate reward symbol ${distributor.rewardAsset.symbol}`);
    }
    if (seenDistributorAddresses.has(distributorAddress)) {
      fail("contracts.rewardDistributors", `duplicate distributor ${distributor.contract.address}`);
    }
    seenRewardAddresses.add(assetAddress);
    seenRewardSymbols.add(distributor.rewardAsset.symbol);
    seenDistributorAddresses.add(distributorAddress);
  }
  const costDistributor = rewardDistributors.find((entry) => entry.rewardAsset.symbol === "COST");
  if (!costDistributor) fail("contracts.rewardDistributors", "primary COST distributor is required");
  requireSameAddress(
    costDistributor.rewardAsset.address,
    quoteAsset.address,
    "contracts.rewardDistributors[COST].rewardAsset.address",
    "the primary quote asset",
  );
  if (
    costDistributor.rewardAsset.decimals !== quoteAsset.decimals ||
    costDistributor.rewardAsset.runtimeCodeHash !== quoteAsset.runtimeCodeHash
  ) {
    fail("contracts.rewardDistributors[COST].rewardAsset", "must match the primary COST reference");
  }

  const vesting = parseVesting(input.vesting, BigInt(totalSupply));
  const codeAddresses = [
    cheapToken.contract.address,
    quoteAsset.address,
    primaryMarket.feeManager.address,
    feeSplitter.address,
    ...rewardDistributors.map((entry) => entry.contract.address),
    ...(vesting.mode === "linear" ? [vesting.vault.address] : []),
  ].map((entry) => entry.toLowerCase());
  if (new Set(codeAddresses).size !== codeAddresses.length) {
    fail("manifest", "token, manager, splitter, distributor, and vesting contract addresses must be unique");
  }
  const codeReferences: CodeReference[] = [
    cheapToken.contract,
    quoteAsset,
    primaryMarket.feeManager,
    feeSplitter,
    ...rewardDistributors.map((entry) => entry.contract),
    ...(vesting.mode === "linear" ? [vesting.vault] : []),
  ];
  const pinnedCode = new Map<string, Hex>();
  for (const reference of codeReferences) {
    const references = [
      reference,
      ...(reference.proxy.kind === "none" ? [] : [reference.proxy.implementation]),
    ];
    for (const pinned of references) {
      const key = pinned.address.toLowerCase();
      const priorHash = pinnedCode.get(key);
      if (priorHash && priorHash !== pinned.runtimeCodeHash) {
        fail("manifest", `conflicting runtime hashes for code at ${pinned.address}`);
      }
      pinnedCode.set(key, pinned.runtimeCodeHash);
    }
  }
  if (BigInt(primaryMarket.pool.initializationBlock) < BigInt(cheapToken.contract.deploymentBlock)) {
    fail("primaryMarket.pool.initializationBlock", "cannot predate the CHEAP deployment");
  }
  if (BigInt(primaryMarket.pool.initializationBlock) < BigInt(feeSplitter.deploymentBlock)) {
    fail("primaryMarket.pool.initializationBlock", "cannot predate the fee splitter deployment");
  }
  const latestRecordedBlock = [
    cheapToken.contract.deploymentBlock,
    primaryMarket.pool.initializationBlock,
    feeSplitter.deploymentBlock,
    ...rewardDistributors.map((entry) => entry.contract.deploymentBlock),
    ...(vesting.mode === "linear" ? [vesting.vault.deploymentBlock] : []),
  ].reduce((latest, entry) => (BigInt(entry) > latest ? BigInt(entry) : latest), 0n);
  if (BigInt(network.finalityBlock) < latestRecordedBlock) {
    fail("network.finalityBlock", "must be at or after every recorded deployment block");
  }

  return {
    schemaVersion,
    deploymentId,
    status,
    network,
    publication,
    cheapToken,
    primaryMarket,
    governance,
    contracts: {
      feeSplitter,
      feeSplitterConstructorArguments,
      rewardDistributors,
    },
    vesting,
  };
}

function canonicalJsonValue(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("Canonical JSON permits safe integers only");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJsonValue).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as JsonRecord).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJsonValue(entry)}`)
      .join(",")}}`;
  }
  throw new TypeError("Canonical JSON cannot encode undefined, bigint, or functions");
}

/** RFC-8785-style deterministic JSON for this integer-only manifest schema. */
export function serializeDeploymentManifest(value: unknown): string {
  return `${canonicalJsonValue(validateDeploymentManifest(value))}\n`;
}

export function deploymentManifestDigest(value: unknown): Hex {
  return sha256(stringToBytes(serializeDeploymentManifest(value)));
}

/** Parses a file and rejects non-canonical whitespace, key order, or trailing data. */
export function parseDeploymentManifestJson(source: string): ParsedDeploymentManifest {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    throw new TypeError(
      `Deployment manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const manifest = validateDeploymentManifest(value);
  const canonicalJson = serializeDeploymentManifest(manifest);
  if (source !== canonicalJson) {
    throw new TypeError("Deployment manifest bytes are not in canonical JSON form");
  }
  return { manifest, canonicalJson, sha256: sha256(stringToBytes(source)) };
}

export function deploymentEnvironment(
  value: unknown,
  target: DeploymentEnvironmentTarget,
): Readonly<Record<string, string>> {
  const manifest = validateDeploymentManifest(value);
  if (manifest.status.state !== "active") {
    throw new Error(`Deployment ${manifest.deploymentId} is superseded and cannot enable live mode`);
  }
  const costDistributor = manifest.contracts.rewardDistributors.find(
    (entry) => entry.rewardAsset.symbol === "COST",
  );
  if (!costDistributor) throw new Error("Active deployment has no COST distributor");
  const digest = deploymentManifestDigest(manifest);
  const common = {
    DEPLOYMENT_ID: manifest.deploymentId,
    DEPLOYMENT_MANIFEST_SHA256: digest,
    DEPLOYMENT_RELEASE_TAG: manifest.publication.signedTag,
    DEPLOYMENT_RELEASE_SEQUENCE: String(manifest.publication.releaseSequence),
    COST_TOKEN_ADDRESS: manifest.primaryMarket.quoteAsset.address,
    CHEAP_TOKEN_ADDRESS: manifest.cheapToken.contract.address,
    CHEAP_POOL_ID: manifest.primaryMarket.pool.poolId,
    FEE_MANAGER_ADDRESS: manifest.primaryMarket.feeManager.address,
    FEE_SPLITTER_ADDRESS: manifest.contracts.feeSplitter.address,
    DISTRIBUTOR_ADDRESS: costDistributor.contract.address,
    TREASURY_ADDRESS: manifest.governance.holderTreasurySafe,
    CHEAP_LAUNCH_BLOCK: manifest.cheapToken.contract.deploymentBlock,
    DEPLOYMENT_FINALITY_BLOCK: manifest.network.finalityBlock,
  } as const;
  if (target === "services") {
    const cheapProxy = manifest.cheapToken.contract.proxy;
    return {
      ...common,
      DEPLOYMENT_FINALITY_BLOCK_HASH: manifest.network.finalityBlockHash,
      CHEAP_RUNTIME_CODE_HASH: manifest.cheapToken.contract.runtimeCodeHash,
      CHEAP_PROXY_KIND: cheapProxy.kind,
      ...(cheapProxy.kind === "none"
        ? {}
        : {
            CHEAP_IMPLEMENTATION_ADDRESS: cheapProxy.implementation.address,
            CHEAP_IMPLEMENTATION_RUNTIME_CODE_HASH: cheapProxy.implementation.runtimeCodeHash,
          }),
      COST_RUNTIME_CODE_HASH: manifest.primaryMarket.quoteAsset.runtimeCodeHash,
      FEE_MANAGER_RUNTIME_CODE_HASH: manifest.primaryMarket.feeManager.runtimeCodeHash,
      FEE_SPLITTER_RUNTIME_CODE_HASH: manifest.contracts.feeSplitter.runtimeCodeHash,
      DISTRIBUTOR_RUNTIME_CODE_HASH: costDistributor.contract.runtimeCodeHash,
    };
  }
  return {
    NEXT_PUBLIC_APP_MODE: "live",
    NEXT_PUBLIC_DEPLOYMENT_ID: common.DEPLOYMENT_ID,
    NEXT_PUBLIC_DEPLOYMENT_MANIFEST_SHA256: common.DEPLOYMENT_MANIFEST_SHA256,
    NEXT_PUBLIC_DEPLOYMENT_RELEASE_TAG: common.DEPLOYMENT_RELEASE_TAG,
    NEXT_PUBLIC_DEPLOYMENT_RELEASE_SEQUENCE: common.DEPLOYMENT_RELEASE_SEQUENCE,
    NEXT_PUBLIC_DEPLOYMENT_FINALITY_BLOCK: common.DEPLOYMENT_FINALITY_BLOCK,
    NEXT_PUBLIC_COST_TOKEN_ADDRESS: common.COST_TOKEN_ADDRESS,
    NEXT_PUBLIC_CHEAP_TOKEN_ADDRESS: common.CHEAP_TOKEN_ADDRESS,
    NEXT_PUBLIC_CHEAP_POOL_ID: common.CHEAP_POOL_ID,
    NEXT_PUBLIC_FEE_MANAGER_ADDRESS: common.FEE_MANAGER_ADDRESS,
    NEXT_PUBLIC_FEE_SPLITTER_ADDRESS: common.FEE_SPLITTER_ADDRESS,
    NEXT_PUBLIC_DISTRIBUTOR_ADDRESS: common.DISTRIBUTOR_ADDRESS,
    NEXT_PUBLIC_TREASURY_ADDRESS: common.TREASURY_ADDRESS,
    NEXT_PUBLIC_LAUNCH_BLOCK: common.CHEAP_LAUNCH_BLOCK,
  };
}

export function serializeDotenv(environment: Readonly<Record<string, string>>): string {
  return `${Object.entries(environment)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => {
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new TypeError(`Invalid environment key: ${key}`);
      if (!/^[A-Za-z0-9_./:+-]+$/.test(value)) {
        throw new TypeError(`Environment value for ${key} requires unsupported escaping`);
      }
      return `${key}=${value}`;
    })
    .join("\n")}\n`;
}

export interface RuntimeCodeMismatch {
  label: string;
  address: Address;
  expected: Hex;
  actual: Hex | null;
}

export interface LabeledCodeReference {
  label: string;
  reference: RuntimeCodeReference;
}

export interface LabeledContractReference {
  label: string;
  reference: CodeReference;
}

export function deploymentContractReferences(value: unknown): LabeledContractReference[] {
  const manifest = validateDeploymentManifest(value);
  return [
    { label: "CHEAP", reference: manifest.cheapToken.contract },
    { label: "COST", reference: manifest.primaryMarket.quoteAsset },
    { label: "fee manager", reference: manifest.primaryMarket.feeManager },
    { label: "fee splitter", reference: manifest.contracts.feeSplitter },
    ...manifest.contracts.rewardDistributors.map((entry) => ({
      label: `${entry.rewardAsset.symbol} distributor`,
      reference: entry.contract,
    })),
    ...(manifest.vesting.mode === "linear"
      ? [{ label: "vesting vault", reference: manifest.vesting.vault }]
      : []),
  ];
}

export function deploymentCodeReferences(value: unknown): LabeledCodeReference[] {
  const outer = deploymentContractReferences(value);
  const result: LabeledCodeReference[] = [];
  const seen = new Set<string>();
  for (const entry of outer) {
    const outerKey = entry.reference.address.toLowerCase();
    if (!seen.has(outerKey)) {
      result.push(entry);
      seen.add(outerKey);
    }
    if (entry.reference.proxy.kind !== "none") {
      const implementation = entry.reference.proxy.implementation;
      const implementationKey = implementation.address.toLowerCase();
      if (!seen.has(implementationKey)) {
        result.push({ label: `${entry.label} implementation`, reference: implementation });
        seen.add(implementationKey);
      }
    }
  }
  return result;
}

/** Independently compares every pinned runtime hash with live chain bytecode. */
export async function verifyDeploymentRuntimeCode(
  value: unknown,
  readCode: (address: Address) => Promise<Hex | undefined>,
): Promise<RuntimeCodeMismatch[]> {
  const references = deploymentCodeReferences(value);
  const results = await Promise.all(references.map(async ({ label, reference }) => {
    const code = await readCode(reference.address);
    const actual = code && code !== "0x" ? keccak256(code) : null;
    if (actual !== reference.runtimeCodeHash) {
      return {
        label,
        address: reference.address,
        expected: reference.runtimeCodeHash,
        actual,
      } satisfies RuntimeCodeMismatch;
    }
    return null;
  }));
  return results.filter((entry): entry is RuntimeCodeMismatch => entry !== null);
}
