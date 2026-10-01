import "dotenv/config";

function integerFromEnv(name: string, fallback: number, min: number, max: number): number {
  const value = process.env[name];
  if (value == null || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) throw new Error(`${name} must be a whole number.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function listFromEnv(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  return value
    ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
    : fallback;
}

export type AuthMode = "none" | "api-key" | "entra";

const authMode = (process.env.AUTH_MODE ?? "none") as AuthMode;
if (!["none", "api-key", "entra"].includes(authMode)) {
  throw new Error(`Unsupported AUTH_MODE: ${authMode}`);
}

export const config = {
  port: integerFromEnv("PORT", 3000, 1, 65_535),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  allowedHosts: listFromEnv("ALLOWED_HOSTS", ["localhost", "127.0.0.1"]),
  parkAssistApiBaseUrl: (process.env.PARKASSIST_API_BASE_URL ?? "https://parkassistproxy99b.azurewebsites.net/api").replace(/\/$/, ""),
  garage: process.env.PARKING_GARAGE ?? "5 Bell",
  staleAfterMinutes: integerFromEnv("STALE_AFTER_MINUTES", 15, 1, 10_080),
  cacheSeconds: integerFromEnv("CACHE_SECONDS", 30, 0, 3_600),
  authMode,
  mcpApiKey: process.env.MCP_API_KEY,
  entraTenantId: process.env.ENTRA_TENANT_ID,
  entraClientId: process.env.ENTRA_CLIENT_ID,
  entraAllowedAudiences: listFromEnv("ENTRA_ALLOWED_AUDIENCES", []),
  entraRequiredScope: process.env.ENTRA_REQUIRED_SCOPE ?? "access_as_user",
  cameraSigningSecret: process.env.CAMERA_SIGNING_SECRET ?? "local-development-only-change-me",
  cameraUrlTtlSeconds: integerFromEnv("CAMERA_URL_TTL_SECONDS", 300, 30, 3_600),
  sharePointSiteUrl: process.env.SHAREPOINT_SITE_URL,
  sharePointListName: process.env.SHAREPOINT_LIST_NAME ?? "SensorHealth",
  // Browser origins allowed to call /api/* — the SPFx Copilot Component runs on the
  // tenant's SharePoint origin, so it needs CORS that the MCP transport does not.
  corsAllowedOrigins: listFromEnv("CORS_ALLOWED_ORIGINS", []),
  trustProxyHops: integerFromEnv("TRUST_PROXY_HOPS", 0, 0, 5),
  rateLimitWindowSeconds: integerFromEnv("RATE_LIMIT_WINDOW_SECONDS", 60, 1, 3_600),
  rateLimitMaxRequests: integerFromEnv("RATE_LIMIT_MAX_REQUESTS", 300, 1, 100_000),
} as const;

const isProduction = process.env.NODE_ENV === "production";
const insecureCameraSecrets = new Set([
  "local-development-only-change-me",
  "replace-with-at-least-32-random-characters",
]);

if (isProduction && config.authMode === "none") {
  throw new Error("AUTH_MODE=none is not allowed when NODE_ENV=production.");
}

if (config.authMode === "api-key" && !config.mcpApiKey) {
  throw new Error("MCP_API_KEY is required when AUTH_MODE=api-key.");
}

if (config.authMode === "entra" && (!config.entraTenantId || !config.entraClientId)) {
  throw new Error("ENTRA_TENANT_ID and ENTRA_CLIENT_ID are required when AUTH_MODE=entra.");
}

if (
  isProduction &&
  (insecureCameraSecrets.has(config.cameraSigningSecret) || Buffer.byteLength(config.cameraSigningSecret, "utf8") < 32)
) {
  throw new Error("CAMERA_SIGNING_SECRET must be a non-placeholder value of at least 32 bytes in production.");
}
