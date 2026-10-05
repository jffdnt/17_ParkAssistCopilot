import type {
  GarageBayResult,
  GarageFloorCount,
  GarageMetrics,
  GarageStatus,
  GarageStatusDetail,
  GarageToolResult,
} from "../../shared/contracts.js";
import type { BayMapRow, MergedGarageBay, ParkAssistBay } from "../types.js";
import { buildAdaptiveCard } from "./adaptive-card.js";
import type { CameraUrlSigner } from "./camera-signing.js";
import type { SharePointHealthService } from "./sharepoint-health.js";

type FetchLike = typeof fetch;

interface ParkingDataServiceOptions {
  mapRows: BayMapRow[];
  apiBaseUrl: string;
  garage: string;
  staleAfterMinutes: number;
  cacheSeconds: number;
  signer: CameraUrlSigner;
  healthService?: SharePointHealthService;
  fetchFn?: FetchLike;
}

interface Snapshot {
  generatedAt: string;
  bays: MergedGarageBay[];
  metrics: GarageMetrics;
}

/**
 * The optional tail of a `GarageToolResult`. An object rather than more
 * positional parameters, which had already reached the point where call sites
 * were passing `undefined` to skip over one.
 */
interface BaseResultExtras {
  filters?: GarageToolResult["filters"];
  hasMore?: boolean;
  query?: string;
  floorBreakdown?: GarageFloorCount[];
  configuredInScope?: number;
  metricsInScope?: GarageMetrics;
}

interface ListOptions {
  floor?: number;
  /**
   * Restrict results to this set of floors. Supersedes `floor` when present,
   * which `floor` remains only for the already-published MCP callers.
   *
   * A set rather than a min/max range because it covers both "floors 7 to 9"
   * and "floors 2 and 9" with one parameter, and a caller that can only
   * express a single floor cannot answer a question about three of them.
   */
  floors?: number[];
  designation?: string;
  limit?: number;
  page?: number;
  /**
   * Attach a short-lived signed camera preview URL to each returned bay.
   * Off by default so the MCP tools keep their existing payloads; the SPFx
   * Copilot Components opt in, since a photo is how an operator confirms a
   * space is really empty or that they have found the right vehicle.
   */
  includeImage?: boolean;
}

export class ParkingDataService {
  private readonly fetchFn: FetchLike;
  private cache?: { expiresAt: number; liveBays: ParkAssistBay[] };

  public constructor(private readonly options: ParkingDataServiceOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  public hasConfiguredBay(bayId: string): boolean {
    return this.options.mapRows.some((row) => row.bayId === bayId);
  }

  /**
   * A copy of this service pinned to a single upstream read, for answering
   * several queries as one consistent picture (a generative UI turn).
   *
   * The upstream feed flaps between calls, and the shared cache can expire
   * between two queries, so an overview tile and a list beside it could
   * otherwise come from different reads. Concurrent queries also share the one
   * in-flight request instead of each downloading the full payload. The read
   * still goes through this instance's cache, so pinning adds no upstream load.
   * A failed read is not pinned: the next query retries.
   */
  public forTurn(): ParkingDataService {
    const turn = new ParkingDataService(this.options);
    let liveBays: Promise<ParkAssistBay[]> | undefined;
    turn.getLiveBays = () =>
      (liveBays ??= this.getLiveBays().catch((error: unknown) => {
        liveBays = undefined;
        throw error;
      }));
    return turn;
  }

  /** Space number and floor of a configured bay, or undefined for an unknown id. */
  public describeBay(bayId: string): { spaceNumber: string; floor: number } | undefined {
    const row = this.options.mapRows.find((entry) => entry.bayId === bayId);
    return row ? { spaceNumber: row.spaceNumber, floor: row.floor } : undefined;
  }

  /** Issue a short-lived preview URL after the signed-in user opens one space. */
  public getCameraPreviewUrl(bayId: string): string {
    if (!this.hasConfiguredBay(bayId)) {
      throw new Error(`Camera preview requested for an unknown bay: ${bayId}`);
    }
    return this.options.signer.sign(bayId);
  }

  /** Core upstream check used by the unauthenticated platform readiness probe. */
  public async checkReadiness(): Promise<{ configuredSpaces: number; liveSpaces: number }> {
    let liveBays = this.cache && this.cache.expiresAt > Date.now()
      ? this.cache.liveBays
      : undefined;
    if (!liveBays) {
      const response = await this.fetchFn(`${this.options.apiBaseUrl}/bays`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        throw new Error(`ParkAssist readiness request failed (${response.status} ${response.statusText}).`);
      }
      liveBays = normalizeBayCollection(await response.json() as unknown);
      this.cache = {
        expiresAt: Date.now() + this.options.cacheSeconds * 1000,
        liveBays,
      };
    }
    const configuredIds = new Set(
      this.options.mapRows
        .filter((row) => row.garage === this.options.garage)
        .map((row) => row.bayId),
    );
    const liveSpaces = liveBays.filter((bay) => configuredIds.has(String(bay.id))).length;
    if (liveSpaces === 0) throw new Error("The ParkAssist upstream returned no configured spaces.");
    return { configuredSpaces: configuredIds.size, liveSpaces };
  }

  public async getOverview(): Promise<GarageToolResult> {
    const snapshot = await this.getSnapshot(this.options.staleAfterMinutes);
    const result = this.baseResult(
      "overview",
      `${this.options.garage} garage at a glance`,
      `${snapshot.metrics.available} spaces are available. ${snapshot.metrics.staleFeeds} camera feeds are stale.`,
      snapshot,
      [],
      0,
    );
    return this.withCard(result);
  }

  public async findAvailableSpaces(options: ListOptions): Promise<GarageToolResult> {
    const snapshot = await this.getSnapshot(this.options.staleAfterMinutes);
    const floors = resolveFloors(options);
    let matches = snapshot.bays.filter((bay) => bay.foundInLiveApi && !bay.occupied && !bay.outOfService && !bay.reserved);
    if (floors) matches = matches.filter((bay) => floors.includes(bay.floor));
    if (options.designation) {
      const designation = options.designation.toLowerCase();
      matches = matches.filter((bay) => bay.designation.toLowerCase().includes(designation));
    }
    matches.sort((left, right) => left.floor - right.floor || left.spaceNumber.localeCompare(right.spaceNumber, undefined, { numeric: true }));

    const paged = this.page(matches, options.limit, options.page);
    const floorText = describeFloors(floors);
    const result = this.baseResult(
      "availability",
      `Available parking ${floorText}`,
      `${matches.length} ready-to-use spaces found ${floorText}.`,
      snapshot,
      paged.items.map((bay) => this.toResult(bay, options.includeImage)),
      matches.length,
      {
        filters: { floor: options.floor, floors, designation: options.designation },
        hasMore: paged.hasMore,
        floorBreakdown: floorBreakdown(matches, snapshot.bays, floors),
        configuredInScope: countInScope(snapshot.bays, floors),
        metricsInScope: computeMetrics(baysInScope(snapshot.bays, floors), this.options.staleAfterMinutes),
      },
    );
    return this.withCard(result);
  }

  public async searchLicensePlate(query: string, options: Pick<ListOptions, "limit" | "page" | "includeImage">): Promise<GarageToolResult> {
    const normalizedQuery = normalizePlate(query);
    if (normalizedQuery.length < 3) {
      throw new Error("Enter at least three letters or numbers from the license plate.");
    }

    const snapshot = await this.getSnapshot(this.options.staleAfterMinutes);
    const matches = snapshot.bays
      .filter((bay) =>
        bay.foundInLiveApi &&
        bay.occupied &&
        bay.plate &&
        normalizePlate(bay.plate).includes(normalizedQuery),
      )
      .sort((left, right) => Number(normalizePlate(left.plate ?? "") === normalizedQuery) - Number(normalizePlate(right.plate ?? "") === normalizedQuery))
      .reverse();
    const paged = this.page(matches, options.limit, options.page);
    const result = this.baseResult(
      "plate-search",
      `Vehicle search: ${query.trim().toUpperCase()}`,
      matches.length === 0
        ? "No matching occupied spaces were found."
        : `${matches.length} matching vehicle${matches.length === 1 ? "" : "s"} found.`,
      snapshot,
      paged.items.map((bay) => this.toResult(bay, options.includeImage, this.options.staleAfterMinutes, true)),
      matches.length,
      { hasMore: paged.hasMore, query: query.trim().toUpperCase() },
    );
    return this.withCard(result);
  }

  public async getStaleCameraFeeds(options: ListOptions & {
    thresholdMinutes?: number;
    includeOutOfService?: boolean;
  }): Promise<GarageToolResult> {
    const thresholdMinutes = options.thresholdMinutes ?? this.options.staleAfterMinutes;
    const snapshot = await this.getSnapshot(thresholdMinutes);
    const floors = resolveFloors(options);
    let matches = snapshot.bays.filter((bay) =>
      bay.foundInLiveApi && (bay.thumbnailTimestamp == null || (bay.thumbnailAgeMinutes ?? 0) > thresholdMinutes),
    );
    if (floors) matches = matches.filter((bay) => floors.includes(bay.floor));
    if (options.includeOutOfService === false) matches = matches.filter((bay) => !bay.outOfService);
    matches.sort((left, right) => {
      if (left.thumbnailTimestamp == null && right.thumbnailTimestamp != null) return 1;
      if (left.thumbnailTimestamp != null && right.thumbnailTimestamp == null) return -1;
      return (right.thumbnailAgeMinutes ?? -1) - (left.thumbnailAgeMinutes ?? -1);
    });

    const paged = this.page(matches, options.limit, options.page);
    const floorText = describeFloors(floors);
    const configuredInScope = countInScope(snapshot.bays, floors);
    const result = this.baseResult(
      "stale-feeds",
      floors ? `Stale camera feeds ${floorText}` : "Stale camera feeds",
      `${matches.length} of the ${configuredInScope} mapped space${configuredInScope === 1 ? "" : "s"} ${floorText} ` +
        `${matches.length === 1 ? "has a camera feed" : "have camera feeds"} older than ${thresholdMinutes} minutes or missing telemetry.`,
      snapshot,
      paged.items.map((bay) => this.toResult(bay, true, thresholdMinutes)),
      matches.length,
      {
        filters: {
          floor: options.floor,
          floors,
          includeOutOfService: options.includeOutOfService ?? true,
        },
        hasMore: paged.hasMore,
        floorBreakdown: floorBreakdown(matches, snapshot.bays, floors),
        configuredInScope,
        metricsInScope: computeMetrics(baysInScope(snapshot.bays, floors), thresholdMinutes),
      },
    );
    result.staleAfterMinutes = thresholdMinutes;
    return this.withCard(result);
  }

  /**
   * Every bay counted by one dashboard tile, grouped by floor, for the
   * drill-down behind that tile. Uses the same predicate as `computeMetrics`,
   * so `total` always equals the number on the tile from the same snapshot.
   */
  public async getStatusDetail(status: GarageStatus): Promise<GarageStatusDetail> {
    const staleAfterMinutes = this.options.staleAfterMinutes;
    const snapshot = await this.getSnapshot(staleAfterMinutes);
    const now = Date.parse(snapshot.generatedAt);
    const floors = new Map<number, GarageStatusDetail["floors"][number]>();
    for (const bay of snapshot.bays) {
      if (!floors.has(bay.floor)) floors.set(bay.floor, { floor: bay.floor, configured: 0, spaces: [] });
      floors.get(bay.floor)!.configured += 1;
    }

    let total = 0;
    for (const bay of snapshot.bays) {
      if (!matchesStatus(bay, status, staleAfterMinutes)) continue;
      total += 1;
      const entered = bay.visitEnteredAt ? Date.parse(bay.visitEnteredAt) : Number.NaN;
      floors.get(bay.floor)!.spaces.push({
        bayId: bay.bayId,
        spaceNumber: bay.spaceNumber,
        designation: bay.designation,
        reserved: bay.reserved,
        plateDisplay: status === "occupied" ? bay.plate ?? undefined : undefined,
        feedState: feedStateOf(bay, staleAfterMinutes),
        thumbnailAgeMinutes: bay.thumbnailAgeMinutes,
        parkedMinutes: status === "occupied" && Number.isFinite(entered)
          ? Math.max(0, Math.round((now - entered) / 60_000))
          : undefined,
        health: bay.health,
      });
    }

    const byNumber = (left: { spaceNumber: string }, right: { spaceNumber: string }) =>
      left.spaceNumber.localeCompare(right.spaceNumber, undefined, { numeric: true });
    const grouped = [...floors.values()].sort((left, right) => left.floor - right.floor);
    for (const floor of grouped) floor.spaces.sort(byNumber);

    return {
      status,
      garage: this.options.garage,
      generatedAt: snapshot.generatedAt,
      staleAfterMinutes,
      total,
      floors: grouped,
    };
  }

  public async getCameraImage(bayId: string): Promise<Response> {
    return await this.fetchWithRetry(
      () => this.fetchFn(`${this.options.apiBaseUrl}/images/${encodeURIComponent(bayId)}`, {
        headers: { Accept: "image/jpeg,image/*" },
        signal: AbortSignal.timeout(20_000),
      }),
      2,
    );
  }

  private async getSnapshot(staleAfterMinutes: number): Promise<Snapshot> {
    const [liveBays, annotations] = await Promise.all([
      this.getLiveBays(),
      this.getHealthAnnotations(),
    ]);
    const liveById = new Map(liveBays.map((bay) => [String(bay.id), bay]));
    const now = Date.now();
    const bays = this.options.mapRows
      .filter((row) => row.garage === this.options.garage)
      .map((row): MergedGarageBay => {
        const live = liveById.get(row.bayId);
        return {
          ...row,
          foundInLiveApi: Boolean(live),
          occupied: live?.is_occupied === true,
          outOfService: live?.is_out_of_service === true,
          reserved: live?.is_reserved === true,
          plate: optionalString(live?.visit?.plate?.text),
          plateConfidence: optionalNumber(live?.visit?.plate?.confidence),
          visitEnteredAt: optionalString(live?.visit?.entry_timestamp),
          thumbnailTimestamp: optionalString(live?.sensor?.thumbnail_timestamp),
          thumbnailAgeMinutes: ageMinutes(live?.sensor?.thumbnail_timestamp, now),
          lastContact: optionalString(live?.sensor?.last_contact),
          lastContactAgeMinutes: ageMinutes(live?.sensor?.last_contact, now),
          health: annotations.get(row.bayId),
        };
      });

    return {
      generatedAt: new Date(now).toISOString(),
      bays,
      metrics: computeMetrics(bays, staleAfterMinutes),
    };
  }

  private async getLiveBays(): Promise<ParkAssistBay[]> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.liveBays;
    const response = await this.fetchWithRetry(() => this.fetchFn(`${this.options.apiBaseUrl}/bays`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    }), 3);
    if (!response.ok) {
      throw new Error(`ParkAssist API request failed (${response.status} ${response.statusText}).`);
    }
    const payload = await response.json() as unknown;
    const liveBays = normalizeBayCollection(payload);
    this.cache = { expiresAt: Date.now() + this.options.cacheSeconds * 1000, liveBays };
    return liveBays;
  }

  private async getHealthAnnotations() {
    if (!this.options.healthService) return new Map();
    try {
      return await this.options.healthService.getAnnotations();
    } catch (error) {
      console.warn("SensorHealth overlay unavailable; continuing with ParkAssist telemetry.", error);
      return new Map();
    }
  }

  private async fetchWithRetry(request: () => Promise<Response>, attempts: number): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await request();
        if (response.ok || response.status < 500 || attempt === attempts) return response;
        await response.body?.cancel();
        lastError = new Error(`Upstream request returned ${response.status}.`);
      } catch (error) {
        lastError = error;
        if (attempt === attempts) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
    throw lastError instanceof Error ? lastError : new Error("Upstream request failed.");
  }

  private toResult(
    bay: MergedGarageBay,
    includeImage = false,
    staleAfterMinutes = this.options.staleAfterMinutes,
    includePlate = false,
  ): GarageBayResult {
    return {
      bayId: bay.bayId,
      spaceNumber: bay.spaceNumber,
      floor: bay.floor,
      designation: bay.designation,
      occupied: bay.occupied,
      outOfService: bay.outOfService,
      reserved: bay.reserved,
      plateDisplay: includePlate ? bay.plate ?? undefined : undefined,
      plateConfidence: includePlate ? bay.plateConfidence : undefined,
      visitEnteredAt: bay.visitEnteredAt,
      thumbnailTimestamp: bay.thumbnailTimestamp,
      thumbnailAgeMinutes: bay.thumbnailAgeMinutes,
      lastContact: bay.lastContact,
      lastContactAgeMinutes: bay.lastContactAgeMinutes,
      feedState: feedStateOf(bay, staleAfterMinutes),
      imageUrl: includeImage ? this.options.signer.sign(bay.bayId) : undefined,
      health: bay.health,
    };
  }

  private baseResult(
    view: GarageToolResult["view"],
    title: string,
    summary: string,
    snapshot: Snapshot,
    bays: GarageBayResult[],
    totalMatches: number,
    extras: BaseResultExtras = {},
  ): Omit<GarageToolResult, "adaptiveCard"> {
    return {
      view,
      title,
      summary,
      garage: this.options.garage,
      generatedAt: snapshot.generatedAt,
      staleAfterMinutes: this.options.staleAfterMinutes,
      metrics: snapshot.metrics,
      bays,
      totalMatches,
      hasMore: extras.hasMore ?? false,
      query: extras.query,
      floorBreakdown: extras.floorBreakdown,
      configuredInScope: extras.configuredInScope,
      metricsInScope: extras.metricsInScope,
      filters: extras.filters,
    };
  }

  private withCard(result: Omit<GarageToolResult, "adaptiveCard">): GarageToolResult {
    return { ...result, adaptiveCard: buildAdaptiveCard(result) };
  }

  private page<T>(items: T[], limit = 12, page = 1): { items: T[]; hasMore: boolean } {
    const safeLimit = Math.min(Math.max(limit, 1), 24);
    const safePage = Math.max(page, 1);
    const start = (safePage - 1) * safeLimit;
    return {
      items: items.slice(start, start + safeLimit),
      hasMore: start + safeLimit < items.length,
    };
  }
}

/**
 * Floors a request is scoped to, or `undefined` for the whole garage. `floors`
 * wins over the single-floor `floor`, which survives only for MCP callers
 * already in the field.
 */
function resolveFloors(options: Pick<ListOptions, "floor" | "floors">): number[] | undefined {
  if (options.floors && options.floors.length > 0) {
    return [...new Set(options.floors)].sort((left, right) => left - right);
  }
  return options.floor == null ? undefined : [options.floor];
}

/**
 * Human phrasing for a floor scope, collapsing a contiguous run into a range
 * so "floors 7-9" reads back the way it was asked.
 */
function describeFloors(floors: number[] | undefined): string {
  if (!floors || floors.length === 0) return "across all floors";
  if (floors.length === 1) return `on floor ${floors[0]}`;
  const contiguous = floors.every((floor, index) => index === 0 || floor === floors[index - 1]! + 1);
  if (contiguous) return `on floors ${floors[0]}–${floors[floors.length - 1]}`;
  return `on floors ${floors.slice(0, -1).join(", ")} and ${floors[floors.length - 1]}`;
}

/** The bays a request is scoped to; every bay when no floor filter was given. */
function baysInScope(bays: MergedGarageBay[], floors: number[] | undefined): MergedGarageBay[] {
  return floors ? bays.filter((bay) => floors.includes(bay.floor)) : bays;
}

/** Bays in the bay map across the requested floors — the denominator for a match count. */
function countInScope(bays: MergedGarageBay[], floors: number[] | undefined): number {
  return baysInScope(bays, floors).length;
}

/**
 * Counters over a set of bays. Extracted from the snapshot so the same
 * definitions can be applied to a floor subset: a card that reports a
 * floor-scoped total next to garage-wide counters shows two correct numbers
 * answering different questions, which reads as a contradiction.
 */
function computeMetrics(bays: MergedGarageBay[], staleAfterMinutes: number): GarageMetrics {
  const occupied = bays.filter((bay) => matchesStatus(bay, "occupied", staleAfterMinutes)).length;
  return {
    configured: bays.length,
    live: bays.filter((bay) => bay.foundInLiveApi).length,
    occupied,
    available: bays.filter((bay) => matchesStatus(bay, "available", staleAfterMinutes)).length,
    reserved: bays.filter((bay) => bay.reserved).length,
    outOfService: bays.filter((bay) => matchesStatus(bay, "out-of-service", staleAfterMinutes)).length,
    staleFeeds: bays.filter((bay) => isStaleFeed(bay, staleAfterMinutes)).length,
    missingFeeds: bays.filter((bay) => isMissingFeed(bay)).length,
    offlineSensors: bays.filter((bay) => bay.lastContact && (bay.lastContactAgeMinutes ?? 0) > staleAfterMinutes).length,
    occupancyPercent: bays.length === 0 ? 0 : Math.round((occupied / bays.length) * 100),
  };
}

function isStaleFeed(bay: MergedGarageBay, staleAfterMinutes: number): boolean {
  return Boolean(bay.thumbnailTimestamp) && (bay.thumbnailAgeMinutes ?? 0) > staleAfterMinutes;
}

function isMissingFeed(bay: MergedGarageBay): boolean {
  return bay.foundInLiveApi && !bay.thumbnailTimestamp;
}

function feedStateOf(bay: MergedGarageBay, staleAfterMinutes: number): GarageBayResult["feedState"] {
  if (bay.thumbnailTimestamp == null) return "missing";
  return (bay.thumbnailAgeMinutes ?? 0) > staleAfterMinutes ? "stale" : "fresh";
}

/**
 * Whether a bay is counted by a dashboard tile. The single definition behind
 * both the tile counters in `computeMetrics` and the drill-down list, so the
 * two can never disagree.
 */
function matchesStatus(bay: MergedGarageBay, status: GarageStatus, staleAfterMinutes: number): boolean {
  switch (status) {
    case "available":
      return bay.foundInLiveApi && !bay.occupied && !bay.outOfService && !bay.reserved;
    case "occupied":
      return bay.occupied;
    case "stale-or-missing":
      return isStaleFeed(bay, staleAfterMinutes) || isMissingFeed(bay);
    case "out-of-service":
      return bay.outOfService;
  }
}

/**
 * Splits a match set by floor. Requested floors that matched nothing are kept
 * with a count of zero: "floor 8: 0" answers the question, whereas a missing
 * row leaves the caller unable to tell "none" from "not checked".
 */
function floorBreakdown(
  matches: MergedGarageBay[],
  allBays: MergedGarageBay[],
  floors: number[] | undefined,
): GarageFloorCount[] {
  const counted = new Map<number, number>();
  for (const floor of floors ?? []) counted.set(floor, 0);
  for (const bay of matches) counted.set(bay.floor, (counted.get(bay.floor) ?? 0) + 1);

  const configured = new Map<number, number>();
  for (const bay of allBays) configured.set(bay.floor, (configured.get(bay.floor) ?? 0) + 1);

  return [...counted.entries()]
    .sort(([left], [right]) => left - right)
    .map(([floor, count]) => ({ floor, count, configured: configured.get(floor) ?? 0 }));
}

function normalizeBayCollection(payload: unknown): ParkAssistBay[] {
  if (Array.isArray(payload)) return payload as ParkAssistBay[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["bays", "results", "data"]) {
    if (Array.isArray(record[key])) return record[key] as ParkAssistBay[];
  }
  return [];
}

function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function optionalString(value: unknown): string | undefined {
  if (value == null || String(value).trim() === "") return undefined;
  return String(value).trim();
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function ageMinutes(value: unknown, now: number): number | undefined {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.max(0, Math.round(((now - timestamp) / 60_000) * 10) / 10);
}
