import type { GarageToolResult } from "../shared/contracts";

function mockCamera(label: string, accent: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#111827"/><stop offset="1" stop-color="#374151"/></linearGradient></defs>
      <rect width="640" height="360" fill="url(#g)"/>
      <path d="M0 285 L640 220 L640 360 L0 360Z" fill="#4b5563"/>
      <path d="M80 310 L245 270 M360 265 L525 230" stroke="#f3f4f6" stroke-width="7" stroke-linecap="round" opacity=".75"/>
      <rect x="250" y="170" width="170" height="75" rx="18" fill="${accent}" opacity=".86"/>
      <circle cx="282" cy="249" r="21" fill="#111"/><circle cx="389" cy="249" r="21" fill="#111"/>
      <text x="24" y="44" fill="#fff" font-family="Segoe UI, sans-serif" font-size="20" font-weight="700">${label}</text>
      <text x="24" y="70" fill="#d1d5db" font-family="Segoe UI, sans-serif" font-size="14">LAST KNOWN CAMERA FRAME</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const stalePreviewFixture: GarageToolResult = {
  view: "stale-feeds",
  title: "Stale camera feeds",
  summary: "54 camera feeds are older than 15 minutes or missing telemetry.",
  garage: "5 Bell",
  generatedAt: new Date().toISOString(),
  staleAfterMinutes: 15,
  metrics: {
    configured: 946,
    live: 944,
    occupied: 529,
    available: 366,
    reserved: 3,
    outOfService: 52,
    staleFeeds: 45,
    missingFeeds: 9,
    offlineSensors: 47,
    occupancyPercent: 56,
  },
  bays: [
    {
      bayId: "5070204",
      spaceNumber: "744",
      floor: 7,
      designation: "General",
      occupied: false,
      outOfService: true,
      reserved: false,
      thumbnailTimestamp: new Date(Date.now() - 6 * 24 * 60 * 60_000).toISOString(),
      thumbnailAgeMinutes: 8_611,
      lastContactAgeMinutes: 8_602,
      feedState: "stale",
      imageUrl: mockCamera("SPACE 744 • BAY 5070204", "#0078d4"),
      health: { isActive: true, issueType: "Camera offline", suggestedStatus: "Inspect sensor" },
    },
    {
      bayId: "5070213",
      spaceNumber: "7E",
      floor: 7,
      designation: "General",
      occupied: true,
      outOfService: true,
      reserved: false,
      thumbnailTimestamp: new Date(Date.now() - 91 * 60_000).toISOString(),
      thumbnailAgeMinutes: 91,
      lastContactAgeMinutes: 88,
      feedState: "stale",
      imageUrl: mockCamera("SPACE 7E • BAY 5070213", "#107c10"),
    },
    {
      bayId: "5050102",
      spaceNumber: "550",
      floor: 5,
      designation: "Handicapped",
      occupied: false,
      outOfService: false,
      reserved: false,
      lastContactAgeMinutes: 22,
      feedState: "missing",
    },
  ],
  totalMatches: 54,
  hasMore: true,
  filters: { includeOutOfService: true },
};
