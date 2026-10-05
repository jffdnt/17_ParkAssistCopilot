import type {
  GarageBayResult,
  GarageMetrics,
  GarageStatusDetail,
  GarageStatusSpace,
  GarageToolResult,
} from "../contracts.js";
import { categoriesFor, categoryOf, formatDuration } from "../status-categories.js";
import {
  isLayout,
  STATUS_METRIC,
  usedSourceIds,
  type BayRow,
  type HydratedNode,
  type HydratedSpec,
  type Leaf,
  type Metric,
  type Resolved,
  type SeriesRow,
  type Source,
  type StatMeasure,
  type UiNode,
  type UiSpec,
} from "./spec.js";

/**
 * Turns a validated spec into a hydrated one: every number in the output is
 * read from `fetchSource`, never from the spec. Pure apart from the two
 * lookups it is given, so it runs identically in tests and on the server.
 */

/** What one source resolved to. List queries return a page plus totals; `statusDetail` is unpaged. */
export type SourceData =
  | { kind: "list"; result: GarageToolResult }
  | { kind: "detail"; detail: GarageStatusDetail };

export interface HydrateDeps {
  fetchSource(source: Source): Promise<SourceData>;
  /** Space number and floor for a bay id, or undefined when the bay is not in the bay map. */
  describeBay(bayId: string): { spaceNumber: string; floor: number } | undefined;
}

/** Most bays drawn from an unpaged status drill-down. The full total is still reported. */
export const MAX_DETAIL_ROWS = 48;

/** A spec that passed validation but cannot be filled, e.g. a camera for an unknown bay. Shown to the model. */
export class HydrationError extends Error {}

/**
 * What each counter counts. Tiles and `{{tokens}}` are named from these, never
 * by the model: a model-written label once put "stale or missing" on the
 * stale-only counter, contradicting the chart beside it.
 */
const METRIC_NOUNS: Record<Exclude<Metric, "totalMatches">, string> = {
  configured: "configured spaces",
  live: "spaces reporting live",
  occupied: "occupied spaces",
  available: "available spaces",
  reserved: "reserved spaces",
  outOfService: "out-of-service spaces",
  staleFeeds: "stale camera feeds",
  missingFeeds: "spaces with no camera telemetry",
  offlineSensors: "offline sensors",
  occupancyPercent: "occupancy",
};

/** A metric as a plural noun phrase, in the terms of the source it is read from. */
export function metricNoun(metric: Metric, source: Source): string {
  if (metric !== "totalMatches") return METRIC_NOUNS[metric];
  switch (source.query) {
    case "availableSpaces":
      return source.designation ? `available ${source.designation} spaces` : "available spaces";
    case "staleFeeds":
      return "stale or missing camera feeds";
    case "plateSearch":
      return "matching vehicles";
    case "statusDetail":
      return statusLabel(source.status).toLowerCase();
    case "overview":
      return "spaces";
  }
}

/** The part of the garage a source covers: "whole garage", "floors 7–9", "plate ABC". */
export function scopeOf(source: Source): string {
  switch (source.query) {
    case "availableSpaces":
    case "staleFeeds":
      return source.floors ? floorsText(source.floors) : "whole garage";
    case "plateSearch":
      return `plate ${source.plate.toUpperCase()}`;
    default:
      return "whole garage";
  }
}

function floorsText(floors: number[]): string {
  const sorted = [...new Set(floors)].sort((left, right) => left - right);
  if (sorted.length === 1) return `floor ${sorted[0]}`;
  const contiguous = sorted.every((floor, index) => index === 0 || floor === sorted[index - 1] + 1);
  return contiguous ? `floors ${sorted[0]}–${sorted.at(-1)}` : `floors ${sorted.join(", ")}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A tile's label: "Stale or missing camera feeds · whole garage". */
function metricLabel(metric: Metric, source: Source): string {
  return `${capitalize(metricNoun(metric, source))} · ${scopeOf(source)}`;
}

export async function hydrate(spec: UiSpec, deps: HydrateDeps): Promise<HydratedSpec> {
  // Fetch every source up front, concurrently, and exactly once. Leaves then
  // read from this map, so two tiles bound to one source cannot disagree.
  // Declared but unbound sources are dropped, not fetched: they would only add
  // a query and appear in the view's bindings without anything to show.
  const used = usedSourceIds(spec.root);
  const sources = spec.sources.filter((source) => used.has(source.id));
  const entries = await Promise.all(
    sources.map(async (source) => [source.id, { source, data: await deps.fetchSource(source) }] as const),
  );
  const resolvedSources = new Map(entries);

  const lookup = (id: string) => {
    const entry = resolvedSources.get(id);
    // checkSpec has already rejected unknown ids; this guards direct callers.
    if (!entry) throw new HydrationError(`Unknown source "${id}".`);
    return entry;
  };

  const asOf = entries
    .map(([, { data }]) => (data.kind === "list" ? data.result.generatedAt : data.detail.generatedAt))
    .sort()[0] ?? new Date().toISOString();

  const visit = (node: UiNode): HydratedNode => {
    if (isLayout(node)) return { ...node, children: node.children.map(visit) };
    return { ...node, resolved: resolveLeaf(node, lookup, deps) } as HydratedNode;
  };

  return { title: spec.title, asOf, sources, root: visit(spec.root) };
}

type Lookup = (id: string) => { source: Source; data: SourceData };

function resolveLeaf(leaf: Leaf, lookup: Lookup, deps: HydrateDeps): Resolved {
  switch (leaf.type) {
    case "kpi": {
      const { source, data } = lookup(leaf.source);
      return {
        kind: "metric",
        value: readMetric(data, leaf.metric),
        label: metricLabel(leaf.metric, source),
        unit: leaf.metric === "occupancyPercent" ? "%" : undefined,
      };
    }
    case "occupancyGauge": {
      const { source, data } = lookup(leaf.source);
      const metrics = scopedMetrics(data);
      return {
        kind: "gauge",
        percent: metrics.occupancyPercent,
        occupied: metrics.occupied,
        of: metrics.configured,
        label: `Occupancy · ${scopeOf(source)}`,
      };
    }
    case "barChart":
    case "donutChart": {
      const { source, data } = lookup(leaf.source);
      return series(leaf.dataset, source, data, leaf.title);
    }
    case "bayGrid":
    case "bayTable": {
      const { source, data } = lookup(leaf.source);
      return { kind: "bays", ...bayRows(source, data), label: leaf.title ?? defaultListLabel(source) };
    }
    case "plateCard": {
      const { source, data } = lookup(leaf.source);
      if (source.query !== "plateSearch" || data.kind !== "list") {
        throw new HydrationError("A plateCard needs a plateSearch source.");
      }
      return { kind: "plates", ...bayRows(source, data), query: data.result.query ?? source.plate.toUpperCase() };
    }
    case "cameraPreview": {
      const bay = deps.describeBay(leaf.bayId);
      if (!bay) throw new HydrationError(`Bay "${leaf.bayId}" is not a configured garage space. Use a bayId returned by a data tool.`);
      return { kind: "camera", bayId: leaf.bayId, ...bay };
    }
    case "stat": {
      const { data } = lookup(leaf.source);
      const detail = requireDetail(data, "stat");
      const stats = durationStats(allSpaces(detail).map(({ space }) => measureOf(leaf.measure, space)));
      return {
        kind: "duration",
        minutes: stats?.[leaf.stat],
        of: stats?.count ?? 0,
        label: `${capitalize(leaf.stat)} ${leaf.measure === "timeParked" ? "time parked" : "camera image age"} · ${statusLabel(detail.status).toLowerCase()}`,
      };
    }
    case "callout":
      return { kind: "text", text: leaf.text };
  }
}

/**
 * The counters for the scope a source asked about. A floor-filtered list view
 * carries both garage-wide `metrics` and `metricsInScope`; showing the
 * garage-wide number beside a floor-scoped total reads as a contradiction.
 */
function scopedMetrics(data: SourceData): GarageMetrics {
  if (data.kind === "detail") throw new HydrationError("A statusDetail source has no garage counters; use its totalMatches.");
  return data.result.metricsInScope ?? data.result.metrics;
}

function readMetric(data: SourceData, metric: Metric): number {
  if (metric === "totalMatches") return data.kind === "detail" ? data.detail.total : data.result.totalMatches;
  // A drill-down's own counter is its total: the "occupied" drill-down and the
  // occupied tile come from the same predicate in the same snapshot.
  if (data.kind === "detail" && STATUS_METRIC[data.detail.status] === metric) return data.detail.total;
  return scopedMetrics(data)[metric];
}

function series(dataset: string, source: Source, data: SourceData, title: string | undefined): Resolved {
  const finish = (rows: SeriesRow[], label: string, total = rows.reduce((sum, row) => sum + row.value, 0)): Resolved => ({
    kind: "series",
    rows,
    total,
    label: title ?? label,
  });

  switch (dataset) {
    case "floorBreakdown": {
      if (data.kind === "detail") {
        return finish(
          data.detail.floors.map((floor) => ({ label: `Floor ${floor.floor}`, value: floor.spaces.length, of: floor.configured })),
          `${statusLabel(data.detail.status)} by floor`,
          data.detail.total,
        );
      }
      const breakdown = data.result.floorBreakdown;
      if (!breakdown) throw new HydrationError(`A ${source.query} source returned no floor breakdown.`);
      return finish(
        breakdown.map((floor) => ({ label: `Floor ${floor.floor}`, value: floor.count, of: floor.configured })),
        `${defaultListLabel(source)} by floor`,
        data.result.totalMatches,
      );
    }
    case "statusMix": {
      const metrics = scopedMetrics(data);
      // Not summed: these counters overlap, so the total is the configured count, not their sum.
      return finish(
        [
          { label: "Available", value: metrics.available, tone: "success" },
          { label: "Occupied", value: metrics.occupied, tone: "brand" },
          { label: "Reserved", value: metrics.reserved, tone: "teal" },
          { label: "Out of service", value: metrics.outOfService, tone: "danger" },
        ],
        "Space status",
        metrics.configured,
      );
    }
    case "feedHealth": {
      const metrics = scopedMetrics(data);
      return finish(
        [
          { label: "Stale feeds", value: metrics.staleFeeds, tone: "warning" },
          { label: "Missing feeds", value: metrics.missingFeeds, tone: "danger" },
          { label: "Offline sensors", value: metrics.offlineSensors, tone: "marigold" },
        ],
        "Camera and sensor health",
        metrics.configured,
      );
    }
    case "categoryMix": {
      const detail = requireDetail(data, dataset);
      const counts = countBy(allSpaces(detail), ({ space }) => categoryOf(detail.status, space));
      return finish(
        categoriesFor(detail.status)
          .map((category) => ({ label: category.label, value: counts.get(category.key) ?? 0, tone: category.tone }))
          .filter((row) => row.value > 0),
        `${statusLabel(detail.status)} by category`,
        detail.total,
      );
    }
    case "designationMix": {
      const detail = requireDetail(data, dataset);
      const counts = countBy(allSpaces(detail), ({ space }) => space.designation);
      return finish(
        [...counts.entries()]
          .sort((left, right) => right[1] - left[1])
          .map(([designation, value]) => ({ label: designation, value })),
        `${statusLabel(detail.status)} by space type`,
        detail.total,
      );
    }
    default:
      throw new HydrationError(`Unknown dataset "${dataset}".`);
  }
}

export interface DurationStats {
  /** How many bays had a value; bays without one (no entry time, no camera) are left out. */
  count: number;
  shortest: number;
  median: number;
  longest: number;
}

/**
 * Shortest, median and longest of a set of minute values, over every value
 * present. One function behind both the data tools' `stats` and the `stat`
 * tile, so the model's reply and the view cannot disagree.
 */
export function durationStats(values: (number | undefined)[]): DurationStats | undefined {
  const present = values.filter((value): value is number => value !== undefined).sort((left, right) => left - right);
  if (present.length === 0) return undefined;
  return {
    count: present.length,
    shortest: Math.round(present[0]),
    median: Math.round(present[Math.floor(present.length / 2)]),
    longest: Math.round(present[present.length - 1]),
  };
}

function measureOf(measure: StatMeasure, space: GarageStatusSpace): number | undefined {
  return measure === "timeParked" ? space.parkedMinutes : space.thumbnailAgeMinutes;
}

function requireDetail(data: SourceData, dataset: string): GarageStatusDetail {
  if (data.kind !== "detail") throw new HydrationError(`Dataset "${dataset}" needs a statusDetail source.`);
  return data.detail;
}

function allSpaces(detail: GarageStatusDetail): { floor: number; space: GarageStatusSpace }[] {
  return detail.floors.flatMap((floor) => floor.spaces.map((space) => ({ floor: floor.floor, space })));
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

function statusLabel(status: GarageStatusDetail["status"]): string {
  switch (status) {
    case "available":
      return "Available spaces";
    case "occupied":
      return "Occupied spaces";
    case "stale-or-missing":
      return "Stale or missing feeds";
    case "out-of-service":
      return "Out-of-service spaces";
  }
}

function defaultListLabel(source: Source): string {
  switch (source.query) {
    case "availableSpaces":
      return "Available spaces";
    case "staleFeeds":
      return "Stale camera feeds";
    case "plateSearch":
      return `Vehicles matching ${source.plate.toUpperCase()}`;
    case "statusDetail":
      return statusLabel(source.status);
    case "overview":
      return "Garage";
  }
}

function bayRows(source: Source, data: SourceData): { rows: BayRow[]; total: number; shown: number } {
  if (data.kind === "detail") {
    const status = data.detail.status;
    const tones = new Map(categoriesFor(status).map((category) => [category.key, category.tone]));
    const rows = allSpaces(data.detail)
      .slice(0, MAX_DETAIL_ROWS)
      .map(({ floor, space }): BayRow => ({
        bayId: space.bayId,
        spaceNumber: space.spaceNumber,
        floor,
        designation: space.designation,
        status: detailStatusText(status, space),
        tone: tones.get(categoryOf(status, space)) ?? "neutral",
        reserved: space.reserved,
        plateDisplay: space.plateDisplay,
        feedState: space.feedState,
        thumbnailAgeMinutes: space.thumbnailAgeMinutes,
        issue: space.health?.issueType,
      }));
    return { rows, total: data.detail.total, shown: rows.length };
  }

  const rows = data.result.bays.map((bay) => listRow(source, bay));
  return { rows, total: data.result.totalMatches, shown: rows.length };
}

function detailStatusText(status: GarageStatusDetail["status"], space: GarageStatusSpace): string {
  switch (status) {
    case "available":
      return "Available";
    case "occupied":
      return space.parkedMinutes === undefined ? "Parked, entry time unknown" : `Parked ${formatDuration(space.parkedMinutes)}`;
    case "stale-or-missing":
      return feedText(space.feedState, space.thumbnailAgeMinutes);
    case "out-of-service":
      return space.health?.issueType ?? "Out of service";
  }
}

function feedText(feedState: BayRow["feedState"], ageMinutes: number | undefined): string {
  return feedState === "missing" || ageMinutes === undefined ? "No telemetry" : `Feed ${formatDuration(ageMinutes)} old`;
}

/**
 * One row of a paged list. `imageUrl` is deliberately dropped: signed camera
 * links are short-lived and must not land in the model's context or the chat
 * transcript. The browser requests a fresh one when a camera is opened.
 */
function listRow(source: Source, bay: GarageBayResult): BayRow {
  const base = {
    bayId: bay.bayId,
    spaceNumber: bay.spaceNumber,
    floor: bay.floor,
    designation: bay.designation,
    reserved: bay.reserved,
    plateDisplay: bay.plateDisplay,
    plateConfidence: bay.plateConfidence,
    feedState: bay.feedState,
    thumbnailAgeMinutes: bay.thumbnailAgeMinutes,
    issue: bay.health?.issueType,
  };
  switch (source.query) {
    case "staleFeeds":
      return { ...base, status: feedText(bay.feedState, bay.thumbnailAgeMinutes), tone: bay.feedState === "missing" ? "danger" : "warning" };
    case "plateSearch":
      return { ...base, status: bay.plateDisplay ?? "Occupied", tone: "brand" };
    default:
      return { ...base, status: bay.outOfService ? "Out of service" : bay.occupied ? "Occupied" : "Available", tone: bay.occupied ? "brand" : "success" };
  }
}
