import "dotenv/config";

function integerFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  port: integerFromEnv("PORT", 3000),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  allowedHosts: listFromEnv("ALLOWED_HOSTS", ["localhost", "127.0.0.1"]),
  parkAssistApiBaseUrl: (process.env.PARKASSIST_API_BASE_URL ?? "https://parkassistproxy99b.azurewebsites.net/api").replace(/\/$/, ""),
  garage: process.env.PARKING_GARAGE ?? "5 Bell",
  staleAfterMinutes: integerFromEnv("STALE_AFTER_MINUTES", 15),
  cacheSeconds: integerFromEnv("CACHE_SECONDS", 30),
  authMode,
  mcpApiKey: process.env.MCP_API_KEY,
  entraTenantId: process.env.ENTRA_TENANT_ID,
  entraClientId: process.env.ENTRA_CLIENT_ID,
  entraRequiredScope: process.env.ENTRA_REQUIRED_SCOPE ?? "access_as_user",
  cameraSigningSecret: process.env.CAMERA_SIGNING_SECRET ?? "local-development-only-change-me",
  cameraUrlTtlSeconds: integerFromEnv("CAMERA_URL_TTL_SECONDS", 300),
  sharePointSiteUrl: process.env.SHAREPOINT_SITE_URL,
  sharePointListName: process.env.SHAREPOINT_LIST_NAME ?? "SensorHealth",
} as const;

if (config.authMode === "api-key" && !config.mcpApiKey) {
  throw new Error("MCP_API_KEY is required when AUTH_MODE=api-key.");
}

if (config.authMode === "entra" && (!config.entraTenantId || !config.entraClientId)) {
  throw new Error("ENTRA_TENANT_ID and ENTRA_CLIENT_ID are required when AUTH_MODE=entra.");
}

if (process.env.NODE_ENV === "production" && config.cameraSigningSecret === "local-development-only-change-me") {
  throw new Error("CAMERA_SIGNING_SECRET must be configured in production.");
}
