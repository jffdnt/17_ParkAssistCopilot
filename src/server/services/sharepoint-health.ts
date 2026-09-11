import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";
import type { HealthAnnotation } from "../../shared/contracts.js";

interface GraphListItem {
  fields?: Record<string, unknown>;
}

interface GraphCollection<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

export class SharePointHealthService {
  private readonly credential: TokenCredential;
  private readonly siteUrl?: string;
  private readonly listName: string;
  private cache?: { expiresAt: number; annotations: Map<string, HealthAnnotation> };

  public constructor(options: {
    siteUrl?: string;
    listName: string;
    credential?: TokenCredential;
  }) {
    this.siteUrl = options.siteUrl;
    this.listName = options.listName;
    this.credential = options.credential ?? new DefaultAzureCredential();
  }

  public async getAnnotations(): Promise<Map<string, HealthAnnotation>> {
    if (!this.siteUrl) return new Map();
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.annotations;

    const site = new URL(this.siteUrl);
    const token = await this.credential.getToken("https://graph.microsoft.com/.default");
    if (!token) throw new Error("Microsoft Graph access token was not available.");

    const headers = { Authorization: `Bearer ${token.token}`, Accept: "application/json" };
    const siteResource = await this.graphGet<{ id: string }>(
      `https://graph.microsoft.com/v1.0/sites/${site.hostname}:${site.pathname}`,
      headers,
    );
    const lists = await this.graphGet<GraphCollection<{ id: string; displayName: string }>>(
      `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteResource.id)}/lists?$select=id,displayName`,
      headers,
    );
    const list = lists.value.find((candidate) => candidate.displayName === this.listName);
    if (!list) throw new Error(`SharePoint list '${this.listName}' was not found.`);

    let nextUrl: string | undefined =
      `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteResource.id)}/lists/${encodeURIComponent(list.id)}/items?$expand=fields&$top=999`;
    const items: GraphListItem[] = [];
    while (nextUrl) {
      const requestUrl: string = nextUrl;
      const page: GraphCollection<GraphListItem> = await this.graphGet<GraphCollection<GraphListItem>>(requestUrl, headers);
      items.push(...page.value);
      nextUrl = page["@odata.nextLink"];
    }

    const annotations = new Map<string, HealthAnnotation>();
    for (const item of items) {
      const fields = item.fields ?? {};
      const sensorId = this.asOptionalString(fields.SensorId);
      if (!sensorId) continue;
      annotations.set(sensorId, {
        issueType: this.asOptionalString(fields.IssueType),
        isActive: fields.IsActive === true || String(fields.IsActive).toLowerCase() === "true",
        lastChecked: this.asOptionalString(fields.LastChecked),
        suggestedStatus: this.asOptionalString(fields.SuggestedStatus),
        confidence: this.asOptionalNumber(fields.Confidence),
      });
    }

    this.cache = { expiresAt: Date.now() + 60_000, annotations };
    return annotations;
  }

  private async graphGet<T>(url: string, headers: Record<string, string>): Promise<T> {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      throw new Error(`Microsoft Graph request failed (${response.status} ${response.statusText}).`);
    }
    return await response.json() as T;
  }

  private asOptionalString(value: unknown): string | undefined {
    if (value == null || String(value).trim() === "") return undefined;
    return String(value).trim();
  }

  private asOptionalNumber(value: unknown): number | undefined {
    const parsed = Number.parseFloat(String(value ?? ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
