import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { config } from "./config.js";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export async function requireMcpAuthorization(request: Request, response: Response, next: NextFunction): Promise<void> {
  if (config.authMode === "none") {
    next();
    return;
  }

  if (config.authMode === "api-key") {
    const provided = request.header("x-api-key") ?? "";
    if (!safeEqual(provided, config.mcpApiKey ?? "")) {
      response.status(401).json({ error: "A valid MCP API key is required." });
      return;
    }
    next();
    return;
  }

  const authorization = request.header("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    response.setHeader("WWW-Authenticate", `Bearer resource_metadata="${config.publicBaseUrl}/.well-known/oauth-protected-resource/mcp"`);
    response.status(401).json({ error: "A Microsoft Entra access token is required." });
    return;
  }

  try {
    const payload = await verifyEntraToken(authorization.slice("Bearer ".length));
    const scopes = String(payload.scp ?? "").split(" ");
    const roles = Array.isArray(payload.roles) ? payload.roles.map(String) : [];
    if (!scopes.includes(config.entraRequiredScope) && !roles.includes(config.entraRequiredScope)) {
      response.status(403).json({ error: `Required scope or role '${config.entraRequiredScope}' is missing.` });
      return;
    }
    response.locals.auth = {
      subject: payload.sub,
      tenantId: payload.tid,
      name: payload.name,
    };
    next();
  } catch (error) {
    console.warn("Rejected invalid Entra access token.", error);
    response.status(401).json({ error: "The Microsoft Entra access token is invalid or expired." });
  }
}

async function verifyEntraToken(token: string): Promise<JWTPayload> {
  const tenantId = config.entraTenantId!;
  jwks ??= createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`));
  const { payload } = await jwtVerify(token, jwks, {
    audience: [config.entraClientId!, `api://${config.entraClientId}`],
  });
  const acceptedIssuers = new Set([
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
    `https://sts.windows.net/${tenantId}/`,
  ]);
  if (!payload.iss || !acceptedIssuers.has(payload.iss)) {
    throw new Error("Unexpected token issuer.");
  }
  if (payload.tid && payload.tid !== tenantId) {
    throw new Error("Unexpected tenant ID.");
  }
  return payload;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
