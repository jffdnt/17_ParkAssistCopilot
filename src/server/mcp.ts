import { readFile } from "node:fs/promises";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer, type CallToolResult, type ReadResourceResult } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import type { GarageToolResult } from "../shared/contracts.js";
import { config } from "./config.js";
import { resolveWidgetHtmlPath } from "./paths.js";
import type { ParkingDataService } from "./services/parking-data.js";

const resourceUri = "ui://parkassist-copilot/garage-view.html";

export function createParkAssistMcpServer(parking: ParkingDataService): McpServer {
  const server = new McpServer({
    name: "ParkAssist Garage Copilot",
    version: "0.1.0",
  });

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await readFile(resolveWidgetHtmlPath(), "utf8");
      return {
        contents: [{
          uri: resourceUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: {
              csp: {
                connectDomains: [config.publicBaseUrl],
                resourceDomains: [config.publicBaseUrl],
              },
            },
          },
        }],
      };
    },
  );

  registerAppTool(
    server,
    "garage-overview",
    {
      title: "Show garage overview",
      description: "Use for a live summary of 5 Bell parking occupancy, availability, out-of-service bays, and stale camera feeds.",
      inputSchema: z.object({}),
      _meta: { ui: { resourceUri, visibility: ["model", "app"] } },
    },
    async (): Promise<CallToolResult> => toCallToolResult(await parking.getOverview()),
  );

  registerAppTool(
    server,
    "find-available-spaces",
    {
      title: "Find available parking spaces",
      description: "Find live, vacant, in-service parking spaces. Use a floor or designation such as Handicapped, General, VP, Officer, or Company Electric Vehicle when the user specifies one.",
      inputSchema: z.object({
        floor: z.number().int().min(1).max(11).optional().describe("Garage floor number."),
        designation: z.string().trim().min(1).optional().describe("Optional parking designation or space type."),
        limit: z.number().int().min(1).max(24).default(12),
        page: z.number().int().min(1).default(1),
      }),
      _meta: { ui: { resourceUri, visibility: ["model", "app"] } },
    },
    async (input): Promise<CallToolResult> => toCallToolResult(await parking.findAvailableSpaces(input)),
  );

  registerAppTool(
    server,
    "search-license-plate",
    {
      title: "Search for a license plate",
      description: "Locate an occupied 5 Bell parking bay using at least three characters from a license plate. Full plates are returned for both partial and exact matches.",
      inputSchema: z.object({
        query: z.string().trim().min(3).max(16).describe("Full or partial license plate text."),
        limit: z.number().int().min(1).max(24).default(12),
        page: z.number().int().min(1).default(1),
      }),
      _meta: { ui: { resourceUri, visibility: ["model", "app"] } },
    },
    async ({ query, limit, page }): Promise<CallToolResult> =>
      toCallToolResult(await parking.searchLicensePlate(query, { limit, page })),
  );

  registerAppTool(
    server,
    "get-stale-camera-feeds",
    {
      title: "Show stale camera feeds",
      description: "Identify 5 Bell bays whose latest camera thumbnail is older than the threshold or whose camera timestamp is missing. Returns short-lived camera preview URLs and sensor health context.",
      inputSchema: z.object({
        thresholdMinutes: z.number().int().min(1).max(10_080).default(config.staleAfterMinutes),
        floor: z.number().int().min(1).max(11).optional(),
        includeOutOfService: z.boolean().default(true),
        limit: z.number().int().min(1).max(24).default(12),
        page: z.number().int().min(1).default(1),
      }),
      _meta: { ui: { resourceUri, visibility: ["model", "app"] } },
    },
    async (input): Promise<CallToolResult> => toCallToolResult(await parking.getStaleCameraFeeds(input)),
  );

  return server;
}

function toCallToolResult(result: GarageToolResult): CallToolResult {
  return {
    content: [{ type: "text", text: fallbackText(result) }],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}

function fallbackText(result: GarageToolResult): string {
  if (result.bays.length === 0) return `${result.title}: ${result.summary}`;
  const details = result.bays.map((bay) => {
    const status = bay.feedState === "stale"
      ? `camera ${Math.round(bay.thumbnailAgeMinutes ?? 0)} minutes old`
      : bay.feedState === "missing" ? "camera timestamp missing" : bay.occupied ? "occupied" : "available";
    const plate = bay.plateDisplay ? `, plate ${bay.plateDisplay}` : "";
    return `Space ${bay.spaceNumber} (bay ${bay.bayId}, floor ${bay.floor}): ${status}${plate}`;
  });
  return `${result.title}: ${result.summary}\n${details.join("\n")}`;
}
