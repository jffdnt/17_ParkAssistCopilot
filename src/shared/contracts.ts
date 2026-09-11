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
  filters?: {
    floor?: number;
    designation?: string;
    includeOutOfService?: boolean;
  };
  adaptiveCard?: Record<string, unknown>;
}
