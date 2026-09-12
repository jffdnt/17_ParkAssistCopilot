import { beforeEach, describe, expect, it } from "vitest";
import type { BayMapRow, ParkAssistBay } from "../src/server/types.js";
import { CameraUrlSigner } from "../src/server/services/camera-signing.js";
import { ParkingDataService } from "../src/server/services/parking-data.js";

const mapRows: BayMapRow[] = [
  { bayId: "b1", spaceNumber: "101", floor: 1, designation: "General", garage: "5 Bell" },
  { bayId: "b2", spaceNumber: "202", floor: 2, designation: "General", garage: "5 Bell" },
  { bayId: "b3", spaceNumber: "203", floor: 2, designation: "Handicapped", garage: "5 Bell" },
  { bayId: "b4", spaceNumber: "301", floor: 3, designation: "General", garage: "5 Bell" },
];

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function liveBays(): ParkAssistBay[] {
  return [
    { id: "b1", is_occupied: false, sensor: { thumbnail_timestamp: minutesAgo(2), last_contact: minutesAgo(1) } },
    {
      id: "b2",
      is_occupied: true,
      visit: { entry_timestamp: minutesAgo(90), plate: { text: "ABC 123", confidence: 0.98 } },
      sensor: { thumbnail_timestamp: minutesAgo(45), last_contact: minutesAgo(44) },
    },
    { id: "b3", is_occupied: false, is_out_of_service: true, sensor: {} },
    { id: "b4", is_occupied: false, is_reserved: true, sensor: { thumbnail_timestamp: minutesAgo(1), last_contact: minutesAgo(1) } },
  ];
}

describe("parking data tools", () => {
  let service: ParkingDataService;

  beforeEach(() => {
    const fetchFn = async () => new Response(JSON.stringify(liveBays()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    service = new ParkingDataService({
      mapRows,
      apiBaseUrl: "https://garage.example/api",
      garage: "5 Bell",
      staleAfterMinutes: 15,
      cacheSeconds: 30,
      signer: new CameraUrlSigner("https://mcp.example", "test-secret", 300),
      fetchFn,
    });
  });

  it("computes availability and health metrics", async () => {
    const result = await service.getOverview();
    expect(result.metrics).toMatchObject({
      configured: 4,
      live: 4,
      occupied: 1,
      available: 1,
      reserved: 1,
      outOfService: 1,
      staleFeeds: 1,
      missingFeeds: 1,
      offlineSensors: 1,
    });
    expect(result.adaptiveCard?.type).toBe("AdaptiveCard");
  });

  it("returns only vacant, usable spaces", async () => {
    const result = await service.findAvailableSpaces({ limit: 12, page: 1 });
    expect(result.totalMatches).toBe(1);
    expect(result.bays.map((bay) => bay.bayId)).toEqual(["b1"]);
  });

  it("returns the full plate for partial and exact matches", async () => {
    const partial = await service.searchLicensePlate("ABC", { limit: 12, page: 1 });
    expect(partial.bays[0].plateDisplay).toBe("ABC 123");

    const exact = await service.searchLicensePlate("ABC123", { limit: 12, page: 1 });
    expect(exact.bays[0].plateDisplay).toBe("ABC 123");
  });

  it("returns stale and missing camera feeds with signed previews", async () => {
    const result = await service.getStaleCameraFeeds({ thresholdMinutes: 15, limit: 12, page: 1 });
    expect(result.totalMatches).toBe(2);
    expect(result.bays.map((bay) => bay.bayId).sort()).toEqual(["b2", "b3"]);
    expect(result.bays.every((bay) => bay.imageUrl?.startsWith("https://mcp.example/api/cameras/"))).toBe(true);
  });
});
