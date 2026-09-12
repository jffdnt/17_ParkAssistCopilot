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
const PARKASSIST_RESOURCE_URI = 'api://750929bd-e2b6-4019-838c-365c36cbcb22';
const PARKASSIST_BASE_URL = 'https://parkassist-mcp.happyground-f091a09b.eastus.azurecontainerapps.io';

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
}

export class ParkAssistService {
  private readonly _aadHttpClientFactory: AadHttpClientFactory;

  public constructor(aadHttpClientFactory: AadHttpClientFactory) {
    this._aadHttpClientFactory = aadHttpClientFactory;
  }

  public async getOverview(): Promise<IGarageResult> {
    return this._get('/api/overview');
  }

  public async getStaleFeeds(query: { floor?: number; thresholdMinutes?: number; limit?: number } = {}): Promise<IGarageResult> {
    return this._get('/api/stale-feeds', {
      floor: query.floor,
      thresholdMinutes: query.thresholdMinutes,
      limit: query.limit ?? 12
    });
  }

  public async getAvailableSpaces(query: { floor?: number; designation?: string; limit?: number } = {}): Promise<IGarageResult> {
    return this._get('/api/available-spaces', {
      floor: query.floor,
      designation: query.designation,
      limit: query.limit ?? 12
    });
  }

  public async searchPlate(plate: string, limit: number = 12): Promise<IGarageResult> {
    return this._get('/api/plate-search', { query: plate, limit });
  }

  private async _get(
    path: string,
    parameters: Record<string, string | number | undefined> = {}
  ): Promise<IGarageResult> {
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

    const payload: Partial<IGarageResult> = await response.json();
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
      query: payload.query
    };
  }
}
