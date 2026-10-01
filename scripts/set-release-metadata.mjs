import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const websiteUrl = requirePublicUrl("PUBLISHER_WEBSITE_URL");
const privacyUrl = requirePublicUrl("PRIVACY_URL");
const termsOfUseUrl = requirePublicUrl("TERMS_OF_USE_URL");

function requirePublicUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.hostname === "www.example.com") {
    throw new Error(`${name} must be a real HTTPS URL.`);
  }
  return parsed.toString();
}

function updateJson(relativePath, mutate) {
  const filePath = path.join(root, relativePath);
  const document = JSON.parse(readFileSync(filePath, "utf8"));
  mutate(document);
  writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

updateJson("copilotComponent/copilot/manifest.json", (manifest) => {
  manifest.developer.websiteUrl = websiteUrl;
  manifest.developer.privacyUrl = privacyUrl;
  manifest.developer.termsOfUseUrl = termsOfUseUrl;
});

updateJson("copilotComponent/config/package-solution.json", (packageSolution) => {
  packageSolution.solution.developer.websiteUrl = websiteUrl;
  packageSolution.solution.developer.privacyUrl = privacyUrl;
  packageSolution.solution.developer.termsOfUseUrl = termsOfUseUrl;
});

console.log("Updated active Copilot Component publisher metadata.");
