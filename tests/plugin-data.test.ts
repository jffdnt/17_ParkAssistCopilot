import { describe, expect, it } from "vitest";
import type { GarageToolResult } from "../src/shared/contracts.js";
import { toPluginDataResult } from "../src/server/plugin-data.js";

describe("model-visible plugin data", () => {
  it("removes signed camera URLs without changing the authoritative result", () => {
    const source: GarageToolResult = {
      view: "stale-feeds",
      title: "Stale feeds",
      summary: "One stale feed.",
      garage: "5 Bell",
      generatedAt: "2026-10-01T18:00:00.000Z",
      staleAfterMinutes: 15,
      metrics: {
        configured: 1,
        live: 1,
        occupied: 1,
        available: 0,
        reserved: 0,
        outOfService: 0,
        staleFeeds: 1,
        missingFeeds: 0,
        offlineSensors: 0,
        occupancyPercent: 100,
      },
      bays: [{
        bayId: "B1",
        spaceNumber: "101",
        floor: 1,
        designation: "General",
        occupied: true,
        outOfService: false,
        reserved: false,
        plateDisplay: "ABC123",
        feedState: "stale",
        imageUrl: "https://example.test/signed-camera.jpg",
      }],
      totalMatches: 1,
      hasMore: false,
      adaptiveCard: { type: "AdaptiveCard" },
    };

    const result = toPluginDataResult(source);
    expect(result.summary).toBe(source.summary);
    expect(result.bays[0].plateDisplay).toBe("ABC123");
    expect(result.bays[0]).not.toHaveProperty("imageUrl");
    expect(result.adaptiveCard).toBeUndefined();
    expect(source.bays[0].imageUrl).toContain("signed-camera");
  });
});
