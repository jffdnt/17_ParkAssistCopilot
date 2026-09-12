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

export interface IStaleBay {
  bayId: string;
  spaceNumber?: string;
  floor?: number;
  designation?: string;
  thumbnailAgeMinutes?: number;
  feedState: FeedState;
  imageUrl?: string;
}

export interface IStaleFeedResult {
  /** Human-readable summary line produced by the server. */
  summary: string;
  /** Point-in-time stamp the server generated the snapshot at. */
  generatedAt: string;
  /** Minutes after which a snapshot counts as stale. */
  staleAfterMinutes: number;
  /** Total matches, which may exceed the returned page. */
  totalMatches: number;
  bays: IStaleBay[];
}

export interface IStaleFeedQuery {
  floor?: number;
  thresholdMinutes?: number;
  limit?: number;
}

export class StaleFeedService {
  private readonly _aadHttpClientFactory: AadHttpClientFactory;

  public constructor(aadHttpClientFactory: AadHttpClientFactory) {
    this._aadHttpClientFactory = aadHttpClientFactory;
  }

  public async getStaleFeeds(query: IStaleFeedQuery = {}): Promise<IStaleFeedResult> {
    const parameters = new URLSearchParams();
    if (query.floor !== undefined) parameters.set('floor', String(query.floor));
    if (query.thresholdMinutes !== undefined) {
      parameters.set('thresholdMinutes', String(query.thresholdMinutes));
    }
    parameters.set('limit', String(query.limit ?? 12));

    const client: AadHttpClient = await this._aadHttpClientFactory.getClient(PARKASSIST_RESOURCE_URI);
    const response: HttpClientResponse = await client.get(
      `${PARKASSIST_BASE_URL}/api/stale-feeds?${parameters.toString()}`,
      AadHttpClient.configurations.v1
    );

    if (!response.ok) {
      throw new Error(`ParkAssist returned ${response.status} for the stale-feed lookup.`);
    }

    const payload: {
      summary?: string;
      generatedAt?: string;
      staleAfterMinutes?: number;
      totalMatches?: number;
      bays?: IStaleBay[];
    } = await response.json();

    return {
      summary: payload.summary ?? '',
      generatedAt: payload.generatedAt ?? new Date().toISOString(),
      staleAfterMinutes: payload.staleAfterMinutes ?? 15,
      totalMatches: payload.totalMatches ?? 0,
      bays: payload.bays ?? []
    };
  }
}
