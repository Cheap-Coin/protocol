import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const contractRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = resolve(contractRoot, ".analysis-workspace");
const relativeWorkspace = relative(contractRoot, workspace);

if (relativeWorkspace.startsWith(`..${sep}`) || relativeWorkspace === "..") {
  throw new Error("Refusing to prepare Aderyn outside the contract workspace");
}

const openZeppelinSource = resolve(contractRoot, "../node_modules/@openzeppelin/contracts");

rmSync(workspace, { recursive: true, force: true });
mkdirSync(resolve(workspace, "lib"), { recursive: true });
cpSync(resolve(contractRoot, "src"), resolve(workspace, "src"), { recursive: true });
cpSync(openZeppelinSource, resolve(workspace, "lib/openzeppelin-contracts"), {
  recursive: true,
  dereference: true,
});

writeFileSync(
  resolve(workspace, "foundry.toml"),
  `[profile.default]
src = "src"
out = "out"
solc_version = "0.8.28"
evm_version = "cancun"
optimizer = true
optimizer_runs = 10_000
bytecode_hash = "none"
remappings = ["@openzeppelin/contracts/=lib/openzeppelin-contracts/"]
`,
  "utf8",
);

console.log("Prepared isolated static-analysis workspace from contracts/src.");
