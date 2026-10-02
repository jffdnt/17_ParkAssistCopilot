export function createPluginOpenApiDocument(publicBaseUrl: string): Record<string, unknown> {
  const successResponse = {
    description: "Authoritative point-in-time ParkAssist result.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/GarageResult" },
      },
    },
  };
  const errorResponses = {
    "400": { description: "Invalid query." },
    "401": { description: "Missing or invalid plugin credential." },
    "502": { description: "Garage data source unavailable." },
  };
  const floorsParameter = {
    name: "floors",
    in: "query",
    required: false,
    description: "One floor, a range, or a comma-separated set, for example 5, 7-9, or 2,5,9.",
    schema: { type: "string" },
  };
  const limitParameter = {
    name: "limit",
    in: "query",
    required: false,
    description: "Maximum number of bays to include in the model-visible page.",
    schema: { type: "integer", minimum: 1, maximum: 24, default: 12 },
  };

  return {
    openapi: "3.0.1",
    info: {
      title: "ParkAssist Garage Live Data API",
      version: "1.0.0",
      description: "Read-only model-visible facts for the 5 Bell parking garage. Camera images are rendered separately by the delegated SPFx UX.",
    },
    // Keep the server at the origin and put the full API prefix in each path.
    // Microsoft 365's API-plugin runtime otherwise normalizes a server URL
    // containing a path back to `/` before function execution.
    servers: [{ url: publicBaseUrl }],
    security: [{ ParkAssistPluginKey: [] }],
    paths: {
      "/api/plugin/overview": {
        get: {
          operationId: "garageOverviewData",
          summary: "Read the current garage overview",
          description: "Returns current occupancy, availability, out-of-service, and camera-health totals for 5 Bell.",
          responses: { "200": successResponse, ...errorResponses },
        },
      },
      "/api/plugin/available-spaces": {
        get: {
          operationId: "findAvailableSpacesData",
          summary: "Read current available parking spaces",
          description: "Returns authoritative totals and a bounded page of live, vacant, in-service spaces.",
          parameters: [
            floorsParameter,
            {
              name: "designation",
              in: "query",
              required: false,
              description: "Parking designation such as General, Compact, or EV.",
              schema: { type: "string" },
            },
            limitParameter,
          ],
          responses: { "200": successResponse, ...errorResponses },
        },
      },
      "/api/plugin/plate-search": {
        get: {
          operationId: "searchLicensePlateData",
          summary: "Locate a vehicle by license plate",
          description: "Returns occupied 5 Bell bay matches for at least three supplied license-plate characters.",
          parameters: [
            {
              name: "query",
              in: "query",
              required: true,
              description: "Full or partial license plate text with at least three characters.",
              schema: { type: "string", minLength: 3, maxLength: 16 },
            },
            limitParameter,
          ],
          responses: { "200": successResponse, ...errorResponses },
        },
      },
      "/api/plugin/stale-feeds": {
        get: {
          operationId: "getStaleCameraFeedsData",
          summary: "Read stale or missing camera-feed status",
          description: "Returns authoritative stale or missing feed totals and affected bay metadata without camera image URLs.",
          parameters: [
            floorsParameter,
            {
              name: "thresholdMinutes",
              in: "query",
              required: false,
              description: "Age in minutes after which a camera snapshot is stale.",
              schema: { type: "integer", minimum: 1, maximum: 10080, default: 15 },
            },
            limitParameter,
          ],
          responses: { "200": successResponse, ...errorResponses },
        },
      },
    },
    components: {
      securitySchemes: {
        ParkAssistPluginKey: {
          type: "apiKey",
          in: "header",
          name: "x-parkassist-api-key",
        },
      },
      schemas: {
        GarageResult: {
          type: "object",
          required: ["view", "title", "summary", "garage", "generatedAt", "metrics", "bays", "totalMatches", "hasMore"],
          properties: {
            view: { type: "string", enum: ["overview", "availability", "plate-search", "stale-feeds"] },
            title: { type: "string" },
            summary: { type: "string", description: "Authoritative natural-language summary to quote in the same turn." },
            garage: { type: "string" },
            generatedAt: { type: "string", format: "date-time" },
            staleAfterMinutes: { type: "integer" },
            metrics: { $ref: "#/components/schemas/GarageMetrics" },
            metricsInScope: { $ref: "#/components/schemas/GarageMetrics" },
            totalMatches: { type: "integer" },
            configuredInScope: { type: "integer" },
            hasMore: { type: "boolean" },
            query: { type: "string" },
            floorBreakdown: {
              type: "array",
              items: {
                type: "object",
                required: ["floor", "count", "configured"],
                properties: {
                  floor: { type: "integer" },
                  count: { type: "integer" },
                  configured: { type: "integer" },
                },
              },
            },
            bays: {
              type: "array",
              description: "A bounded page. Use totalMatches for totals; never count this array as the total.",
              items: { $ref: "#/components/schemas/GarageBay" },
            },
          },
        },
        GarageMetrics: {
          type: "object",
          properties: {
            configured: { type: "integer" },
            live: { type: "integer" },
            occupied: { type: "integer" },
            available: { type: "integer" },
            reserved: { type: "integer" },
            outOfService: { type: "integer" },
            staleFeeds: { type: "integer" },
            missingFeeds: { type: "integer" },
            offlineSensors: { type: "integer" },
            occupancyPercent: { type: "number" },
          },
        },
        GarageBay: {
          type: "object",
          required: ["bayId", "spaceNumber", "floor", "designation", "occupied", "outOfService", "reserved", "feedState"],
          properties: {
            bayId: { type: "string" },
            spaceNumber: { type: "string" },
            floor: { type: "integer" },
            designation: { type: "string" },
            occupied: { type: "boolean" },
            outOfService: { type: "boolean" },
            reserved: { type: "boolean" },
            plateDisplay: { type: "string" },
            thumbnailAgeMinutes: { type: "number" },
            feedState: { type: "string", enum: ["fresh", "stale", "missing"] },
          },
        },
      },
    },
  };
}
