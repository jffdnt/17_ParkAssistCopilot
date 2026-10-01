export type GarageView = "overview" | "availability" | "plate-search" | "stale-feeds";

export type FeedState = "fresh" | "stale" | "missing";

export interface HealthAnnotation {
  issueType?: string;
  isActive: boolean;
  lastChecked?: string;
  suggestedStatus?: string;
  confidence?: number;
}

export interface GarageBayResult {
  bayId: string;
  spaceNumber: string;
  floor: number;
  designation: string;
  occupied: boolean;
  outOfService: boolean;
  reserved: boolean;
  plateDisplay?: string;
  plateConfidence?: number;
  visitEnteredAt?: string;
  thumbnailTimestamp?: string;
  thumbnailAgeMinutes?: number;
  lastContact?: string;
  lastContactAgeMinutes?: number;
  feedState: FeedState;
  imageUrl?: string;
  health?: HealthAnnotation;
}

/**
 * Per-floor tally for a filtered result, computed over the *whole* match set
 * before paging. Clients only receive one page of bays, so they cannot derive
 * these counts themselves — which is exactly why a caller asking "how many on
 * floors 7-9?" needs the server to say so.
 */
export interface GarageFloorCount {
  floor: number;
  /** Bays on this floor that matched the filter. */
  count: number;
  /** Bays on this floor in the bay map, as the denominator for `count`. */
  configured: number;
}

export interface GarageMetrics {
  configured: number;
  live: number;
  occupied: number;
  available: number;
  reserved: number;
  outOfService: number;
  staleFeeds: number;
  missingFeeds: number;
  offlineSensors: number;
  occupancyPercent: number;
}

export interface GarageToolResult {
  view: GarageView;
  title: string;
  summary: string;
  garage: string;
  generatedAt: string;
  staleAfterMinutes: number;
  metrics: GarageMetrics;
  bays: GarageBayResult[];
  totalMatches: number;
  hasMore: boolean;
  query?: string;
  /**
   * `totalMatches` split by floor, ascending. Present on the filtered list
   * views (availability, stale feeds); absent on the overview.
   */
  floorBreakdown?: GarageFloorCount[];
  /** Bays in the bay map across the requested floors, the denominator for `totalMatches`. */
  configuredInScope?: number;
  /**
   * The same counters as `metrics`, restricted to the requested floors. Present
   * on the filtered list views. Read this rather than `metrics` when a floor
   * filter was applied: `metrics` stays garage-wide, and showing a garage-wide
   * counter beside a floor-scoped total reads as a contradiction.
   */
  metricsInScope?: GarageMetrics;
  filters?: {
    floor?: number;
    floors?: number[];
    designation?: string;
    includeOutOfService?: boolean;
  };
  adaptiveCard?: Record<string, unknown>;
}

/**
 * The four dashboard counters a user can drill into. Each one names exactly the
 * bays its metric tile counts, so a drill-down always adds up to the tile.
 */
export type GarageStatus = "available" | "occupied" | "stale-or-missing" | "out-of-service";

export const GARAGE_STATUSES: readonly GarageStatus[] = [
  "available",
  "occupied",
  "stale-or-missing",
  "out-of-service",
];

/** One space in a status drill-down. Plates are deliberately never included. */
export interface GarageStatusSpace {
  bayId: string;
  spaceNumber: string;
  designation: string;
  reserved: boolean;
  feedState: FeedState;
  thumbnailAgeMinutes?: number;
  /** Minutes since the current visit started; occupied spaces only. */
  parkedMinutes?: number;
  /** Signed, short-lived camera preview, loaded only when a space is opened. */
  imageUrl?: string;
  health?: HealthAnnotation;
}

export interface GarageStatusFloor {
  floor: number;
  /** Bays on this floor in the bay map. */
  configured: number;
  spaces: GarageStatusSpace[];
}

/**
 * Every bay in one status, grouped by floor. Unpaged on purpose: the drill-down
 * is a map of the whole garage, and a single page would misstate every floor.
 * Floors with no matching bays are included with an empty `spaces` list.
 */
export interface GarageStatusDetail {
  status: GarageStatus;
  garage: string;
  generatedAt: string;
  staleAfterMinutes: number;
  total: number;
  floors: GarageStatusFloor[];
}
