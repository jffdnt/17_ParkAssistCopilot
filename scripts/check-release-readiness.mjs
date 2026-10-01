import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const warnings = [];

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const metadataFiles = [
  "copilotComponent/copilot/manifest.json",
  "copilotComponent/config/package-solution.json",
];
for (const file of metadataFiles) {
  if (/https:\/\/www\.example\.com/i.test(read(file))) {
    failures.push(`${file} still contains example.com publisher/legal URLs.`);
  }
}

const hybridPlugin = read("copilotComponent/copilot/live-data-plugin.json");
if (/PENDING_HYBRID_SSO_REGISTRATION/i.test(hybridPlugin)) {
  failures.push("copilotComponent/copilot/live-data-plugin.json still contains the placeholder SSO registration ID.");
}

try {
  const remotes = execFileSync("git", ["remote"], { cwd: root, encoding: "utf8" }).trim();
  if (!remotes) failures.push("No Git remote is configured, so repository CI cannot run from this checkout.");
} catch (error) {
  failures.push(`Git remote check failed: ${error instanceof Error ? error.message : String(error)}`);
}

const componentPackage = JSON.parse(read("copilotComponent/package.json"));
if (String(componentPackage.dependencies?.["@microsoft/sp-copilot-component"] ?? "").includes("beta")) {
  warnings.push("The primary M365 pilot depends on a preview SPFx Copilot Component package; keep the Copilot Studio fallback available.");
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`BLOCKED: ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Release readiness checks passed.");
}
