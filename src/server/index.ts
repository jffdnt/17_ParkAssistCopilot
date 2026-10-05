import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import express, { type Request, type Response } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireMcpAuthorization, requirePluginApiKeyAuthorization } from "./auth.js";
import { config } from "./config.js";
import { createParkAssistMcpServer } from "./mcp.js";
import { createGenUiModel } from "./genui/model.js";
import { createGenUiChatHandler } from "./genui/route.js";
import { resolveGenUiDirectory, resolveWidgetHtmlPath } from "./paths.js";
import { FixedWindowRateLimiter, createRateLimitMiddleware } from "./middleware/rate-limit.js";
import { requestTelemetry } from "./middleware/request-telemetry.js";
import { toPluginDataResult } from "./plugin-data.js";
import { createPluginOpenApiDocument } from "./plugin-openapi.js";
import {
  garageStatus,
  integerList,
  optionalInteger,
  plateQuery,
  RequestValidationError,
} from "./request-validation.js";
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
  app.set("trust proxy", config.trustProxyHops);
  app.disable("x-powered-by");
  app.use(requestTelemetry);

  const rateLimit = createRateLimitMiddleware(new FixedWindowRateLimiter(
    config.rateLimitMaxRequests,
    config.rateLimitWindowSeconds * 1000,
  ));
  app.use(["/mcp", "/api", "/ready"], rateLimit);
  app.use(["/mcp", "/api"], (_request: Request, response: Response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });

  // Microsoft 365's API-plugin runtime probes the origin before invoking a
  // secured operation. Keep that probe cheap and non-sensitive so a missing
  // marketing home page cannot make an otherwise healthy plugin look offline.
  app.get("/", (_request: Request, response: Response) => {
    response.json({
      status: "ok",
      service: "parkassist-copilot",
      health: "/health",
      readiness: "/ready",
      openApi: "/openapi/parkassist-live-data.json",
    });
  });

  app.get("/health", (_request: Request, response: Response) => {
    response.json({ status: "ok", service: "parkassist-copilot", configuredSpaces: mapRows.length });
  });

  app.get("/ready", async (_request: Request, response: Response) => {
    const startedAt = performance.now();
    try {
      const readiness = await parking.checkReadiness();
      response.json({
        status: "ready",
        service: "parkassist-copilot",
        ...readiness,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      });
    } catch (error) {
      console.error("ParkAssist readiness check failed.", error);
      response.status(503).json({ status: "unavailable", service: "parkassist-copilot" });
    }
  });

  app.get("/preview", async (_request: Request, response: Response) => {
    const html = await readFile(resolveWidgetHtmlPath(), "utf8");
    response.type("html").send(html);
  });

  app.get("/openapi/parkassist-live-data.json", (_request: Request, response: Response) => {
    response.setHeader("Cache-Control", "public, max-age=300");
    response.json(createPluginOpenApiDocument(config.publicBaseUrl));
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

  // The SPFx Copilot Components call /api/* from the tenant's SharePoint origin,
  // so those routes need CORS. The MCP transport does not.
  const applyCors = (request: Request, response: Response): void => {
    const origin = request.headers.origin;
    if (origin && config.corsAllowedOrigins.includes(origin)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Headers", "authorization,content-type");
      response.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    }
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
        if (error instanceof RequestValidationError) {
          response.status(error.statusCode).json({ error: error.message });
          return;
        }
        console.error(`${label} lookup failed.`, error);
        response.status(502).json({ error: "The garage service is temporarily unavailable." });
      }
    });
  };

  registerComponentRoute("/api/stale-feeds", "Stale feed", (request) =>
    parking.getStaleCameraFeeds({
      floor: optionalInteger(request.query.floor, "floor", { min: 1, max: 11 }),
      floors: integerList(request.query.floors),
      thresholdMinutes: optionalInteger(request.query.thresholdMinutes, "thresholdMinutes", { min: 1, max: 10_080 }),
      limit: optionalInteger(request.query.limit, "limit", { min: 1, max: 24 }) ?? 12,
      page: 1,
    }),
  );

  registerComponentRoute("/api/overview", "Garage overview", () => parking.getOverview());

  registerComponentRoute("/api/status-detail", "Status detail", (request) =>
    parking.getStatusDetail(garageStatus(request.query.status)),
  );

  // Camera links expire quickly. Issue one only after the signed-in user opens
  // a space instead of embedding already-aging links in the full drill-down.
  registerComponentRoute("/api/camera-preview-url", "Camera preview URL", (request) => {
    const bayId = typeof request.query.bayId === "string" ? request.query.bayId : undefined;
    if (!bayId || !parking.hasConfiguredBay(bayId)) {
      throw new RequestValidationError("bayId must identify a configured garage space.");
    }
    return Promise.resolve({ imageUrl: parking.getCameraPreviewUrl(bayId) });
  });

  registerComponentRoute("/api/available-spaces", "Available space", (request) =>
    parking.findAvailableSpaces({
      floor: optionalInteger(request.query.floor, "floor", { min: 1, max: 11 }),
      floors: integerList(request.query.floors),
      designation: typeof request.query.designation === "string" ? request.query.designation : undefined,
      limit: optionalInteger(request.query.limit, "limit", { min: 1, max: 24 }) ?? 12,
      page: 1,
      includeImage: true,
    }),
  );

  registerComponentRoute("/api/plate-search", "Plate search", async (request) => {
    const query = plateQuery(request.query.query);
    return parking.searchLicensePlate(query, {
      limit: optionalInteger(request.query.limit, "limit", { min: 1, max: 24 }) ?? 12,
      page: 1,
      includeImage: true,
    });
  });

  /**
   * Registers the model-visible half of the hybrid agent. These GET endpoints
   * use a Microsoft-vaulted, app-scoped API key and intentionally omit signed
   * camera URLs. The paired SPFx routes retain delegated Entra authorization
   * and own all interactive UI and image rendering.
   */
  const registerPluginRoute = (
    path: string,
    label: string,
    handler: (request: Request) => Promise<unknown>,
  ): void => {
    app.get(path, requirePluginApiKeyAuthorization, async (request: Request, response: Response) => {
      try {
        response.json(await handler(request));
      } catch (error) {
        if (error instanceof RequestValidationError) {
          response.status(error.statusCode).json({ error: error.message });
          return;
        }
        console.error(`${label} plugin lookup failed.`, error);
        response.status(502).json({ error: "The garage service is temporarily unavailable." });
      }
    });
  };

  registerPluginRoute("/api/plugin/overview", "Garage overview", async () =>
    toPluginDataResult(await parking.getOverview()),
  );

  registerPluginRoute("/api/plugin/available-spaces", "Available space", async (request) =>
    toPluginDataResult(await parking.findAvailableSpaces({
      floors: integerList(request.query.floors),
      designation: typeof request.query.designation === "string" ? request.query.designation : undefined,
      limit: optionalInteger(request.query.limit, "limit", { min: 1, max: 24 }) ?? 12,
      page: 1,
      includeImage: false,
    })),
  );

  registerPluginRoute("/api/plugin/plate-search", "Plate search", async (request) =>
    toPluginDataResult(await parking.searchLicensePlate(plateQuery(request.query.query), {
      limit: optionalInteger(request.query.limit, "limit", { min: 1, max: 24 }) ?? 12,
      page: 1,
      includeImage: false,
    })),
  );

  registerPluginRoute("/api/plugin/stale-feeds", "Stale feed", async (request) =>
    toPluginDataResult(await parking.getStaleCameraFeeds({
      floors: integerList(request.query.floors),
      thresholdMinutes: optionalInteger(request.query.thresholdMinutes, "thresholdMinutes", { min: 1, max: 10_080 }),
      limit: optionalInteger(request.query.limit, "limit", { min: 1, max: 24 }) ?? 12,
      page: 1,
      includeImage: false,
    })),
  );

  if (config.genUiEnabled) {
    // Checked at startup in config.ts, so both are set here.
    const model = createGenUiModel(config.azureOpenAiResource!, config.azureOpenAiDeployment!);
    const genUiRateLimit = createRateLimitMiddleware(new FixedWindowRateLimiter(
      config.genUiRateLimitMaxRequests,
      config.rateLimitWindowSeconds * 1000,
    ));
    app.post(
      "/api/genui/chat",
      genUiRateLimit,
      requireMcpAuthorization,
      createGenUiChatHandler(parking, model, config.garage),
    );

    // What the page needs to sign in. Identifiers, not secrets. In api-key mode
    // the browser has no way to hold the key, so the page reports it unusable.
    app.get("/genui/config.json", (_request: Request, response: Response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json(config.authMode === "entra"
        ? {
            authMode: "entra",
            tenantId: config.entraTenantId,
            clientId: config.entraClientId,
            scope: `api://${config.entraClientId}/${config.entraRequiredScope}`,
          }
        : { authMode: config.authMode });
    });

    const genUiDirectory = resolveGenUiDirectory();
    if (genUiDirectory) {
      app.get("/genui", (_request: Request, response: Response) => response.sendFile(path.join(genUiDirectory, "genui.html")));
      app.use("/genui", express.static(genUiDirectory, { index: false }));
    } else {
      console.warn("GENUI_ENABLED is set but the page is not built; run `npm run build:genui`.");
    }
  }

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
