import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockfilePath = resolve(repositoryRoot, "Cargo.lock");
const generatedDevelopmentKeypair = resolve(
  repositoryRoot,
  "target/deploy/cheap_lock-keypair.json",
);
const pinnedVerifiableImage =
  "quay.io/ottersec/anchor@sha256:4ef4cf067fb1332ddd2b997a48ed05257854f51067ade342d63ebdc1039fe72e";

function fail(message) {
  console.error(`cheap-lock build: ${message}`);
  process.exit(1);
}

function lockfileSha256() {
  return createHash("sha256").update(readFileSync(lockfilePath)).digest("hex");
}

function run(command, args, stdio = "inherit") {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    shell: false,
    stdio,
  });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  return result.status ?? 1;
}

let verifiable = false;
for (const argument of process.argv.slice(2)) {
  if (argument === "--verifiable") verifiable = true;
  else fail(`unsupported argument ${JSON.stringify(argument)}`);
}

if (run("cargo", ["metadata", "--locked", "--format-version", "1", "--no-deps"], "ignore") !== 0) {
  fail("Cargo.lock does not resolve against the current manifests");
}

const before = lockfileSha256();
const developmentKeypairExisted = existsSync(generatedDevelopmentKeypair);
const anchorArguments = ["build", "--ignore-keys"];
if (verifiable) {
  anchorArguments.push("--verifiable", "--docker-image", pinnedVerifiableImage);
}

const buildStatus = run("anchor", anchorArguments);
if (!developmentKeypairExisted && existsSync(generatedDevelopmentKeypair)) {
  rmSync(generatedDevelopmentKeypair, { force: true });
  console.log("cheap-lock build: removed generated development keypair");
}
const after = lockfileSha256();
if (before !== after) {
  fail("Anchor changed Cargo.lock; review and regenerate the lockfile before rebuilding");
}
if (buildStatus !== 0) process.exit(buildStatus);

console.log(`cheap-lock build: Cargo.lock unchanged (${after})`);
if (verifiable) console.log(`cheap-lock build: pinned image ${pinnedVerifiableImage}`);
