import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedProgramId = "E3TBZmfvWDuV6g4bAVR62bVoV9AJ3Y6utDKJsVEgxaLu";
const legacyTokenProgram = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const systemProgram = "11111111111111111111111111111111";
const verifiableImage =
  "quay.io/ottersec/anchor@sha256:4ef4cf067fb1332ddd2b997a48ed05257854f51067ade342d63ebdc1039fe72e";

function fail(message) {
  console.error(`cheap-lock artifact verification: ${message}`);
  process.exit(1);
}

function parseArguments(argumentsList) {
  const options = {
    sbf: "target/deploy/cheap_lock.so",
    idl: "target/idl/cheap_lock.json",
    idlType: "target/types/cheap_lock.ts",
    evidence: "target/evidence/cheap-lock-build.json",
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const name = argumentsList[index];
    if (!["--sbf", "--idl", "--idl-type", "--evidence"].includes(name)) {
      fail(`unsupported argument ${JSON.stringify(name)}`);
    }
    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) fail(`${name} requires a path`);
    if (name === "--sbf") options.sbf = value;
    if (name === "--idl") options.idl = value;
    if (name === "--idl-type") options.idlType = value;
    if (name === "--evidence") options.evidence = value;
    index += 1;
  }
  return Object.fromEntries(
    Object.entries(options).map(([name, path]) => [name, resolve(repositoryRoot, path)]),
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function discriminator(namespace, name) {
  return [...createHash("sha256").update(`${namespace}:${name}`).digest().subarray(0, 8)];
}

function repositoryPath(path) {
  return relative(repositoryRoot, path).replaceAll("\\", "/");
}

function git(...argumentsList) {
  return execFileSync("git", argumentsList, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function instructionByName(idl, name) {
  const instruction = idl.instructions.find((candidate) => candidate.name === name);
  assert.ok(instruction, `IDL instruction ${name} is missing`);
  return instruction;
}

function accountByName(instruction, name) {
  const account = instruction.accounts.find((candidate) => candidate.name === name);
  assert.ok(account, `IDL account ${instruction.name}.${name} is missing`);
  return account;
}

function typeByName(idl, name) {
  const entry = idl.types.find((candidate) => candidate.name === name);
  assert.ok(entry, `IDL type ${name} is missing`);
  return entry.type;
}

function accountRole(account) {
  if (account.writable) return account.signer ? "writableSigner" : "writable";
  return account.signer ? "readonlySigner" : "readonly";
}

function u64LittleEndian(value) {
  const output = Buffer.alloc(8);
  output.writeBigUInt64LE(value);
  return output;
}

function lockedVersion(lockfile, packageName) {
  const expression = new RegExp(
    `\\[\\[package\\]\\]\\r?\\nname = "${packageName.replaceAll("-", "\\-")}"\\r?\\nversion = "([^"]+)"`,
  );
  const match = lockfile.match(expression);
  assert.ok(match, `${packageName} is missing from Cargo.lock`);
  return match[1];
}

const paths = parseArguments(process.argv.slice(2));

try {
  const sbf = readFileSync(paths.sbf);
  const idlBytes = readFileSync(paths.idl);
  const idlTypeBytes = readFileSync(paths.idlType);
  const idl = JSON.parse(idlBytes.toString("utf8"));
  const lockfileBytes = readFileSync(resolve(repositoryRoot, "Cargo.lock"));
  const lockfile = lockfileBytes.toString("utf8");
  const anchorConfig = readFileSync(resolve(repositoryRoot, "Anchor.toml"), "utf8");
  const rustToolchain = readFileSync(resolve(repositoryRoot, "rust-toolchain.toml"), "utf8");

  assert.ok(sbf.length > 1_024, "SBF artifact is unexpectedly small");
  assert.deepEqual([...sbf.subarray(0, 4)], [0x7f, 0x45, 0x4c, 0x46], "SBF artifact is not ELF");
  assert.equal(sbf[4], 2, "SBF artifact is not a 64-bit ELF");
  assert.equal(sbf[5], 1, "SBF artifact is not little-endian ELF");
  assert.equal(sbf.readUInt16LE(18), 263, "SBF artifact does not target EM_SBF");
  const sbpfVersion = sbf.readUInt32LE(48);
  assert.ok([0, 1, 2, 3].includes(sbpfVersion), `unsupported SBPF version flag ${sbpfVersion}`);

  assert.equal(idl.address, expectedProgramId);
  assert.deepEqual(idl.metadata, {
    name: "cheap_lock",
    version: "0.1.0",
    spec: "0.1.0",
    description: "Non-custodial CHEAP commitment positions with unrestricted principal withdrawal",
  });

  const instructionContracts = {
    initialize_config: {
      accounts: [
        ["authority", true, true],
        ["cheap_lock_program", false, false],
        ["program_data", false, false],
        ["cheap_mint", false, false],
        ["config", true, false],
        ["token_program", false, false],
        ["system_program", false, false],
      ],
      args: [],
    },
    open_position: {
      accounts: [
        ["owner", true, true],
        ["config", false, false],
        ["cheap_mint", false, false],
        ["source_token_account", true, false],
        ["position", true, false],
        ["vault", true, false],
        ["token_program", false, false],
        ["system_program", false, false],
      ],
      args: [
        { name: "deposit_id", type: "u64" },
        { name: "amount", type: "u64" },
        { name: "tier", type: { defined: { name: "LockTier" } } },
      ],
    },
    set_authority: {
      accounts: [
        ["authority", false, true],
        ["config", true, false],
      ],
      args: [{ name: "new_authority", type: "pubkey" }],
    },
    set_paused: {
      accounts: [
        ["authority", false, true],
        ["config", true, false],
      ],
      args: [{ name: "paused", type: "bool" }],
    },
    withdraw_position: {
      accounts: [
        ["owner", true, true],
        ["config", false, false],
        ["cheap_mint", false, false],
        ["position", true, false],
        ["vault", true, false],
        ["destination_token_account", true, false],
        ["token_program", false, false],
      ],
      args: [],
    },
  };

  assert.deepEqual(
    idl.instructions.map(({ name }) => name).sort(),
    Object.keys(instructionContracts).sort(),
    "IDL instruction set changed",
  );
  for (const [name, contract] of Object.entries(instructionContracts)) {
    const instruction = instructionByName(idl, name);
    assert.deepEqual(instruction.discriminator, discriminator("global", name), `${name} discriminator changed`);
    assert.deepEqual(
      instruction.accounts.map((account) => [account.name, Boolean(account.writable), Boolean(account.signer)]),
      contract.accounts,
      `${name} account order or privileges changed`,
    );
    assert.deepEqual(instruction.args, contract.args, `${name} arguments changed`);
  }

  const configSeed = [{ kind: "const", value: [...Buffer.from("config")] }];
  const vaultSeeds = [
    { kind: "const", value: [...Buffer.from("vault")] },
    { kind: "account", path: "position" },
  ];
  const openPositionSeeds = [
    { kind: "const", value: [...Buffer.from("position")] },
    { kind: "account", path: "owner" },
    { kind: "arg", path: "deposit_id" },
  ];
  const withdrawPositionSeeds = [
    { kind: "const", value: [...Buffer.from("position")] },
    { kind: "account", path: "owner" },
    { kind: "account", path: "position.deposit_id", account: "LockPositionAccount" },
  ];
  for (const name of ["initialize_config", "open_position", "set_authority", "set_paused", "withdraw_position"]) {
    assert.deepEqual(accountByName(instructionByName(idl, name), "config").pda?.seeds, configSeed);
  }
  assert.deepEqual(accountByName(instructionByName(idl, "open_position"), "position").pda?.seeds, openPositionSeeds);
  assert.deepEqual(accountByName(instructionByName(idl, "withdraw_position"), "position").pda?.seeds, withdrawPositionSeeds);
  for (const name of ["open_position", "withdraw_position"]) {
    assert.deepEqual(accountByName(instructionByName(idl, name), "vault").pda?.seeds, vaultSeeds);
    assert.equal(accountByName(instructionByName(idl, name), "token_program").address, legacyTokenProgram);
  }
  assert.equal(accountByName(instructionByName(idl, "initialize_config"), "cheap_lock_program").address, expectedProgramId);
  assert.equal(accountByName(instructionByName(idl, "initialize_config"), "token_program").address, legacyTokenProgram);
  assert.equal(accountByName(instructionByName(idl, "initialize_config"), "system_program").address, systemProgram);
  assert.equal(accountByName(instructionByName(idl, "open_position"), "system_program").address, systemProgram);

  for (const account of idl.accounts) {
    assert.deepEqual(account.discriminator, discriminator("account", account.name), `${account.name} account discriminator changed`);
  }
  for (const event of idl.events) {
    assert.deepEqual(event.discriminator, discriminator("event", event.name), `${event.name} event discriminator changed`);
  }
  assert.deepEqual(
    idl.errors.map(({ code, name }) => [code, name]),
    [
      [6000, "InvalidInitializer"],
      [6001, "NewPositionsPaused"],
      [6002, "ZeroAmount"],
      [6003, "ArithmeticOverflow"],
      [6004, "InvalidClock"],
      [6005, "MintAuthorityActive"],
      [6006, "FreezeAuthorityActive"],
      [6007, "InvalidTokenProgram"],
      [6008, "InvalidMint"],
      [6009, "PrincipalInvariantViolated"],
      [6010, "PositionAlreadyWithdrawn"],
      [6011, "InvalidAuthority"],
    ],
    "IDL error code contract changed",
  );
  assert.deepEqual(typeByName(idl, "LockTier").variants.map(({ name }) => name), ["ThirtyDays", "NinetyDays"]);
  assert.deepEqual(typeByName(idl, "PositionState").variants.map(({ name }) => name), [
    "Locked",
    "ExitedEarly",
    "WithdrawnMatured",
  ]);
  assert.deepEqual(typeByName(idl, "LockConfig").fields.map(({ name }) => name), [
    "authority",
    "cheap_mint",
    "token_program",
    "paused",
    "bump",
  ]);
  assert.deepEqual(typeByName(idl, "LockPositionAccount").fields.map(({ name }) => name), [
    "owner",
    "mint",
    "deposit_id",
    "principal",
    "opened_at",
    "unlock_at",
    "withdrawn_at",
    "tier",
    "state",
    "bump",
    "vault_bump",
  ]);

  const clientPath = resolve(repositoryRoot, "packages/protocol/dist/index.js");
  const client = await import(pathToFileURL(clientPath).href);
  assert.equal(client.CHEAP_LOCK_DEVELOPMENT_PROGRAM_ID, idl.address);
  const owner = client.solanaAddress("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV");
  const mint = client.solanaAddress(client.encodeBase58(Uint8Array.from({ length: 32 }, (_, index) => index + 1)));
  const source = client.solanaAddress(client.encodeBase58(new Uint8Array(32).fill(3)));
  const destination = client.solanaAddress(client.encodeBase58(new Uint8Array(32).fill(4)));
  const depositId = 0x0102030405060708n;
  const amount = 0x1112131415161718n;
  const derived = await client.deriveCheapLockAddresses(idl.address, owner, depositId);
  const open = await client.buildOpenPositionInstruction({
    programAddress: idl.address,
    owner,
    cheapMint: mint,
    sourceTokenAccount: source,
    tokenProgram: legacyTokenProgram,
    depositId,
    amount,
    tier: "NINETY_DAYS",
  });
  const openIdl = instructionByName(idl, "open_position");
  assert.equal(open.programAddress, idl.address);
  assert.deepEqual(
    open.accounts,
    openIdl.accounts.map((account, index) => ({
      address: [owner, derived.config, mint, source, derived.position, derived.vault, legacyTokenProgram, systemProgram][index],
      role: accountRole(account),
    })),
  );
  const openData = Buffer.from(open.dataBase64, "base64");
  assert.deepEqual([...openData.subarray(0, 8)], openIdl.discriminator);
  assert.deepEqual(openData.subarray(8, 16), u64LittleEndian(depositId));
  assert.deepEqual(openData.subarray(16, 24), u64LittleEndian(amount));
  assert.equal(openData[24], 1, "NinetyDays enum encoding changed");

  const thirtyDayOpen = await client.buildOpenPositionInstruction({
    programAddress: idl.address,
    owner,
    cheapMint: mint,
    sourceTokenAccount: source,
    tokenProgram: legacyTokenProgram,
    depositId,
    amount,
    tier: "THIRTY_DAYS",
  });
  assert.equal(Buffer.from(thirtyDayOpen.dataBase64, "base64")[24], 0, "ThirtyDays enum encoding changed");

  const withdraw = await client.buildWithdrawPositionInstruction({
    programAddress: idl.address,
    owner,
    cheapMint: mint,
    destinationTokenAccount: destination,
    tokenProgram: legacyTokenProgram,
    depositId,
  });
  const withdrawIdl = instructionByName(idl, "withdraw_position");
  assert.equal(withdraw.programAddress, idl.address);
  assert.deepEqual(
    withdraw.accounts,
    withdrawIdl.accounts.map((account, index) => ({
      address: [owner, derived.config, mint, derived.position, derived.vault, destination, legacyTokenProgram][index],
      role: accountRole(account),
    })),
  );
  assert.deepEqual([...Buffer.from(withdraw.dataBase64, "base64")], withdrawIdl.discriminator);

  assert.match(anchorConfig, /anchor_version = "1\.1\.2"/);
  assert.match(anchorConfig, /solana_version = "3\.1\.10"/);
  assert.match(rustToolchain, /channel = "1\.91\.1"/);
  assert.equal(lockedVersion(lockfile, "anchor-lang"), "1.1.2");
  assert.equal(lockedVersion(lockfile, "anchor-spl"), "1.1.2");
  assert.equal(lockedVersion(lockfile, "litesvm"), "0.10.0");

  const evidence = {
    schemaVersion: 1,
    program: "cheap-lock",
    source: {
      repository: "https://github.com/Cheap-Coin/protocol",
      commit: git("rev-parse", "HEAD"),
      treeDirty: git("status", "--porcelain", "--untracked-files=no").length > 0,
      cargoLockSha256: sha256(lockfileBytes),
    },
    toolchain: {
      rust: "1.91.1",
      anchor: "1.1.2",
      anchorSourceCommit: "24035e2b0035c87e321acc1c05f97793829a87f1",
      solanaCli: "3.1.10",
      platformTools: "v1.52",
      litesvm: "0.10.0",
      verifiableImage,
    },
    artifacts: {
      sbf: {
        path: repositoryPath(paths.sbf),
        bytes: statSync(paths.sbf).size,
        sha256: sha256(sbf),
        sbpfVersion: `v${sbpfVersion}`,
      },
      idl: { path: repositoryPath(paths.idl), bytes: statSync(paths.idl).size, sha256: sha256(idlBytes) },
      idlType: { path: repositoryPath(paths.idlType), bytes: statSync(paths.idlType).size, sha256: sha256(idlTypeBytes) },
    },
    verification: {
      sbfElf: true,
      idlContract: true,
      idlDiscriminators: true,
      idlPdaSeeds: true,
      typescriptClientInstructions: ["open_position", "withdraw_position"],
    },
  };
  mkdirSync(dirname(paths.evidence), { recursive: true });
  writeFileSync(paths.evidence, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`cheap-lock artifact verification passed: ${repositoryPath(paths.evidence)}`);
  console.log(`SBF sha256: ${evidence.artifacts.sbf.sha256}`);
  console.log(`IDL sha256: ${evidence.artifacts.idl.sha256}`);
} catch (error) {
  fail(error instanceof Error ? error.stack ?? error.message : String(error));
}
