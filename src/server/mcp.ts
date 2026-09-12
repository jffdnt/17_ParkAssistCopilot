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
        floor: z.number().int().min(1).max(11).optional().describe("A single garage floor. Use `floors` for more than one."),
        floors: z.array(z.number().int().min(1).max(11)).optional().describe("Garage floors to include. Expand a range into every floor it covers, so \"floors 7 to 9\" is [7, 8, 9]. Omit for the whole garage."),
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
        floor: z.number().int().min(1).max(11).optional().describe("A single garage floor. Use `floors` for more than one."),
        floors: z.array(z.number().int().min(1).max(11)).optional().describe("Garage floors to include. Expand a range into every floor it covers, so \"floors 7 to 9\" is [7, 8, 9]. Omit for the whole garage."),
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

/**
 * Per-floor counts as a line the model can quote. Counting the bay list itself
 * would be unreliable and, worse, wrong: that list is one page of `totalMatches`.
 */
function floorBreakdownText(result: GarageToolResult): string {
  if (!result.floorBreakdown || result.floorBreakdown.length < 2) return "";
  const parts = result.floorBreakdown.map((entry) => `floor ${entry.floor}: ${entry.count} of ${entry.configured}`);
  return `\nBy floor — ${parts.join(", ")}.`;
}

function fallbackText(result: GarageToolResult): string {
  const headline = `${result.title}: ${result.summary}${floorBreakdownText(result)}`;
  if (result.bays.length === 0) return headline;
  const listed = result.hasMore
    ? `\nThe ${result.bays.length} most severe of ${result.totalMatches} are listed below; ask for a later page for the rest.`
    : `\nAll ${result.totalMatches} are listed below.`;
  const details = result.bays.map((bay) => {
    const status = bay.feedState === "stale"
      ? `camera ${Math.round(bay.thumbnailAgeMinutes ?? 0)} minutes old`
      : bay.feedState === "missing" ? "camera timestamp missing" : bay.occupied ? "occupied" : "available";
    const plate = bay.plateDisplay ? `, plate ${bay.plateDisplay}` : "";
    return `Space ${bay.spaceNumber} (bay ${bay.bayId}, floor ${bay.floor}): ${status}${plate}`;
  });
  return `${headline}${listed}\n${details.join("\n")}`;
}
