import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { McpServer } from "@modelcontextprotocol/server";
import { createParkAssistMcpServer } from "../src/server/mcp.js";
import { CameraUrlSigner } from "../src/server/services/camera-signing.js";
import { ParkingDataService } from "../src/server/services/parking-data.js";
import type { BayMapRow, ParkAssistBay } from "../src/server/types.js";

const mapRows: BayMapRow[] = [
  { bayId: "b1", spaceNumber: "101", floor: 1, designation: "General", garage: "5 Bell" },
  { bayId: "b2", spaceNumber: "102", floor: 1, designation: "General", garage: "5 Bell" },
];

const liveBays: ParkAssistBay[] = [
  { id: "b1", is_occupied: false, sensor: { thumbnail_timestamp: new Date().toISOString() } },
  { id: "b2", is_occupied: true, sensor: { thumbnail_timestamp: new Date().toISOString() } },
];

describe("hybrid MCP tools", () => {
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    const parking = new ParkingDataService({
      mapRows,
      apiBaseUrl: "https://garage.example/api",
      garage: "5 Bell",
      staleAfterMinutes: 15,
      cacheSeconds: 0,
      signer: new CameraUrlSigner("https://mcp.example", "test-secret", 300),
      fetchFn: async () => new Response(JSON.stringify(liveBays), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    });
    server = createParkAssistMcpServer(parking);
    client = new Client({ name: "parkassist-hybrid-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("exposes model-visible companions without UI metadata", async () => {
    const listed = await client.listTools();
    const textTool = listed.tools.find((tool) => tool.name === "garage-overview-data");
    const uiTool = listed.tools.find((tool) => tool.name === "garage-overview");

    expect(textTool).toBeDefined();
    expect(textTool?._meta).toBeUndefined();
    expect(uiTool?._meta).toMatchObject({ ui: { resourceUri: "ui://parkassist-copilot/garage-view.html" } });

    const result = await client.callTool({ name: "garage-overview-data", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "text", text: expect.stringContaining("available") }),
    ]));
    expect(result.structuredContent).toMatchObject({
      view: "overview",
      metrics: { configured: 2, available: 1, occupied: 1 },
    });
  });
});
