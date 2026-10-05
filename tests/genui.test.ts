import { describe, expect, it } from "vitest";
import { hydrate, type HydrateDeps } from "../src/shared/genui/hydrate.js";
import { checkSpec, isLayout, strayNumbers, UiSpecSchema, type HydratedNode, type HydratedSpec, type UiSpec } from "../src/shared/genui/spec.js";
import { followUpBinding, followUpQuestion, splitFollowUp } from "../src/shared/genui/follow-up.js";
import { summarizeView } from "../src/shared/genui/summary.js";
import { snapshotKey, TurnSnapshot } from "../src/server/genui/snapshot.js";
import { CameraUrlSigner } from "../src/server/services/camera-signing.js";
import { ParkingDataService } from "../src/server/services/parking-data.js";
import type { BayMapRow, ParkAssistBay } from "../src/server/types.js";

// ---------------------------------------------------------------------------
// A small garage: floors 1, 7, 8 and 9.
// ---------------------------------------------------------------------------

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const mapRows: BayMapRow[] = [
  { bayId: "b101", spaceNumber: "101", floor: 1, designation: "General", garage: "5 Bell" },
  { bayId: "b102", spaceNumber: "102", floor: 1, designation: "VP", garage: "5 Bell" },
  { bayId: "b701", spaceNumber: "701", floor: 7, designation: "General", garage: "5 Bell" },
  { bayId: "b702", spaceNumber: "702", floor: 7, designation: "General", garage: "5 Bell" },
  { bayId: "b801", spaceNumber: "801", floor: 8, designation: "Handicapped", garage: "5 Bell" },
  { bayId: "b901", spaceNumber: "901", floor: 9, designation: "General", garage: "5 Bell" },
];

const fresh = { thumbnail_timestamp: minutesAgo(2) };
const liveBays: ParkAssistBay[] = [
  { id: "b101", is_occupied: false, sensor: fresh },
  { id: "b102", is_occupied: true, sensor: fresh, visit: { entry_timestamp: minutesAgo(90), plate: { text: "ABC1234", confidence: 0.97 } } },
  { id: "b701", is_occupied: false, sensor: fresh },
  { id: "b702", is_occupied: false, sensor: { thumbnail_timestamp: minutesAgo(600) } },
  { id: "b801", is_occupied: false, is_out_of_service: true, sensor: {} },
  { id: "b901", is_occupied: true, sensor: fresh, visit: { plate: { text: "XYZ9876" } } },
];

function createGarage() {
  const upstream = { calls: 0 };
  const parking = new ParkingDataService({
    mapRows,
    apiBaseUrl: "https://garage.example/api",
    garage: "5 Bell",
    staleAfterMinutes: 15,
    // No cache: every read would hit upstream, so any sharing seen below is the turn pin's doing.
    cacheSeconds: 0,
    signer: new CameraUrlSigner("https://mcp.example", "test-secret", 300),
    fetchFn: async () => {
      upstream.calls += 1;
      return new Response(JSON.stringify(liveBays), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  return { parking, upstream };
}

function depsFor(snapshot: TurnSnapshot, parking: ParkingDataService): HydrateDeps {
  return { fetchSource: (source) => snapshot.fetch(source), describeBay: (bayId) => parking.describeBay(bayId) };
}

function leaves(node: HydratedNode): HydratedNode[] {
  return isLayout(node) ? node.children.flatMap(leaves) : [node];
}

function parse(spec: unknown): UiSpec {
  return UiSpecSchema.parse(spec);
}

const answerSpec = parse({
  title: "Spaces free on floors 7-9",
  sources: [
    { id: "avail", query: "availableSpaces", floors: [9, 7, 8] },
    { id: "garage", query: "overview" },
  ],
  root: {
    type: "stack",
    children: [
      {
        type: "row",
        children: [
          // A model-supplied label is ignored: the server names tiles.
          { type: "kpi", source: "avail", metric: "totalMatches", label: "Free on 7-9" },
          { type: "kpi", source: "garage", metric: "available" },
        ],
      },
      { type: "callout", tone: "info", text: "Free spaces on floors 7-9 right now." },
      { type: "barChart", source: "avail", dataset: "floorBreakdown" },
      { type: "bayTable", source: "avail" },
    ],
  },
});

// ---------------------------------------------------------------------------

describe("generative UI spec", () => {
  it("accepts a well-formed spec", () => {
    expect(checkSpec(answerSpec)).toEqual([]);
  });

  it("rejects a donut of overlapping counters, and says what to use instead", () => {
    const problems = checkSpec(parse({
      title: "Status",
      sources: [{ id: "o", query: "overview" }],
      root: { type: "donutChart", source: "o", dataset: "statusMix" },
    }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/cannot be a donut.*barChart/);
  });

  it("reports every cross-reference problem at once", () => {
    const problems = checkSpec(parse({
      title: "Broken",
      sources: [
        { id: "o", query: "overview" },
        { id: "unused", query: "statusDetail", status: "occupied" },
      ],
      root: {
        type: "stack",
        children: [
          { type: "kpi", source: "missing", metric: "available" },
          { type: "kpi", source: "o", metric: "totalMatches" },
          { type: "plateCard", source: "o" },
          { type: "callout", tone: "info", text: "{{o.bogus}} spaces" },
        ],
      },
    }));
    expect(problems.join("\n")).toMatch(/"missing", which is not in `sources`/);
    expect(problems.join("\n")).toMatch(/"totalMatches" is not available from a overview source/);
    expect(problems.join("\n")).toMatch(/plateCard needs a plateSearch source/);
    expect(problems.join("\n")).toMatch(/"\{\{o\.bogus\}\} spaces" contains a \{\{placeholder\}\}/);
    // An unused source is tolerated, not rejected: hydrate drops it.
    expect(problems.join("\n")).not.toMatch(/unused/);
    expect(problems).toHaveLength(4);
  });

  it("lets a status drill-down answer its own counter, and points elsewhere for the rest", () => {
    const spec = (status: string, metric: string) => parse({
      title: "Drill-down",
      sources: [{ id: "d", query: "statusDetail", status }],
      root: { type: "kpi", source: "d", metric },
    });
    expect(checkSpec(spec("occupied", "occupied"))).toEqual([]);
    expect(checkSpec(spec("out-of-service", "outOfService"))).toEqual([]);
    // stale-or-missing is staleFeeds plus missingFeeds: no single counter to alias.
    expect(checkSpec(spec("stale-or-missing", "staleFeeds")).join()).toMatch(/add an overview source/);
    expect(checkSpec(spec("occupied", "available")).join()).toMatch(/"available" is not available from a statusDetail source, which offers totalMatches, occupied\. For the "available" counter, add an overview source/);
  });

  it("enforces the depth and leaf limits", () => {
    const deep = { type: "stack", children: [{ type: "stack", children: [{ type: "stack", children: [{ type: "stack", children: [{ type: "callout", tone: "info", text: "x" }] }] }] }] };
    expect(checkSpec(parse({ title: "Deep", sources: [], root: deep })).join()).toMatch(/nested 5 deep/);

    const wide = { type: "stack", children: Array.from({ length: 12 }, () => ({ type: "stack", children: [{ type: "callout", tone: "info", text: "x" }, { type: "callout", tone: "info", text: "y" }] })) };
    expect(checkSpec(parse({ title: "Wide", sources: [], root: wide })).join()).toMatch(/24 leaves; the limit is 12/);
  });

  it("rejects unknown component types at the schema", () => {
    expect(UiSpecSchema.safeParse({ title: "x", sources: [], root: { type: "script", src: "evil.js" } }).success).toBe(false);
  });

  it("keys equivalent queries identically, whatever order floors arrive in", () => {
    expect(snapshotKey({ id: "a", query: "availableSpaces", floors: [9, 7, 8] }))
      .toBe(snapshotKey({ id: "b", query: "availableSpaces", floors: [7, 8, 9, 7] }));
    expect(snapshotKey({ id: "a", query: "plateSearch", plate: "abc-123" }))
      .toBe(snapshotKey({ id: "b", query: "plateSearch", plate: "ABC 123" }));
  });
});

describe("generative UI hydration", () => {
  it("takes every number from the data service, never the spec", async () => {
    const { parking } = createGarage();
    const view = await hydrate(answerSpec, depsFor(new TurnSnapshot(parking), parking));
    const expected = await parking.findAvailableSpaces({ floors: [7, 8, 9], limit: 24, page: 1 });
    const overview = await parking.getOverview();

    const [freeKpi, garageKpi, callout, chart, table] = leaves(view.root).map((leaf) => ("resolved" in leaf ? leaf.resolved : undefined));
    expect(freeKpi).toEqual({ kind: "metric", value: expected.totalMatches, label: "Available spaces · floors 7–9", unit: undefined });
    // b701 and b702 are free (a stale camera does not make a space unavailable); b801 is out of service, b901 occupied.
    expect(expected.totalMatches).toBe(2);
    expect(garageKpi).toMatchObject({ kind: "metric", value: overview.metrics.available });
    // Callouts carry no numbers, so they pass through as written.
    expect(callout).toEqual({ kind: "text", text: "Free spaces on floors 7-9 right now." });
    expect(chart).toMatchObject({
      kind: "series",
      total: expected.totalMatches,
      rows: expected.floorBreakdown!.map((floor) => ({ label: `Floor ${floor.floor}`, value: floor.count, of: floor.configured })),
    });
    expect(table).toMatchObject({ kind: "bays", total: expected.totalMatches, shown: expected.bays.length });
  });

  it("answers a whole turn from one upstream read, even across different queries", async () => {
    const { parking, upstream } = createGarage();
    const snapshot = new TurnSnapshot(parking);
    // A data tool read, then a view needing three different queries, fetched concurrently.
    await snapshot.fetch({ id: "data", query: "overview" });
    await hydrate(parse({
      title: "Everything",
      sources: [
        { id: "o", query: "overview" },
        { id: "a", query: "availableSpaces" },
        { id: "s", query: "statusDetail", status: "occupied" },
      ],
      root: {
        type: "stack",
        children: [
          { type: "kpi", source: "o", metric: "occupied" },
          { type: "kpi", source: "a", metric: "totalMatches" },
          { type: "donutChart", source: "s", dataset: "categoryMix" },
        ],
      },
    }), depsFor(snapshot, parking));
    expect(upstream.calls).toBe(1);

    // A new turn reads afresh.
    await new TurnSnapshot(parking).fetch({ id: "data", query: "overview" });
    expect(upstream.calls).toBe(2);
  });

  it("does not pin a failed upstream read", async () => {
    let calls = 0;
    const parking = new ParkingDataService({
      mapRows,
      apiBaseUrl: "https://garage.example/api",
      garage: "5 Bell",
      staleAfterMinutes: 15,
      cacheSeconds: 0,
      signer: new CameraUrlSigner("https://mcp.example", "test-secret", 300),
      // First read is truncated mid-body, as the real upstream does about half the time cold.
      // (The body is parsed outside fetchWithRetry, so a truncated read is one failed call, not retried.)
      fetchFn: async () => {
        calls += 1;
        return calls === 1
          ? new Response('[{"id": "b1', { status: 200 })
          : new Response(JSON.stringify(liveBays), { status: 200 });
      },
    });
    const snapshot = new TurnSnapshot(parking);
    await expect(snapshot.fetch({ id: "d", query: "overview" })).rejects.toThrow();
    await expect(snapshot.fetch({ id: "d", query: "overview" })).resolves.toMatchObject({ kind: "list" });
  });

  it("keeps signed camera links out of the view", async () => {
    const { parking } = createGarage();
    const view = await hydrate(parse({
      title: "Stale cameras",
      sources: [{ id: "s", query: "staleFeeds" }],
      root: { type: "bayTable", source: "s" },
    }), depsFor(new TurnSnapshot(parking), parking));
    // The service attaches signed URLs to stale-feed bays; none may survive hydration.
    const raw = await parking.getStaleCameraFeeds({ limit: 24, page: 1 });
    expect(raw.bays.some((bay) => bay.imageUrl)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/imageUrl|https:\/\/mcp\.example/);
  });

  it("shows full plates and splits occupied spaces into time-parked categories", async () => {
    const { parking } = createGarage();
    const view = await hydrate(parse({
      title: "Plate ABC",
      sources: [
        { id: "p", query: "plateSearch", plate: "abc" },
        { id: "occ", query: "statusDetail", status: "occupied" },
      ],
      root: {
        type: "stack",
        children: [
          { type: "plateCard", source: "p" },
          { type: "donutChart", source: "occ", dataset: "categoryMix" },
        ],
      },
    }), depsFor(new TurnSnapshot(parking), parking));
    const [plates, mix] = leaves(view.root).map((leaf) => ("resolved" in leaf ? leaf.resolved : undefined));
    expect(plates).toMatchObject({ kind: "plates", total: 1, rows: [{ plateDisplay: "ABC1234", spaceNumber: "102", floor: 1 }] });
    // b102 entered 90 minutes ago (1-4h); b901 has no entry time.
    expect(mix).toMatchObject({ kind: "series", total: 2, rows: [{ label: "1–4h", value: 1 }, { label: "Entry time unknown", value: 1 }] });
  });

  it("rejects a camera for a bay that is not in the map", async () => {
    const { parking } = createGarage();
    await expect(hydrate(parse({
      title: "Camera",
      sources: [],
      root: { type: "cameraPreview", bayId: "nope" },
    }), depsFor(new TurnSnapshot(parking), parking))).rejects.toThrow(/not a configured garage space/);
  });

  it("summarizes the drawn values for the model", async () => {
    const { parking } = createGarage();
    const view: HydratedSpec = await hydrate(answerSpec, depsFor(new TurnSnapshot(parking), parking));
    const summary = summarizeView(view);
    expect(summary).toMatch(/^Rendered "Spaces free on floors 7-9"/);
    expect(summary).toMatch(/Available spaces · floors 7–9: \d+/);
    expect(summary).toMatch(/Floor 7 \d+, Floor 8 \d+, Floor 9 \d+/);
  });
});

describe("generative UI tile follow-ups", () => {
  it("carries the tile's exact binding, scope included, and round-trips for display", async () => {
    const { parking } = createGarage();
    const view = await hydrate(answerSpec, depsFor(new TurnSnapshot(parking), parking));
    const chart = leaves(view.root).find((leaf) => leaf.type === "barChart")!;

    const binding = followUpBinding(chart as never, view.sources);
    // Floors 7-9 must survive: a follow-up that widens to the whole garage answers a different question.
    expect(binding).toEqual({
      component: "barChart",
      dataset: "floorBreakdown",
      source: { query: "availableSpaces", floors: [9, 7, 8] },
    });

    const message = followUpQuestion("available spaces by floor", binding);
    expect(message).toMatch(/^Tell me more about available spaces by floor\.\n\[About: \{.*\}\]$/);
    expect(splitFollowUp(message)).toEqual({ question: "Tell me more about available spaces by floor.", binding });
  });

  it("names the metric for a kpi and leaves ordinary messages alone", async () => {
    const { parking } = createGarage();
    const view = await hydrate(answerSpec, depsFor(new TurnSnapshot(parking), parking));
    const kpi = leaves(view.root).find((leaf) => leaf.type === "kpi")!;
    expect(followUpBinding(kpi as never, view.sources)).toMatchObject({ component: "kpi", metric: "totalMatches" });

    expect(splitFollowUp("Where is plate ABC?")).toEqual({ question: "Where is plate ABC?" });
    // A user typing something bracket-like is not mistaken for a binding.
    expect(splitFollowUp("Floors 7-9 [About: not json]")).toEqual({ question: "Floors 7-9 [About: not json]" });
  });
});

describe("generative UI fixes from the first model eval", () => {
  it("reads a drill-down's own counter as its total", async () => {
    const { parking } = createGarage();
    const view = await hydrate(parse({
      title: "Occupied",
      sources: [{ id: "occ", query: "statusDetail", status: "occupied" }],
      root: { type: "kpi", source: "occ", metric: "occupied" },
    }), depsFor(new TurnSnapshot(parking), parking));
    const overview = await parking.getOverview();
    const [kpi] = leaves(view.root).map((leaf) => ("resolved" in leaf ? leaf.resolved : undefined));
    expect(kpi).toMatchObject({ kind: "metric", value: overview.metrics.occupied, label: "Occupied spaces · whole garage" });
  });

  it("drops unused sources instead of fetching or reporting them", async () => {
    const { parking } = createGarage();
    const fetched: string[] = [];
    const snapshot = new TurnSnapshot(parking);
    const view = await hydrate(parse({
      title: "Free",
      sources: [
        { id: "avail", query: "availableSpaces" },
        { id: "unused", query: "statusDetail", status: "occupied" },
        { id: "garage", query: "overview" },
      ],
      root: { type: "stack", children: [
        { type: "kpi", source: "avail", metric: "totalMatches" },
        { type: "occupancyGauge", source: "garage" },
      ] },
    }), { fetchSource: (source) => { fetched.push(source.id); return snapshot.fetch(source); }, describeBay: (id) => parking.describeBay(id) });
    expect(fetched.sort()).toEqual(["avail", "garage"]);
    expect(view.sources.map((source) => source.id)).toEqual(["avail", "garage"]);
  });
});

describe("generative UI fixes from the live walkthrough", () => {
  const single = (sources: unknown[], root: unknown, title = "View") => parse({ title, sources, root });

  it("fix 1: a space-type filter leaves only totalMatches", () => {
    const evSource = [{ id: "ev", query: "availableSpaces", designation: "Company Electric Vehicle" }];
    expect(checkSpec(single(evSource, { type: "kpi", source: "ev", metric: "totalMatches" }))).toEqual([]);
    // The walkthrough's "Company EV spaces available: 900" was the garage-wide counter.
    expect(checkSpec(single(evSource, { type: "kpi", source: "ev", metric: "available" })).join())
      .toMatch(/not filtered by space type; totalMatches is this source's answer/);
    expect(checkSpec(single(evSource, { type: "occupancyGauge", source: "ev" })).join()).toMatch(/occupancy gauge/);
    // Without a type filter the floor-scoped counters are still allowed.
    expect(checkSpec(single([{ id: "a", query: "availableSpaces", floors: [7] }], { type: "kpi", source: "a", metric: "available" }))).toEqual([]);
  });

  it("fix 2: rejects counts in model-written text, allows floors, spaces and plates", () => {
    expect(strayNumbers("Occupied spaces have parked from 100 to 41,942 minutes")).toEqual(["100", "41,942"]);
    expect(strayNumbers("Floor 7 has the most stale cameras")).toEqual([]);
    expect(strayNumbers("Floors 7-9 and floor 3 compared")).toEqual([]);
    expect(strayNumbers("Plate ABC1234 is in space 744, bay 7B")).toEqual([]);
    expect(strayNumbers("Floor 7: 47 stale")).toEqual(["47"]);
    expect(strayNumbers("Occupancy is 4%")).toEqual(["4%"]);

    const problems = checkSpec(single(
      [{ id: "s", query: "staleFeeds" }],
      { type: "section", title: "Top 3 floors", children: [
        { type: "barChart", source: "s", dataset: "floorBreakdown", title: "47 on floor 7" },
        { type: "callout", tone: "info", text: "Floor three with 37 and floor one with 29." },
      ] },
      "Parked from 100 to 41,942 minutes",
    ));
    expect(problems.map((problem) => problem.split(":")[0])).toEqual([
      "View title",
      "root title",
      "root.children[0] (barChart) title",
      "root.children[1] (callout)",
    ]);
  });

  it("fix 4: rejects any placeholder in text, so none can reach the screen or be misattributed", () => {
    const problems = checkSpec(single(
      [{ id: "s", query: "staleFeeds" }],
      { type: "stack", title: "Worst: {{s.totalMatches}}", children: [
        { type: "barChart", source: "s", dataset: "floorBreakdown" },
        // Both walkthrough failures: a total pinned on one floor, and an unfillable dotted path.
        { type: "callout", tone: "info", text: "The busiest floor is {{s.totalMatches}}." },
        { type: "callout", tone: "info", text: "Longest {{occ.stats.parkedMinutes.max}}, and {{broken." },
      ] },
    ));
    expect(problems).toHaveLength(3);
    for (const problem of problems) expect(problem).toMatch(/contains a \{\{placeholder\}\}/);
  });

  it("fix 3: tiles are named by the server, with their scope", async () => {
    const { parking } = createGarage();
    const view = await hydrate(single(
      [{ id: "s", query: "staleFeeds", floors: [7, 9] }, { id: "o", query: "overview" }],
      { type: "stack", children: [
        { type: "kpi", source: "s", metric: "totalMatches" },
        { type: "kpi", source: "s", metric: "staleFeeds" },
        { type: "occupancyGauge", source: "o" },
      ] },
    ), depsFor(new TurnSnapshot(parking), parking));
    const [total, staleOnly, gauge] = leaves(view.root).map((leaf) => ("resolved" in leaf ? leaf.resolved : undefined));
    expect(total).toMatchObject({ label: "Stale or missing camera feeds · floors 7, 9" });
    // Distinct from the stale-or-missing total: this is the counter that was mislabelled.
    expect(staleOnly).toMatchObject({ label: "Stale camera feeds · floors 7, 9" });
    expect(gauge).toMatchObject({ label: "Occupancy · whole garage" });
  });
});

describe("generative UI: stat tile and narrative removal", () => {
  const single = (sources: unknown[], root: unknown) => parse({ title: "View", sources, root });

  it("computes stats over every bay in the drill-down, with server labels", async () => {
    const { parking } = createGarage();
    const view = await hydrate(single(
      [{ id: "occ", query: "statusDetail", status: "occupied" }, { id: "stale", query: "statusDetail", status: "stale-or-missing" }],
      { type: "row", children: [
        { type: "stat", source: "occ", measure: "timeParked", stat: "longest" },
        { type: "stat", source: "occ", measure: "timeParked", stat: "shortest" },
        { type: "stat", source: "stale", measure: "cameraAge", stat: "longest" },
      ] },
    ), depsFor(new TurnSnapshot(parking), parking));
    const [longest, shortest, oldest] = leaves(view.root).map((leaf) => ("resolved" in leaf ? leaf.resolved : undefined));
    // Only b102 has an entry time (90 minutes ago); b901's is unknown, so it is left out, not counted as zero.
    expect(longest).toMatchObject({ kind: "duration", minutes: 90, of: 1, label: "Longest time parked · occupied spaces" });
    expect(shortest).toMatchObject({ minutes: 90, of: 1 });
    // b702's feed is 600 minutes old; b801 has no telemetry, so no age.
    expect(oldest).toMatchObject({ kind: "duration", minutes: 600, of: 1, label: "Longest camera image age · stale or missing feeds" });
    expect(summarizeView(view)).toMatch(/Longest time parked · occupied spaces: 1h 30m \(90 minutes, over 1 bays\)/);
  });

  it("allows stats only on unpaged drill-downs, and time parked only on occupied", () => {
    expect(checkSpec(single([{ id: "a", query: "availableSpaces" }], { type: "stat", source: "a", measure: "cameraAge", stat: "median" })).join())
      .toMatch(/needs a statusDetail source, which covers every bay; availableSpaces is paged/);
    expect(checkSpec(single([{ id: "s", query: "statusDetail", status: "stale-or-missing" }], { type: "stat", source: "s", measure: "timeParked", stat: "median" })).join())
      .toMatch(/timeParked needs statusDetail with status "occupied"/);
    expect(checkSpec(single([{ id: "o", query: "statusDetail", status: "occupied" }], { type: "stat", source: "o", measure: "timeParked", stat: "median" }))).toEqual([]);
  });

  it("accepts a plain callout and no longer accepts narratives", () => {
    const sources = [{ id: "o", query: "overview" }];
    expect(checkSpec(single(sources, { type: "stack", children: [
      { type: "kpi", source: "o", metric: "available" },
      { type: "callout", tone: "info", text: "Floor 7 has the most stale cameras." },
    ] }))).toEqual([]);
    expect(UiSpecSchema.safeParse({ title: "x", sources, root: { type: "narrative", text: "Hello." } }).success).toBe(false);
  });
});
