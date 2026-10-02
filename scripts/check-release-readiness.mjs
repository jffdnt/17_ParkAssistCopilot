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
if (/PENDING_HYBRID_API_KEY_REGISTRATION/i.test(hybridPlugin)) {
  failures.push("copilotComponent/copilot/live-data-plugin.json still contains the placeholder API-key auth config ID.");
}
try {
  const plugin = JSON.parse(hybridPlugin);
  const runtime = plugin.runtimes?.[0];
  if (runtime?.type !== "OpenApi" || runtime?.auth?.type !== "ApiKeyPluginVault") {
    failures.push("The hybrid live-data action must use an OpenAPI runtime with ApiKeyPluginVault authentication.");
  }
  if (runtime?.spec?.url !== "parkassist-live-data.json") {
    failures.push("The hybrid live-data action must use the OpenAPI document bundled in the Copilot package.");
  }

  const contract = JSON.parse(read("copilotComponent/copilot/parkassist-live-data.json"));
  const operationIds = Object.values(contract.paths ?? {}).map((route) => route?.get?.operationId);
  const expectedOperationIds = [
    "garageOverviewData",
    "findAvailableSpacesData",
    "searchLicensePlateData",
    "getStaleCameraFeedsData",
  ];
  if (JSON.stringify(operationIds) !== JSON.stringify(expectedOperationIds)) {
    failures.push("The bundled OpenAPI document must expose exactly the four hybrid live-data operations.");
  }
  if (contract.servers?.[0]?.url !== "https://parkassist-mcp.happyground-f091a09b.eastus.azurecontainerapps.io") {
    failures.push("The bundled OpenAPI document is not targeting the production plugin endpoint.");
  }
  if (Object.keys(contract.paths ?? {}).some((path) => !path.startsWith("/api/plugin/"))) {
    failures.push("Every bundled OpenAPI operation must remain under the authenticated /api/plugin prefix.");
  }
} catch (error) {
  failures.push(`The hybrid live-data plugin is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
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
