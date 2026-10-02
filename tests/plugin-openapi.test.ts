import { describe, expect, it } from "vitest";
import bundledDocument from "../copilotComponent/copilot/parkassist-live-data.json";
import { createPluginOpenApiDocument } from "../src/server/plugin-openapi.js";

describe("ParkAssist API plugin OpenAPI document", () => {
  it("binds four read-only operations to an app-scoped header credential", () => {
    const document = createPluginOpenApiDocument("https://parkassist.example") as any;
    expect(document.servers).toEqual([{ url: "https://parkassist.example" }]);
    expect(Object.keys(document.paths)).toEqual([
      "/api/plugin/overview",
      "/api/plugin/available-spaces",
      "/api/plugin/plate-search",
      "/api/plugin/stale-feeds",
    ]);
    expect(document.components.securitySchemes.ParkAssistPluginKey).toEqual({
      type: "apiKey",
      in: "header",
      name: "x-parkassist-api-key",
    });
    expect(Object.values(document.paths).map((path: any) => path.get.operationId)).toEqual([
      "garageOverviewData",
      "findAvailableSpacesData",
      "searchLicensePlateData",
      "getStaleCameraFeedsData",
    ]);
  });

  it("keeps the Copilot package contract identical to the server contract", () => {
    expect(bundledDocument).toEqual(
      createPluginOpenApiDocument("https://parkassist-mcp.happyground-f091a09b.eastus.azurecontainerapps.io"),
    );
  });
});
