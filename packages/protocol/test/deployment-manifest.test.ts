import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { getAddress, keccak256, type Address, type Hex } from "viem";
import deploymentSchema from "../../../deployments/deployment-manifest-v1.schema.json";
import {
  CANONICAL_COST_ADDRESS,
  deploymentEnvironment,
  deploymentManifestDigest,
  parseDeploymentManifestJson,
  serializeDeploymentManifest,
  serializeDotenv,
  validateDeploymentManifest,
  verifyDeploymentRuntimeCode,
  type DeploymentManifestV1,
} from "../src/index.js";

function testAddress(value: number): Address {
  return getAddress(`0x${value.toString().padStart(40, "0")}`);
}

function testHash(byte: string): Hex {
  return `0x${byte.repeat(32)}` as Hex;
}

const cheap = testAddress(101);
const feeManager = testAddress(202);
const feeSplitter = testAddress(303);
const distributor = testAddress(404);
const ownerSafe = testAddress(505);
const creator = testAddress(606);
const holderSafe = testAddress(707);
const operator = testAddress(808);
const vestingBeneficiary = testAddress(909);
const vestingVault = testAddress(1_010);
const proxyImplementation = testAddress(1_111);

const compiler = {
  solcVersion: "0.8.28",
  optimizer: true,
  optimizerRuns: 10_000,
  evmVersion: "cancun",
  viaIr: false,
  metadataBytecodeHash: "none",
} as const;

function validManifest(): DeploymentManifestV1 {
  const costAsset = {
    name: "Costco Stock Token",
    symbol: "COST",
    decimals: 18,
    address: CANONICAL_COST_ADDRESS,
    runtimeCodeHash: testHash("11"),
    sourceVerificationUrl: `https://robinhoodchain.blockscout.com/address/${CANONICAL_COST_ADDRESS}`,
    proxy: { kind: "none" },
    registryUrl: "https://robinhood.com/us/en/about/crypto/",
    registryVerifiedAtBlock: "90",
  } as const;
  return {
    schemaVersion: 1,
    deploymentId: "robinhood-mainnet-v1",
    status: { state: "active" },
    network: {
      chainId: 4_663,
      name: "Robinhood Chain",
      finalityBlock: "200",
      finalityBlockHash: testHash("a0"),
    },
    publication: {
      publishedAt: "2026-08-11T20:00:00Z",
      releaseSequence: 1,
      sourceRepository: "https://github.com/Cheap-Coin/cheap-protocol",
      sourceCommit: "1234567890abcdef1234567890abcdef12345678",
      signedTag: "deployment/robinhood-mainnet-v1/v1",
      manifestPath: "deployments/robinhood-mainnet-v1.manifest.json",
    },
    cheapToken: {
      name: "CheapCoin",
      symbol: "CHEAP",
      decimals: 18,
      totalSupply: "100000000000000000000000000000",
      contract: {
        address: cheap,
        runtimeCodeHash: testHash("22"),
        sourceVerificationUrl: `https://robinhoodchain.blockscout.com/address/${cheap}`,
        proxy: { kind: "none" },
        deploymentTransactionHash: testHash("66"),
        deploymentBlock: "100",
        deploymentBlockHash: testHash("a1"),
      },
    },
    primaryMarket: {
      quoteAsset: costAsset,
      pool: {
        poolId: testHash("99"),
        initializationTransactionHash: testHash("aa"),
        initializationBlock: "101",
        initializationBlockHash: testHash("a2"),
        tokenIsToken0: true,
        quoteOnlyCreatorFees: true,
        swapFeePips: 10_000,
        creatorFeePips: 6_650,
      },
      feeManager: {
        address: feeManager,
        runtimeCodeHash: testHash("33"),
        sourceVerificationUrl: `https://robinhoodchain.blockscout.com/address/${feeManager}`,
        proxy: { kind: "none" },
      },
      feeBeneficiary: feeSplitter,
    },
    governance: {
      protocolOwnerSafe: ownerSafe,
      creatorRecipient: creator,
      holderTreasurySafe: holderSafe,
      distributionOperator: operator,
    },
    contracts: {
      feeSplitter: {
        address: feeSplitter,
        runtimeCodeHash: testHash("44"),
        sourceVerificationUrl: `https://robinhoodchain.blockscout.com/address/${feeSplitter}`,
        proxy: { kind: "none" },
        deploymentTransactionHash: testHash("77"),
        deploymentBlock: "99",
        deploymentBlockHash: testHash("a3"),
        compiler,
      },
      feeSplitterConstructorArguments: {
        rewardToken: CANONICAL_COST_ADDRESS,
        creatorRecipient: creator,
        holderTreasury: holderSafe,
        initialOwner: ownerSafe,
      },
      rewardDistributors: [
        {
          rewardAsset: { ...costAsset },
          contract: {
            address: distributor,
            runtimeCodeHash: testHash("55"),
            sourceVerificationUrl: `https://robinhoodchain.blockscout.com/address/${distributor}`,
            proxy: { kind: "none" },
            deploymentTransactionHash: testHash("88"),
            deploymentBlock: "102",
            deploymentBlockHash: testHash("a4"),
            compiler,
          },
          constructorArguments: {
            rewardToken: CANONICAL_COST_ADDRESS,
            operator,
            initialOwner: ownerSafe,
          },
        },
      ],
    },
    vesting: { mode: "none" },
  };
}

describe("deployment manifest", () => {
  it("matches the independently consumable public JSON Schema", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(deploymentSchema);
    expect(validate(validManifest()), JSON.stringify(validate.errors)).toBe(true);
  });

  it("accepts a complete active Robinhood Chain deployment", () => {
    expect(validateDeploymentManifest(validManifest())).toEqual(validManifest());
  });

  it("produces the same digest regardless of input object key order", () => {
    const manifest = validManifest();
    const reordered = {
      vesting: manifest.vesting,
      contracts: manifest.contracts,
      governance: manifest.governance,
      primaryMarket: manifest.primaryMarket,
      cheapToken: manifest.cheapToken,
      publication: manifest.publication,
      network: manifest.network,
      status: manifest.status,
      deploymentId: manifest.deploymentId,
      schemaVersion: manifest.schemaVersion,
    };
    expect(deploymentManifestDigest(reordered)).toBe(deploymentManifestDigest(manifest));
  });

  it("accepts only canonical file bytes", () => {
    const canonical = serializeDeploymentManifest(validManifest());
    expect(parseDeploymentManifestJson(canonical).sha256).toBe(
      deploymentManifestDigest(validManifest()),
    );
    expect(() => parseDeploymentManifestJson(JSON.stringify(validManifest(), null, 2))).toThrow(
      "canonical JSON",
    );
  });

  it("rejects an incorrect supply or primary quote asset", () => {
    const wrongSupply = validManifest();
    wrongSupply.cheapToken.totalSupply = "1";
    expect(() => validateDeploymentManifest(wrongSupply)).toThrow("fixed 100B supply");

    const wrongAsset = validManifest();
    wrongAsset.primaryMarket.quoteAsset.address = testAddress(909);
    expect(() => validateDeploymentManifest(wrongAsset)).toThrow("canonical COST");
  });

  it("rejects mismatched immutable constructor arguments", () => {
    const manifest = validManifest();
    manifest.contracts.feeSplitterConstructorArguments.holderTreasury = testAddress(909);
    expect(() => validateDeploymentManifest(manifest)).toThrow("holder treasury Safe");
  });

  it("accepts only the exact 15% linear vesting allocation and ordered dates", () => {
    const manifest = validManifest();
    const allocation = (BigInt(manifest.cheapToken.totalSupply) * 1_500n) / 10_000n;
    manifest.vesting = {
      mode: "linear",
      allocationBps: 1_500,
      allocation: allocation.toString(),
      beneficiary: vestingBeneficiary,
      startsAt: "2026-08-11T20:00:00Z",
      cliffEndsAt: "2026-09-10T20:00:00Z",
      fullyVestedAt: "2027-08-11T20:00:00Z",
      vault: {
        address: vestingVault,
        runtimeCodeHash: testHash("b1"),
        sourceVerificationUrl: `https://robinhoodchain.blockscout.com/address/${vestingVault}`,
        proxy: { kind: "none" },
        deploymentTransactionHash: testHash("b2"),
        deploymentBlock: "103",
        deploymentBlockHash: testHash("b3"),
      },
    };
    expect(validateDeploymentManifest(manifest).vesting).toEqual(manifest.vesting);

    manifest.vesting.allocation = (allocation - 1n).toString();
    expect(() => validateDeploymentManifest(manifest)).toThrow("exactly 15%");
  });

  it("requires the finality anchor to cover every deployment", () => {
    const manifest = validManifest();
    manifest.network.finalityBlock = "101";
    expect(() => validateDeploymentManifest(manifest)).toThrow("every recorded deployment block");
  });

  it("rejects unknown fields rather than silently ignoring misspellings", () => {
    expect(() => validateDeploymentManifest({ ...validManifest(), typo: true })).toThrow(
      "unexpected field",
    );
  });

  it("generates deterministic public settings only for an active release", () => {
    const manifest = validManifest();
    const application = deploymentEnvironment(manifest, "app");
    const services = deploymentEnvironment(manifest, "services");
    expect(application).toMatchObject({
      NEXT_PUBLIC_APP_MODE: "live",
      NEXT_PUBLIC_CHEAP_TOKEN_ADDRESS: cheap,
      NEXT_PUBLIC_COST_TOKEN_ADDRESS: CANONICAL_COST_ADDRESS,
      NEXT_PUBLIC_DISTRIBUTOR_ADDRESS: distributor,
      NEXT_PUBLIC_DEPLOYMENT_ID: manifest.deploymentId,
      NEXT_PUBLIC_DEPLOYMENT_RELEASE_SEQUENCE: "1",
      NEXT_PUBLIC_LAUNCH_BLOCK: "100",
    });
    expect(services).toMatchObject({
      CHEAP_TOKEN_ADDRESS: cheap,
      CHEAP_LAUNCH_BLOCK: "100",
      CHEAP_RUNTIME_CODE_HASH: manifest.cheapToken.contract.runtimeCodeHash,
      CHEAP_PROXY_KIND: "none",
      DEPLOYMENT_FINALITY_BLOCK_HASH: manifest.network.finalityBlockHash,
      DEPLOYMENT_ID: manifest.deploymentId,
    });
    expect(application).not.toHaveProperty("NEXT_PUBLIC_CHEAP_LAUNCH_BLOCK");
    expect(serializeDotenv(application)).toContain(
      `NEXT_PUBLIC_DEPLOYMENT_MANIFEST_SHA256=${deploymentManifestDigest(manifest)}\n`,
    );

    manifest.status = {
      state: "superseded",
      reason: "Replaced after an approved protocol migration",
      supersededBy: "robinhood-mainnet-v2",
    };
    manifest.publication.releaseSequence = 2;
    manifest.publication.signedTag = "deployment/robinhood-mainnet-v1/v2";
    expect(() => deploymentEnvironment(manifest, "app")).toThrow("superseded");
  });

  it("independently reports missing or changed runtime code", async () => {
    const manifest = validManifest();
    const expectedCode = new Map<Address, Hex>([
      [manifest.cheapToken.contract.address, "0x01"],
      [manifest.primaryMarket.quoteAsset.address, "0x02"],
      [manifest.primaryMarket.feeManager.address, "0x03"],
      [manifest.contracts.feeSplitter.address, "0x04"],
      [manifest.contracts.rewardDistributors[0]!.contract.address, "0x05"],
      [proxyImplementation, "0x06"],
    ]);
    manifest.cheapToken.contract.runtimeCodeHash = testHash("ff");
    manifest.cheapToken.contract.proxy = {
      kind: "eip1967",
      implementation: {
        address: proxyImplementation,
        runtimeCodeHash: keccak256("0x06"),
        sourceVerificationUrl: `https://robinhoodchain.blockscout.com/address/${proxyImplementation}`,
      },
    };
    manifest.primaryMarket.quoteAsset.runtimeCodeHash = keccak256("0x02");
    manifest.contracts.rewardDistributors[0]!.rewardAsset.runtimeCodeHash = keccak256("0x02");
    manifest.primaryMarket.feeManager.runtimeCodeHash = keccak256("0x03");
    manifest.contracts.feeSplitter.runtimeCodeHash = keccak256("0x04");
    manifest.contracts.rewardDistributors[0]!.contract.runtimeCodeHash = keccak256("0x05");

    const mismatches = await verifyDeploymentRuntimeCode(manifest, async (entry) =>
      expectedCode.get(entry),
    );
    expect(mismatches).toEqual([
      {
        label: "CHEAP",
        address: cheap,
        expected: testHash("ff"),
        actual: keccak256("0x01"),
      },
    ]);
  });
});
