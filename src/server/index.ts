import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { Request, Response } from "express";
import { readFile } from "node:fs/promises";
import { requireMcpAuthorization } from "./auth.js";
import { config } from "./config.js";
import { createParkAssistMcpServer } from "./mcp.js";
import { resolveWidgetHtmlPath } from "./paths.js";
import { loadBayMap } from "./services/bay-map.js";
import { CameraUrlSigner } from "./services/camera-signing.js";
import { ParkingDataService } from "./services/parking-data.js";
import { SharePointHealthService } from "./services/sharepoint-health.js";

async function main(): Promise<void> {
  const mapRows = await loadBayMap();
  const signer = new CameraUrlSigner(
    config.publicBaseUrl,
    config.cameraSigningSecret,
    config.cameraUrlTtlSeconds,
  );
  const healthService = config.sharePointSiteUrl
    ? new SharePointHealthService({
        siteUrl: config.sharePointSiteUrl,
        listName: config.sharePointListName,
      })
    : undefined;
  const parking = new ParkingDataService({
    mapRows,
    apiBaseUrl: config.parkAssistApiBaseUrl,
    garage: config.garage,
    staleAfterMinutes: config.staleAfterMinutes,
    cacheSeconds: config.cacheSeconds,
    signer,
    healthService,
  });

  const mcpHandler = createMcpHandler(() => createParkAssistMcpServer(parking));
  const nodeHandler = toNodeHandler(mcpHandler);
  const app = createMcpExpressApp({
    host: "0.0.0.0",
    allowedHosts: config.allowedHosts,
  });

  app.get("/health", (_request: Request, response: Response) => {
    response.json({ status: "ok", service: "parkassist-copilot", configuredSpaces: mapRows.length });
  });

  app.get("/preview", async (_request: Request, response: Response) => {
    const html = await readFile(resolveWidgetHtmlPath(), "utf8");
    response.type("html").send(html);
  });

  app.get("/.well-known/oauth-protected-resource/mcp", (_request: Request, response: Response) => {
    if (config.authMode !== "entra") {
      response.status(404).end();
      return;
    }
    response.json({
      resource: `${config.publicBaseUrl}/mcp`,
      authorization_servers: [`https://login.microsoftonline.com/${config.entraTenantId}/v2.0`],
      scopes_supported: [config.entraRequiredScope],
      bearer_methods_supported: ["header"],
    });
  });

  app.get("/api/cameras/:bayId", async (request: Request, response: Response) => {
    const bayIdValue = request.params.bayId;
    const bayId = Array.isArray(bayIdValue) ? bayIdValue[0] : bayIdValue;
    const expires = typeof request.query.exp === "string" ? request.query.exp : undefined;
    const signature = typeof request.query.sig === "string" ? request.query.sig : undefined;
    if (!bayId || !parking.hasConfiguredBay(bayId) || !signer.verify(bayId, expires, signature)) {
      response.status(403).json({ error: "The camera preview link is invalid or expired." });
      return;
    }

    try {
      const upstream = await parking.getCameraImage(bayId);
      if (!upstream.ok) {
        response.status(upstream.status).json({ error: "Camera preview is unavailable." });
        return;
      }
      const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
      const image = Buffer.from(await upstream.arrayBuffer());
      response.setHeader("Content-Type", contentType);
      response.setHeader("Cache-Control", "private, max-age=60");
      response.setHeader("Content-Security-Policy", "default-src 'none'");
      response.send(image);
    } catch (error) {
      console.error("Camera preview proxy failed.", error);
      response.status(502).json({ error: "Camera preview is temporarily unavailable." });
    }
  });

  // The SPFx Copilot Component calls this from the browser on the tenant's SharePoint
  // origin, so it needs CORS. The MCP transport does not, which is why this is scoped
  // to /api/stale-feeds rather than applied globally.
  const applyCors = (request: Request, response: Response): void => {
    const origin = request.headers.origin;
    if (origin && config.corsAllowedOrigins.includes(origin)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Headers", "authorization,content-type");
      response.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    }
  };

  const optionalInteger = (value: unknown): number | undefined => {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  /**
   * Registers a read-only JSON endpoint for the Copilot Components, behind the
   * same Entra check as /mcp. `label` only appears in server-side error logs.
   */
  const registerComponentRoute = (
    path: string,
    label: string,
    handler: (request: Request) => Promise<unknown>,
  ): void => {
    app.options(path, (request: Request, response: Response) => {
      applyCors(request, response);
      response.status(204).end();
    });

    app.get(path, (request: Request, response: Response, next) => {
      applyCors(request, response);
      requireMcpAuthorization(request, response, next);
    }, async (request: Request, response: Response) => {
      try {
        response.json(await handler(request));
      } catch (error) {
        console.error(`${label} lookup failed.`, error);
        response.status(502).json({ error: "The garage service is temporarily unavailable." });
      }
    });
  };

  registerComponentRoute("/api/stale-feeds", "Stale feed", (request) =>
    parking.getStaleCameraFeeds({
      floor: optionalInteger(request.query.floor),
      thresholdMinutes: optionalInteger(request.query.thresholdMinutes),
      limit: optionalInteger(request.query.limit) ?? 12,
      page: 1,
    }),
  );

  registerComponentRoute("/api/overview", "Garage overview", () => parking.getOverview());

  registerComponentRoute("/api/available-spaces", "Available space", (request) =>
    parking.findAvailableSpaces({
      floor: optionalInteger(request.query.floor),
      designation: typeof request.query.designation === "string" ? request.query.designation : undefined,
      limit: optionalInteger(request.query.limit) ?? 12,
      page: 1,
      includeImage: true,
    }),
  );

  registerComponentRoute("/api/plate-search", "Plate search", async (request) => {
    const query = typeof request.query.query === "string" ? request.query.query.trim() : "";
    if (query.length < 3) {
      throw new Error("Enter at least three letters or numbers from the license plate.");
    }
    return parking.searchLicensePlate(query, {
      limit: optionalInteger(request.query.limit) ?? 12,
      page: 1,
      includeImage: true,
    });
  });

  app.all("/mcp", requireMcpAuthorization, (request: Request, response: Response) => {
    void nodeHandler(request, response, request.body);
  });

  const httpServer = app.listen(config.port, "0.0.0.0", () => {
    console.log(`ParkAssist Copilot listening on ${config.publicBaseUrl}/mcp`);
  });

  const shutdown = async () => {
    await mcpHandler.close();
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
