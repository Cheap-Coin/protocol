import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const contractRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const report = readFileSync(resolve(contractRoot, "aderyn-report.md"), "utf8");
const highSeverity = report.match(/^\| High \| (\d+) \|$/m);

if (!highSeverity) {
  throw new Error("Aderyn report did not contain a parseable high-severity summary");
}

const highSeverityCount = Number(highSeverity[1]);
if (!Number.isSafeInteger(highSeverityCount) || highSeverityCount < 0) {
  throw new Error("Aderyn high-severity count was invalid");
}

if (highSeverityCount > 0) {
  throw new Error(`Aderyn reported ${highSeverityCount} high-severity finding(s)`);
}

console.log("Aderyn gate passed with zero high-severity findings.");
