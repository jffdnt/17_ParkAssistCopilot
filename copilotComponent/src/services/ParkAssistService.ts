import { AadHttpClient, type AadHttpClientFactory, type HttpClientResponse } from '@microsoft/sp-http';

/**
 * Entra application that fronts the ParkAssist MCP service. SPFx exchanges the
 * signed-in user's token for one scoped to this resource, which the server
 * validates in `src/server/auth.ts` (audience + `access_as_user` scope).
 *
 * The matching grant is declared as a `webApiPermissionRequests` entry in
 * config/package-solution.json and must be approved once in
 * SharePoint Admin Center → Advanced → API access.
 */
const PARKASSIST_RESOURCE_URI = __PARKASSIST_RESOURCE_URI__;
const PARKASSIST_BASE_URL = __PARKASSIST_BASE_URL__;

export type FeedState = 'fresh' | 'stale' | 'missing';

/** A single bay as returned by any of the ParkAssist endpoints. */
export interface IGarageBay {
  bayId: string;
  spaceNumber?: string;
  floor?: number;
  designation?: string;
  occupied?: boolean;
  outOfService?: boolean;
  reserved?: boolean;
  plateDisplay?: string;
  thumbnailAgeMinutes?: number;
  feedState: FeedState;
  imageUrl?: string;
}

/**
 * Garage-wide counters the server computes for every snapshot. Mirrors
 * `GarageMetrics` in `src/shared/contracts.ts`; `occupancyPercent` is already
 * a percentage, not a 0–1 rate.
 */
export interface IGarageMetrics {
  configured?: number;
  live?: number;
  occupied?: number;
  available?: number;
  reserved?: number;
  outOfService?: number;
  staleFeeds?: number;
  missingFeeds?: number;
  offlineSensors?: number;
  occupancyPercent?: number;
}

/**
 * One floor's share of a filtered result. The server computes these over the
 * whole match set before paging, so they are the only trustworthy per-floor
 * counts available here — `bays` is a single page and counting it would
 * understate every floor.
 */
export interface IFloorCount {
  floor: number;
  /** Bays on this floor that matched. */
  count: number;
  /** Bays on this floor in the bay map, as the denominator for `count`. */
  configured: number;
}

/**
 * Shared response envelope. Every ParkAssist endpoint returns the same shape,
 * so one interface covers overview, availability, plate search, and stale feeds.
 */
export interface IGarageResult {
  title: string;
  summary: string;
  garage: string;
  generatedAt: string;
  staleAfterMinutes: number;
  metrics: IGarageMetrics;
  bays: IGarageBay[];
  totalMatches: number;
  hasMore: boolean;
  query?: string;
  /** `totalMatches` split by floor, ascending. Absent on the overview. */
  floorBreakdown?: IFloorCount[];
  /** Bays in the bay map across the requested floors — the denominator for `totalMatches`. */
  configuredInScope?: number;
}

/**
 * The dashboard tiles a user can drill into. Mirrors `GarageStatus` in
 * `src/shared/contracts.ts`.
 */
export type GarageStatus = 'available' | 'occupied' | 'stale-or-missing' | 'out-of-service';

export interface IHealthAnnotation {
  issueType?: string;
  isActive: boolean;
  lastChecked?: string;
  suggestedStatus?: string;
}

/** One space in a drill-down. Plates are present only in the occupied view. */
export interface IStatusSpace {
  bayId: string;
  spaceNumber: string;
  designation: string;
  reserved: boolean;
  plateDisplay?: string;
  feedState: FeedState;
  thumbnailAgeMinutes?: number;
  parkedMinutes?: number;
  imageUrl?: string;
  health?: IHealthAnnotation;
}

export interface IStatusFloor {
  floor: number;
  configured: number;
  spaces: IStatusSpace[];
}

/**
 * Every bay one dashboard tile counts, grouped by floor (all floors present,
 * including empty ones). Mirrors `GarageStatusDetail` in `src/shared/contracts.ts`.
 */
export interface IStatusDetail {
  status: GarageStatus;
  garage: string;
  generatedAt: string;
  staleAfterMinutes: number;
  total: number;
  floors: IStatusFloor[];
}

export class ParkAssistService {
  private readonly _aadHttpClientFactory: AadHttpClientFactory;

  public constructor(aadHttpClientFactory: AadHttpClientFactory) {
    this._aadHttpClientFactory = aadHttpClientFactory;
  }

  public async getOverview(): Promise<IGarageResult> {
    return this._get('/api/overview');
  }

  public async getStaleFeeds(
    query: { floors?: number[]; thresholdMinutes?: number; limit?: number } = {}
  ): Promise<IGarageResult> {
    return this._get('/api/stale-feeds', {
      floors: floorList(query.floors),
      thresholdMinutes: query.thresholdMinutes,
      limit: query.limit ?? 12
    });
  }

  public async getAvailableSpaces(
    query: { floors?: number[]; designation?: string; limit?: number } = {}
  ): Promise<IGarageResult> {
    return this._get('/api/available-spaces', {
      floors: floorList(query.floors),
      designation: query.designation,
      limit: query.limit ?? 12
    });
  }

  public async searchPlate(plate: string, limit: number = 12): Promise<IGarageResult> {
    return this._get('/api/plate-search', { query: plate, limit });
  }

  public async getStatusDetail(status: GarageStatus): Promise<IStatusDetail> {
    const payload = await this._fetchJson<Partial<IStatusDetail>>('/api/status-detail', { status });
    return {
      status,
      garage: payload.garage ?? '5 Bell',
      generatedAt: payload.generatedAt ?? new Date().toISOString(),
      staleAfterMinutes: payload.staleAfterMinutes ?? 15,
      total: payload.total ?? 0,
      floors: payload.floors ?? []
    };
  }

  /** Obtain a fresh, short-lived image URL when the user opens a space card. */
  public async getCameraPreviewUrl(bayId: string): Promise<string> {
    const payload = await this._fetchJson<{ imageUrl?: unknown }>('/api/camera-preview-url', { bayId });
    if (typeof payload.imageUrl !== 'string' || payload.imageUrl.length === 0) {
      throw new Error('ParkAssist did not return a camera preview URL.');
    }
    return payload.imageUrl;
  }

  private async _get(
    path: string,
    parameters: Record<string, string | number | undefined> = {}
  ): Promise<IGarageResult> {
    const payload = await this._fetchJson<Partial<IGarageResult>>(path, parameters);
    return {
      title: payload.title ?? '',
      summary: payload.summary ?? '',
      garage: payload.garage ?? '5 Bell',
      generatedAt: payload.generatedAt ?? new Date().toISOString(),
      staleAfterMinutes: payload.staleAfterMinutes ?? 15,
      metrics: payload.metrics ?? {},
      bays: payload.bays ?? [],
      totalMatches: payload.totalMatches ?? 0,
      hasMore: payload.hasMore ?? false,
      query: payload.query,
      floorBreakdown: payload.floorBreakdown,
      configuredInScope: payload.configuredInScope
    };
  }

  private async _fetchJson<T>(
    path: string,
    parameters: Record<string, string | number | undefined>
  ): Promise<T> {
    const search = new URLSearchParams();
    Object.keys(parameters).forEach((key) => {
      const value = parameters[key];
      if (value !== undefined && value !== '') {
        search.set(key, String(value));
      }
    });

    const suffix = search.toString();
    const client: AadHttpClient = await this._aadHttpClientFactory.getClient(PARKASSIST_RESOURCE_URI);
    const response: HttpClientResponse = await client.get(
      `${PARKASSIST_BASE_URL}${path}${suffix ? `?${suffix}` : ''}`,
      AadHttpClient.configurations.v1
    );

    if (!response.ok) {
      throw new Error(`ParkAssist returned ${response.status} for ${path}.`);
    }

    return (await response.json()) as T;
  }
}

/**
 * Flattens a floor set for the query string. Copilot hands the tool an array;
 * the REST endpoint parses `floors=7,8,9` back into one.
 */
function floorList(floors: number[] | undefined): string | undefined {
  return floors && floors.length > 0 ? floors.join(',') : undefined;
}
