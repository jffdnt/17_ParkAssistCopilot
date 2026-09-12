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

  it("scopes stale feeds to a set of floors and tallies each one", async () => {
    const result = await service.getStaleCameraFeeds({ floors: [2, 3], thresholdMinutes: 15, limit: 12, page: 1 });

    expect(result.totalMatches).toBe(2);
    expect(result.bays.map((bay) => bay.bayId).sort()).toEqual(["b2", "b3"]);
    expect(result.configuredInScope).toBe(3);
    // Floor 3 matched nothing but was asked about, so it stays in the
    // breakdown — "0" is an answer, an absent row is an ambiguity.
    expect(result.floorBreakdown).toEqual([
      { floor: 2, count: 2, configured: 2 },
      { floor: 3, count: 0, configured: 1 },
    ]);
    expect(result.title).toBe("Stale camera feeds on floors 2–3");
    expect(result.summary).toBe(
      "2 of the 3 mapped spaces on floors 2–3 have camera feeds older than 15 minutes or missing telemetry.",
    );
  });

  it("describes a non-contiguous floor set without implying a range", async () => {
    const result = await service.getStaleCameraFeeds({ floors: [1, 3], thresholdMinutes: 15, limit: 12, page: 1 });

    expect(result.totalMatches).toBe(0);
    expect(result.title).toBe("Stale camera feeds on floors 1 and 3");
    expect(result.floorBreakdown).toEqual([
      { floor: 1, count: 0, configured: 1 },
      { floor: 3, count: 0, configured: 1 },
    ]);
  });

  it("prefers the floor set over the legacy single-floor filter", async () => {
    const result = await service.getStaleCameraFeeds({ floor: 1, floors: [2], thresholdMinutes: 15, limit: 12, page: 1 });

    expect(result.totalMatches).toBe(2);
    expect(result.filters).toMatchObject({ floor: 1, floors: [2] });
  });

  it("deduplicates and sorts a floor set before reporting it", async () => {
    const result = await service.getStaleCameraFeeds({ floors: [3, 2, 3], thresholdMinutes: 15, limit: 12, page: 1 });

    expect(result.filters?.floors).toEqual([2, 3]);
    expect(result.title).toBe("Stale camera feeds on floors 2–3");
  });

  it("scopes the card's counters to the requested floors", async () => {
    const result = await service.getStaleCameraFeeds({ floors: [2, 3], thresholdMinutes: 15, limit: 12, page: 1 });

    // Garage-wide metrics stay put for the overview; the scoped set is what the
    // card reads, so it cannot show a garage total under a floor-scoped summary.
    expect(result.metrics.configured).toBe(4);
    expect(result.metricsInScope).toMatchObject({ configured: 3, staleFeeds: 1, missingFeeds: 1, outOfService: 1 });

    const body = result.adaptiveCard?.body as Record<string, unknown>[];
    const scopeLabel = body.find((item) => item.text === "Floors 2–3");
    expect(scopeLabel).toBeDefined();

    const factSets = body.filter((item) => item.type === "FactSet");
    // Camera health reports stale and missing separately so they reconcile
    // with the summary, which counts them together.
    expect(factSets[0].facts).toEqual([
      { title: "Stale feeds", value: "1" },
      { title: "Missing feeds", value: "1" },
      { title: "Offline sensors", value: "1" },
      { title: "Out of service", value: "1" },
    ]);
    expect(factSets[1].facts).toEqual([
      { title: "Floor 2", value: "2 of 2" },
      { title: "Floor 3", value: "0 of 1" },
    ]);
  });

  it("says how much of the match set the card shows, not how much the page holds", async () => {
    const complete = await service.getStaleCameraFeeds({ thresholdMinutes: 15, limit: 12, page: 1 });
    const completeBody = complete.adaptiveCard?.body as Record<string, unknown>[];
    // Two matches, both rendered: nothing to disclose.
    expect(complete.hasMore).toBe(false);
    expect(completeBody.some((item) => String(item.text ?? "").startsWith("Showing "))).toBe(false);
  });

  it("labels an unfiltered card garage-wide", async () => {
    const result = await service.getStaleCameraFeeds({ thresholdMinutes: 15, limit: 12, page: 1 });
    const body = result.adaptiveCard?.body as Record<string, unknown>[];
    expect(body.some((item) => item.text === "Garage-wide")).toBe(true);
    // One floor in the results, so no split is drawn.
    expect((body.filter((item) => item.type === "FactSet")).length).toBe(1);
  });

  it("scopes availability to a set of floors", async () => {
    const scoped = await service.findAvailableSpaces({ floors: [2, 3], limit: 12, page: 1 });
    expect(scoped.totalMatches).toBe(0);
    expect(scoped.title).toBe("Available parking on floors 2–3");

    const including = await service.findAvailableSpaces({ floors: [1, 2], limit: 12, page: 1 });
    expect(including.totalMatches).toBe(1);
    expect(including.floorBreakdown).toEqual([
      { floor: 1, count: 1, configured: 1 },
      { floor: 2, count: 0, configured: 2 },
    ]);
  });
});
