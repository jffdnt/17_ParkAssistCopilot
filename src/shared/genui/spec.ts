import { z } from "zod/v4";
import { GARAGE_STATUSES, type GarageStatus } from "../contracts.js";

/**
 * The generative UI contract: the JSON an LLM writes to compose a garage view.
 *
 * The one rule everything here serves is that **the model never writes a
 * number**. A spec names *which data* to show (`sources`) and *how* to show it
 * (`root`); the server fetches each source once and fills in every value. The
 * only free text is prose (`narrative`, `callout`), and a count inside prose
 * goes through a `{{sourceId.metric}}` token that the server resolves too.
 *
 * Two reasons. A model asked "how many spaces on floor 7?" will produce a
 * plausible number whether or not it read one. And the upstream feed flaps
 * between calls, so two tiles each fetching their own data can disagree on
 * the same screen; one fetch per source per answer cannot.
 */

export const MAX_DEPTH = 4;
export const MAX_LEAVES = 12;
export const MAX_SOURCES = 4;

const floor = z.number().int().min(1).max(11);
const floors = z
  .array(floor)
  .min(1)
  .max(11)
  .optional()
  .describe('Garage floors to include. Expand ranges, so "floors 7 to 9" is [7, 8, 9]. Omit for the whole garage.');
const sourceId = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]{0,23}$/)
  .describe("Short camelCase id that leaves use to refer to this source, e.g. \"avail\".");

// ---------------------------------------------------------------------------
// Sources: the queries a spec may run. One per distinct question asked of the
// garage; every leaf bound to the same source sees the same data.
// ---------------------------------------------------------------------------

export const SourceSchema = z.discriminatedUnion("query", [
  z.object({
    id: sourceId,
    query: z.literal("overview").describe("Garage-wide counters."),
  }),
  z.object({
    id: sourceId,
    query: z.literal("availableSpaces").describe("Spaces ready to park in, optionally by floor and type."),
    floors,
    designation: z.string().trim().min(1).max(40).optional().describe("Space type, one of General, VP, Officer, Handicapped, Company Electric Vehicle. Matched as a case-insensitive substring."),
  }),
  z.object({
    id: sourceId,
    query: z.literal("plateSearch").describe("Find vehicles by full or partial plate."),
    plate: z.string().trim().min(3).max(16),
  }),
  z.object({
    id: sourceId,
    query: z.literal("staleFeeds").describe("Bays whose camera feed is stale or missing."),
    floors,
    thresholdMinutes: z.number().int().min(1).max(10_080).optional(),
  }),
  z.object({
    id: sourceId,
    query: z.literal("statusDetail").describe("Every bay in one status across the whole garage, unpaged."),
    status: z.enum(GARAGE_STATUSES as [GarageStatus, ...GarageStatus[]]),
  }),
]);
export type Source = z.infer<typeof SourceSchema>;
export type SourceQuery = Source["query"];

// ---------------------------------------------------------------------------
// What can be read from a source.
// ---------------------------------------------------------------------------

export const METRICS = [
  "totalMatches",
  "configured",
  "live",
  "occupied",
  "available",
  "reserved",
  "outOfService",
  "staleFeeds",
  "missingFeeds",
  "offlineSensors",
  "occupancyPercent",
] as const;
export type Metric = (typeof METRICS)[number];

/**
 * Named, chart-ready breakdowns. `donut` is allowed only where the slices are
 * disjoint and sum to the whole: the garage counters overlap (an occupied bay
 * can also be out of service, and a reserved empty bay is in no counter), so a
 * pie of them would show proportions that do not exist.
 */
export const DATASETS = {
  floorBreakdown: {
    description: "Matching bays per floor.",
    queries: ["availableSpaces", "staleFeeds", "statusDetail"],
    donut: true,
  },
  statusMix: {
    description: "Available, occupied, reserved and out-of-service counters. Overlapping, so bar charts only.",
    queries: ["overview", "availableSpaces", "staleFeeds"],
    donut: false,
  },
  feedHealth: {
    description: "Stale feeds, missing feeds and offline sensors. Overlapping, so bar charts only.",
    queries: ["overview", "availableSpaces", "staleFeeds"],
    donut: false,
  },
  categoryMix: {
    description: "A status split into its categories: time parked for occupied, stale vs no telemetry for stale-or-missing.",
    queries: ["statusDetail"],
    donut: true,
  },
  designationMix: {
    description: "A status split by space type.",
    queries: ["statusDetail"],
    donut: true,
  },
} as const satisfies Record<string, { description: string; queries: readonly SourceQuery[]; donut: boolean }>;
export type Dataset = keyof typeof DATASETS;
const datasetNames = Object.keys(DATASETS) as [Dataset, ...Dataset[]];

/**
 * The garage counter a status drill-down's total equals, from the same
 * predicate (`matchesStatus` in parking-data.ts). Models reach for
 * `occupied` on an "occupied" drill-down, and it is the same number, so
 * accept it. "stale-or-missing" has no single counter (it is staleFeeds plus
 * missingFeeds), so it answers only `totalMatches`.
 */
export const STATUS_METRIC: Record<GarageStatus, Metric | undefined> = {
  available: "available",
  occupied: "occupied",
  "out-of-service": "outOfService",
  "stale-or-missing": undefined,
};

const GARAGE_COUNTERS = METRICS.filter((metric) => metric !== "totalMatches");

/** Metrics a source can answer. A list view's `totalMatches` is its answer; the overview has none. */
export function metricsFor(source: Source): readonly Metric[] {
  switch (source.query) {
    case "overview":
      return GARAGE_COUNTERS;
    case "availableSpaces":
      // The garage counters are scoped by floor only, never by space type. With
      // a designation filter they would show the garage-wide count under a
      // "Company EV" heading (the walkthrough's "900 available EV spaces").
      return source.designation ? ["totalMatches"] : METRICS;
    case "staleFeeds":
      return METRICS;
    case "plateSearch":
      return ["totalMatches"];
    case "statusDetail": {
      const own = STATUS_METRIC[source.status];
      return own ? ["totalMatches", own] : ["totalMatches"];
    }
  }
}

/** Why a metric is unavailable, and where to get it instead: the retry should not need a guess. */
function unavailableMetric(where: string, metric: string, source: Source): string {
  const offered = metricsFor(source).join(", ");
  const hint = source.query === "availableSpaces" && source.designation
    ? " Counters are not filtered by space type; totalMatches is this source's answer."
    : (GARAGE_COUNTERS as readonly string[]).includes(metric)
      ? ` For the "${metric}" counter, add an overview source and bind to that.`
      : " For a breakdown (by floor, type or category), use a barChart or donutChart with a dataset.";
  return `${where}: "${metric}" is not available from a ${source.query} source, which offers ${offered}.${hint}`;
}

/** Queries that produce a list of bays. */
export const BAY_LIST_QUERIES: readonly SourceQuery[] = ["availableSpaces", "staleFeeds", "plateSearch", "statusDetail"];

// ---------------------------------------------------------------------------
// Nodes.
// ---------------------------------------------------------------------------

const ref = z.string().describe("The `id` of a source in `sources`.");
const title = z.string().trim().min(1).max(80);

export const LeafSchema = z.discriminatedUnion("type", [
  z.object({
    // No `label`: the server names every tile from its metric and scope. A
    // model-written label put "stale or missing" on the stale-only counter.
    type: z.literal("kpi").describe("One counter. Labelled automatically from the metric and the source's scope."),
    source: ref,
    metric: z.enum(METRICS),
  }),
  z.object({
    type: z.literal("occupancyGauge"),
    source: ref,
  }),
  z.object({
    type: z.literal("barChart"),
    source: ref,
    dataset: z.enum(datasetNames),
    title: title.optional(),
  }),
  z.object({
    type: z.literal("donutChart"),
    source: ref,
    dataset: z.enum(datasetNames),
    title: title.optional(),
  }),
  z.object({
    type: z.literal("bayGrid").describe("Compact colored tiles, one per bay."),
    source: ref,
    title: title.optional(),
  }),
  z.object({
    type: z.literal("bayTable").describe("One row per bay with plate, type and feed age."),
    source: ref,
    title: title.optional(),
  }),
  z.object({
    type: z.literal("plateCard").describe("Where matching vehicles are parked. plateSearch sources only."),
    source: ref,
  }),
  z.object({
    type: z.literal("cameraPreview").describe("Live camera image for one bay. Use a bayId returned by a data tool."),
    bayId: z.string().trim().min(1).max(40),
  }),
  z.object({
    type: z.literal("callout"),
    tone: z.enum(["info", "success", "warning", "danger"]),
    text: z.string().trim().min(1).max(400).describe("Write counts as {{sourceId.metric}}, never as digits."),
  }),
  z.object({
    type: z.literal("narrative"),
    text: z.string().trim().min(1).max(600).describe("Write counts as {{sourceId.metric}}, never as digits."),
  }),
]);
export type Leaf = z.infer<typeof LeafSchema>;
export type LeafType = Leaf["type"];

export interface Layout {
  type: "stack" | "row" | "grid" | "section";
  title?: string;
  columns?: number;
  children: UiNode[];
}
export type UiNode = Layout | Leaf;

export const LayoutSchema: z.ZodType<Layout> = z.object({
  type: z.enum(["stack", "row", "grid", "section"]).describe("stack: vertical. row: side by side. grid: `columns` wide. section: titled stack."),
  title: title.optional(),
  columns: z.number().int().min(2).max(4).optional(),
  get children() {
    return z.array(UiNodeSchema).min(1).max(MAX_LEAVES);
  },
});

export const UiNodeSchema: z.ZodType<UiNode> = z.union([LayoutSchema, LeafSchema]);

export const UiSpecSchema = z.object({
  title: title.describe("Headline for the view, phrased as the answer."),
  sources: z.array(SourceSchema).max(MAX_SOURCES),
  root: UiNodeSchema,
});
export type UiSpec = z.infer<typeof UiSpecSchema>;

export function isLayout(node: UiNode): node is Layout {
  return node.type === "stack" || node.type === "row" || node.type === "grid" || node.type === "section";
}

// ---------------------------------------------------------------------------
// Rules the schema cannot express: they relate a leaf to the source it names.
// Run after `UiSpecSchema` parses. Returns every problem at once, so the model
// can fix them all in its retry instead of one per round trip.
// ---------------------------------------------------------------------------

export const TEMPLATE_TOKEN = /\{\{\s*([a-zA-Z0-9]+)\.([a-zA-Z]+)\s*\}\}/g;

/**
 * Numbers in model-written text that are not allowed there. Counts belong in
 * `{{source.metric}}` tokens; the walkthrough found a headline built from a
 * 12-bay sample ("parked from 100 to 41,942 minutes", true minimum 2) and
 * prose quoting digits the prompt had forbidden.
 *
 * Allowed: tokens, floor and space references ("floor 7", "floors 7-9",
 * "space 744"), and mixed letter-digit identifiers (plates, "7B", "EV1",
 * "12h+" category names). Number words ("forty-seven") are not caught.
 */
export function strayNumbers(text: string): string[] {
  const cleaned = text
    .replace(TEMPLATE_TOKEN, " ")
    .replace(/\b(?:floors?|levels?|spaces?|bays?)\s+\d+(?:\s*(?:-|–|to|and|or|,|&)\s*(?:floors?\s+)?\d+)*/gi, " ")
    .replace(/\b(?=[a-z0-9-]*[a-z])(?=[a-z0-9-]*\d)[a-z0-9-]+\+?/gi, " ");
  return cleaned.match(/\d[\d,.]*%?/g) ?? [];
}

export function checkSpec(spec: UiSpec): string[] {
  const problems: string[] = [];
  const sources = new Map<string, Source>();
  for (const source of spec.sources) {
    if (sources.has(source.id)) problems.push(`Source id "${source.id}" is used twice.`);
    sources.set(source.id, source);
  }

  let leaves = 0;

  const sourceFor = (id: string, where: string): Source | undefined => {
    const source = sources.get(id);
    if (!source) problems.push(`${where} refers to source "${id}", which is not in \`sources\`.`);
    return source;
  };

  const checkFreeText = (text: string | undefined, where: string) => {
    if (!text) return;
    const numbers = strayNumbers(text);
    if (numbers.length > 0) {
      problems.push(
        `${where}: "${text}" contains ${numbers.join(", ")}. Text you write must not state counts: ` +
          `use a {{source.metric}} token in a callout or narrative, or a kpi. Floors ("floor 7") and plates are fine.`,
      );
    }
  };

  const checkText = (text: string, where: string) => {
    checkFreeText(text, where);
    // Anything brace-wrapped that is not exactly {{source.metric}} would be
    // neither validated nor filled, and reach the screen as raw text (the live
    // run showed "{{occ.stats.parkedMinutes.min}}" to the user).
    for (const [braced] of text.matchAll(/\{\{[^{}]*(?:\}\}?)?/g)) {
      if (!new RegExp(`^${TEMPLATE_TOKEN.source}$`).test(braced)) {
        problems.push(
          `${where}: "${braced}" is not a valid token. Only {{sourceId.metric}} with one of the source's metrics works; ` +
            `stats (minimum, median, maximum) cannot be shown in a view, so mention them in your closing reply instead.`,
        );
      }
    }
    for (const [, id, metric] of text.matchAll(TEMPLATE_TOKEN)) {
      const source = sourceFor(id, where);
      if (source && !(metricsFor(source) as readonly string[]).includes(metric)) {
        problems.push(unavailableMetric(`${where} {{${id}.${metric}}}`, metric, source));
      }
    }
  };

  const visit = (node: UiNode, depth: number, path: string) => {
    if (depth > MAX_DEPTH) {
      problems.push(`${path} is nested ${depth} deep; the limit is ${MAX_DEPTH}.`);
      return;
    }
    if (isLayout(node)) {
      if (node.type === "grid" && node.columns === undefined) problems.push(`${path}: a grid needs \`columns\`.`);
      checkFreeText(node.title, `${path} title`);
      node.children.forEach((child, index) => visit(child, depth + 1, `${path}.children[${index}]`));
      return;
    }

    leaves += 1;
    const where = `${path} (${node.type})`;
    if ("title" in node) checkFreeText(node.title, `${where} title`);
    switch (node.type) {
      case "kpi": {
        const source = sourceFor(node.source, where);
        if (source && !metricsFor(source).includes(node.metric)) problems.push(unavailableMetric(where, node.metric, source));
        break;
      }
      case "occupancyGauge": {
        const source = sourceFor(node.source, where);
        if (source && !metricsFor(source).includes("occupancyPercent")) {
          problems.push(`${where}: an occupancy gauge needs an overview, availableSpaces or staleFeeds source.`);
        }
        break;
      }
      case "barChart":
      case "donutChart": {
        const source = sourceFor(node.source, where);
        const dataset = DATASETS[node.dataset];
        if (source && !(dataset.queries as readonly SourceQuery[]).includes(source.query)) {
          problems.push(`${where}: dataset "${node.dataset}" needs a ${dataset.queries.join(" or ")} source, not ${source.query}.`);
        }
        if (node.type === "donutChart" && !dataset.donut) {
          problems.push(`${where}: "${node.dataset}" counters overlap, so they cannot be a donut. Use a barChart.`);
        }
        break;
      }
      case "bayGrid":
      case "bayTable": {
        const source = sourceFor(node.source, where);
        if (source && !BAY_LIST_QUERIES.includes(source.query)) {
          problems.push(`${where}: an overview source has no bay list. Use availableSpaces, staleFeeds, plateSearch or statusDetail.`);
        }
        break;
      }
      case "plateCard": {
        const source = sourceFor(node.source, where);
        if (source && source.query !== "plateSearch") problems.push(`${where}: a plateCard needs a plateSearch source.`);
        break;
      }
      case "callout":
      case "narrative":
        checkText(node.text, where);
        break;
      case "cameraPreview":
        break;
    }
  };

  checkFreeText(spec.title, "View title");
  visit(spec.root, 1, "root");

  if (leaves === 0) problems.push("The view has no content: add at least one leaf.");
  if (leaves > MAX_LEAVES) problems.push(`The view has ${leaves} leaves; the limit is ${MAX_LEAVES}.`);
  // A declared but unused source is not a problem: `hydrate` skips it. Rejecting it
  // cost a full model round trip in a third of the first eval's questions, for no benefit.
  return problems;
}

/** Ids of the sources a view actually binds to, through leaves or `{{id.metric}}` tokens. */
export function usedSourceIds(root: UiNode): Set<string> {
  const used = new Set<string>();
  const visit = (node: UiNode) => {
    if (isLayout(node)) {
      node.children.forEach(visit);
      return;
    }
    if ("source" in node) used.add(node.source);
    if (node.type === "callout" || node.type === "narrative") {
      for (const [, id] of node.text.matchAll(TEMPLATE_TOKEN)) used.add(id);
    }
  };
  visit(root);
  return used;
}

// ---------------------------------------------------------------------------
// The hydrated spec: what the browser receives. Every value here came from
// the server's snapshot, not from the model.
// ---------------------------------------------------------------------------

export type Tone = "neutral" | "success" | "brand" | "teal" | "marigold" | "warning" | "danger";

export interface SeriesRow {
  label: string;
  value: number;
  tone?: Tone;
  /** Denominator where one is meaningful, e.g. configured bays on a floor. */
  of?: number;
}

export interface BayRow {
  bayId: string;
  spaceNumber: string;
  floor: number;
  designation: string;
  /** What this bay is in the view's terms: "Available", "Stale feed", "3h 10m"... */
  status: string;
  tone: Tone;
  reserved: boolean;
  plateDisplay?: string;
  plateConfidence?: number;
  feedState: "fresh" | "stale" | "missing";
  thumbnailAgeMinutes?: number;
  issue?: string;
}

/**
 * Every list carries its full total beside the rows it shows. A table is one
 * page of the matches, and a reader who sees 12 rows will otherwise take 12 as
 * the answer.
 */
export interface ListMeta {
  total: number;
  shown: number;
}

export type Resolved =
  | { kind: "metric"; value: number; label: string; unit?: "%" }
  | { kind: "gauge"; percent: number; occupied: number; of: number; label: string }
  | { kind: "series"; rows: SeriesRow[]; total: number; label: string }
  | ({ kind: "bays"; rows: BayRow[]; label: string } & ListMeta)
  | ({ kind: "plates"; rows: BayRow[]; query: string } & ListMeta)
  | { kind: "camera"; bayId: string; spaceNumber?: string; floor?: number }
  | { kind: "text"; text: string };

export type HydratedLeaf = Leaf & { resolved: Resolved };
export interface HydratedLayout extends Omit<Layout, "children"> {
  children: HydratedNode[];
}
export type HydratedNode = HydratedLayout | HydratedLeaf;

export interface HydratedSpec {
  title: string;
  /** Snapshot time of the oldest source, so the view never claims to be fresher than its stalest part. */
  asOf: string;
  /** The bindings, kept so a follow-up can ask about exactly this data. */
  sources: Source[];
  root: HydratedNode;
}
