import { tool, type ToolSet } from "ai";
import { z } from "zod/v4";
import { durationStats, hydrate, HydrationError, type SourceData } from "../../shared/genui/hydrate.js";
import { checkSpec, SourceSchema, UiSpecSchema, type HydratedSpec, type Source } from "../../shared/genui/spec.js";
import { summarizeView } from "../../shared/genui/summary.js";
import type { ParkingDataService } from "../services/parking-data.js";
import type { TurnSnapshot } from "./snapshot.js";

/** Bays listed in a data tool's digest. Totals always cover every match. */
const DIGEST_BAYS = 12;

export type RenderViewOutput =
  | { ok: true; summary: string; view?: HydratedSpec }
  | { ok: false; problems: string[] };

// The per-query argument shapes, taken from the spec's own source schemas so a
// data tool and a view binding can never accept different arguments.
const [overviewSource, availableSource, plateSource, staleSource, statusSource] = SourceSchema.options;

/**
 * The tools for one chat turn. Data tools let the model read real numbers
 * before choosing a layout; `render_view` turns its layout into a hydrated
 * view. Both read through the same `TurnSnapshot`.
 */
export function createGenUiTools(snapshot: TurnSnapshot, parking: ParkingDataService): ToolSet {
  const read = (source: Source) => snapshot.fetch(source).then(digest);

  return {
    garage_overview: tool({
      description: "Read garage-wide counters: occupancy, available, reserved, out of service, camera and sensor health.",
      inputSchema: overviewSource.omit({ id: true, query: true }),
      execute: () => read({ id: "data", query: "overview" }),
    }),
    find_available_spaces: tool({
      description: "Read spaces ready to park in, optionally for some floors or a space type. Returns the total, a per-floor split and the first bays.",
      inputSchema: availableSource.omit({ id: true, query: true }),
      execute: (args) => read({ id: "data", query: "availableSpaces", ...args }),
    }),
    search_plate: tool({
      description: "Find parked vehicles by full or partial license plate (at least 3 characters).",
      inputSchema: plateSource.omit({ id: true, query: true }),
      execute: (args) => read({ id: "data", query: "plateSearch", ...args }),
    }),
    stale_camera_feeds: tool({
      description: "Read bays whose camera feed is stale or has no telemetry, optionally for some floors.",
      inputSchema: staleSource.omit({ id: true, query: true }),
      execute: (args) => read({ id: "data", query: "staleFeeds", ...args }),
    }),
    status_detail: tool({
      description: "Read every bay in one status across the whole garage, with per-floor, per-category and per-type counts.",
      inputSchema: statusSource.omit({ id: true, query: true }),
      execute: (args) => read({ id: "data", query: "statusDetail", ...args }),
    }),

    render_view: tool({
      description:
        "Show the answer as a view composed from the component allowlist. Call exactly once per answer, after reading data. " +
        "Bind every number to a source; never write digits for counts. If it returns problems, fix them all and call it again.",
      inputSchema: UiSpecSchema,
      execute: async (spec): Promise<RenderViewOutput> => {
        const problems = checkSpec(spec);
        if (problems.length > 0) return { ok: false, problems };
        try {
          const view = await hydrate(spec, {
            fetchSource: (source) => snapshot.fetch(source),
            describeBay: (bayId) => parking.describeBay(bayId),
          });
          return { ok: true, summary: summarizeView(view), view };
        } catch (error) {
          if (error instanceof HydrationError) return { ok: false, problems: [error.message] };
          throw error;
        }
      },
      // The model needs what was drawn, not the drawing: the summary is a
      // fraction of the size and carries every value it may quote.
      toModelOutput: ({ output }) =>
        output.ok
          ? { type: "text", value: output.summary }
          : { type: "text", value: `The view was not rendered. Fix every problem and call render_view again:\n- ${output.problems.join("\n- ")}` },
    }),
  };
}

/**
 * What the model reads from a data tool: totals, scoped counters, the
 * per-floor split and a short bay list. Signed camera URLs and the Adaptive
 * Card are dropped, since the model has no use for them and the URLs are
 * short-lived credentials.
 */
/**
 * Said beside every bay list. In the walkthrough the model took the minimum
 * and maximum of a 12-bay sample and headlined them as the range for all 38
 * cars (true minimum 2 minutes, not 100).
 */
function sampleNote(shown: number, total: number): string {
  return shown >= total
    ? `sampleBays lists all ${total} matching bays.`
    : `sampleBays is only the first ${shown} of ${total} matching bays. Do not compute totals, minimums, maximums or averages from it; use the totals, breakdowns and stats instead.`;
}

function digest(data: SourceData): Record<string, unknown> {
  if (data.kind === "detail") {
    const { detail } = data;
    const spaces = detail.floors.flatMap((floor) => floor.spaces.map((space) => ({ floor: floor.floor, space })));
    const byType = new Map<string, number>();
    for (const { space } of spaces) byType.set(space.designation, (byType.get(space.designation) ?? 0) + 1);
    return {
      status: detail.status,
      generatedAt: detail.generatedAt,
      total: detail.total,
      byFloor: detail.floors.map((floor) => ({ floor: floor.floor, count: floor.spaces.length, configured: floor.configured })),
      byType: Object.fromEntries(byType),
      // Over every bay in the status, so the model never derives these from the sample.
      // The same function fills the `stat` tile, so a reply and a view agree.
      stats: {
        timeParkedMinutes: durationStats(spaces.map(({ space }) => space.parkedMinutes)),
        cameraAgeMinutes: durationStats(spaces.map(({ space }) => space.thumbnailAgeMinutes)),
      },
      sampleNote: sampleNote(Math.min(DIGEST_BAYS, spaces.length), detail.total),
      sampleBays: spaces.slice(0, DIGEST_BAYS).map(({ floor, space }) => ({
        bayId: space.bayId,
        spaceNumber: space.spaceNumber,
        floor,
        designation: space.designation,
        plateDisplay: space.plateDisplay,
        parkedMinutes: space.parkedMinutes,
        feedState: space.feedState,
        thumbnailAgeMinutes: space.thumbnailAgeMinutes,
      })),
    };
  }

  const { result } = data;
  const sample = result.bays.slice(0, DIGEST_BAYS);
  return {
    generatedAt: result.generatedAt,
    summary: result.summary,
    totalMatches: result.totalMatches,
    hasMore: result.hasMore,
    filters: result.filters,
    // The counters are scoped by floor only. Under a space-type filter they read
    // as type counts ("900 available company EV spaces"), so leave them out.
    ...(result.filters?.designation
      ? { countersNote: "Garage counters are omitted: they ignore the space-type filter. totalMatches is the answer." }
      : { metrics: result.metricsInScope ?? result.metrics }),
    floorBreakdown: result.floorBreakdown,
    sampleNote: sampleNote(sample.length, result.totalMatches),
    sampleBays: sample.map((bay) => ({
      bayId: bay.bayId,
      spaceNumber: bay.spaceNumber,
      floor: bay.floor,
      designation: bay.designation,
      plateDisplay: bay.plateDisplay,
      feedState: bay.feedState,
      thumbnailAgeMinutes: bay.thumbnailAgeMinutes,
    })),
  };
}
