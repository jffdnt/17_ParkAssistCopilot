import type {
  GarageBayResult,
  GarageMetrics,
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

interface ListOptions {
  floor?: number;
  designation?: string;
  limit?: number;
  page?: number;
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
    let matches = snapshot.bays.filter((bay) => bay.foundInLiveApi && !bay.occupied && !bay.outOfService && !bay.reserved);
    if (options.floor != null) matches = matches.filter((bay) => bay.floor === options.floor);
    if (options.designation) {
      const designation = options.designation.toLowerCase();
      matches = matches.filter((bay) => bay.designation.toLowerCase().includes(designation));
    }
    matches.sort((left, right) => left.floor - right.floor || left.spaceNumber.localeCompare(right.spaceNumber, undefined, { numeric: true }));

    const paged = this.page(matches, options.limit, options.page);
    const floorText = options.floor == null ? "across all floors" : `on floor ${options.floor}`;
    const result = this.baseResult(
      "availability",
      `Available parking ${floorText}`,
      `${matches.length} ready-to-use spaces found ${floorText}.`,
      snapshot,
      paged.items.map((bay) => this.toResult(bay, false)),
      matches.length,
      {
        floor: options.floor,
        designation: options.designation,
      },
      paged.hasMore,
    );
    return this.withCard(result);
  }

  public async searchLicensePlate(query: string, options: Pick<ListOptions, "limit" | "page">): Promise<GarageToolResult> {
    const normalizedQuery = normalizePlate(query);
    if (normalizedQuery.length < 3) {
      throw new Error("Enter at least three letters or numbers from the license plate.");
    }

    const snapshot = await this.getSnapshot(this.options.staleAfterMinutes);
    const matches = snapshot.bays
      .filter((bay) => bay.plate && normalizePlate(bay.plate).includes(normalizedQuery))
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
      paged.items.map((bay) => this.toResult(bay, normalizePlate(bay.plate ?? "") === normalizedQuery)),
      matches.length,
      undefined,
      paged.hasMore,
      query.trim().toUpperCase(),
    );
    return this.withCard(result);
  }

  public async getStaleCameraFeeds(options: ListOptions & {
    thresholdMinutes?: number;
    includeOutOfService?: boolean;
  }): Promise<GarageToolResult> {
    const thresholdMinutes = options.thresholdMinutes ?? this.options.staleAfterMinutes;
    const snapshot = await this.getSnapshot(thresholdMinutes);
    let matches = snapshot.bays.filter((bay) =>
      bay.foundInLiveApi && (bay.thumbnailTimestamp == null || (bay.thumbnailAgeMinutes ?? 0) > thresholdMinutes),
    );
    if (options.floor != null) matches = matches.filter((bay) => bay.floor === options.floor);
    if (options.includeOutOfService === false) matches = matches.filter((bay) => !bay.outOfService);
    matches.sort((left, right) => {
      if (left.thumbnailTimestamp == null && right.thumbnailTimestamp != null) return 1;
      if (left.thumbnailTimestamp != null && right.thumbnailTimestamp == null) return -1;
      return (right.thumbnailAgeMinutes ?? -1) - (left.thumbnailAgeMinutes ?? -1);
    });

    const paged = this.page(matches, options.limit, options.page);
    const floorText = options.floor == null ? "" : ` on floor ${options.floor}`;
    const result = this.baseResult(
      "stale-feeds",
      `Stale camera feeds${floorText}`,
      `${matches.length} camera feed${matches.length === 1 ? " is" : "s are"} older than ${thresholdMinutes} minutes or missing telemetry.`,
      snapshot,
      paged.items.map((bay) => this.toResult(bay, false, true, thresholdMinutes)),
      matches.length,
      {
        floor: options.floor,
        includeOutOfService: options.includeOutOfService ?? true,
      },
      paged.hasMore,
    );
    result.staleAfterMinutes = thresholdMinutes;
    return this.withCard(result);
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

    const available = bays.filter((bay) => bay.foundInLiveApi && !bay.occupied && !bay.outOfService && !bay.reserved).length;
    const occupied = bays.filter((bay) => bay.occupied).length;
    const metrics: GarageMetrics = {
      configured: bays.length,
      live: bays.filter((bay) => bay.foundInLiveApi).length,
      occupied,
      available,
      reserved: bays.filter((bay) => bay.reserved).length,
      outOfService: bays.filter((bay) => bay.outOfService).length,
      staleFeeds: bays.filter((bay) => bay.thumbnailTimestamp && (bay.thumbnailAgeMinutes ?? 0) > staleAfterMinutes).length,
      missingFeeds: bays.filter((bay) => bay.foundInLiveApi && !bay.thumbnailTimestamp).length,
      offlineSensors: bays.filter((bay) => bay.lastContact && (bay.lastContactAgeMinutes ?? 0) > staleAfterMinutes).length,
      occupancyPercent: bays.length === 0 ? 0 : Math.round((occupied / bays.length) * 100),
    };
    return { generatedAt: new Date(now).toISOString(), bays, metrics };
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

  private toResult(bay: MergedGarageBay, revealExactPlate: boolean, includeImage = false, staleAfterMinutes = this.options.staleAfterMinutes): GarageBayResult {
    return {
      bayId: bay.bayId,
      spaceNumber: bay.spaceNumber,
      floor: bay.floor,
      designation: bay.designation,
      occupied: bay.occupied,
      outOfService: bay.outOfService,
      reserved: bay.reserved,
      plateDisplay: bay.plate ? (revealExactPlate ? bay.plate : maskPlate(bay.plate)) : undefined,
      plateConfidence: bay.plateConfidence,
      visitEnteredAt: bay.visitEnteredAt,
      thumbnailTimestamp: bay.thumbnailTimestamp,
      thumbnailAgeMinutes: bay.thumbnailAgeMinutes,
      lastContact: bay.lastContact,
      lastContactAgeMinutes: bay.lastContactAgeMinutes,
      feedState: bay.thumbnailTimestamp == null
        ? "missing"
        : (bay.thumbnailAgeMinutes ?? 0) > staleAfterMinutes ? "stale" : "fresh",
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
    filters?: GarageToolResult["filters"],
    hasMore = false,
    query?: string,
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
      hasMore,
      query,
      filters,
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

function maskPlate(value: string): string {
  const normalized = normalizePlate(value);
  if (normalized.length <= 2) return "••";
  return `${normalized.slice(0, 1)}${"•".repeat(Math.max(2, normalized.length - 3))}${normalized.slice(-2)}`;
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
