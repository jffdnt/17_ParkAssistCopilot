import type { GarageMetrics, GarageToolResult } from "../../shared/contracts.js";

type CardResult = Omit<GarageToolResult, "adaptiveCard">;

/**
 * Human phrasing for the scope a card's counters cover, collapsing a
 * contiguous run so it reads back the way it was asked for.
 */
function describeScope(result: CardResult): string {
  const floors = result.filters?.floors ?? (result.filters?.floor == null ? undefined : [result.filters.floor]);
  if (!floors || floors.length === 0) return "Garage-wide";
  if (floors.length === 1) return `Floor ${floors[0]}`;
  const contiguous = floors.every((floor, index) => index === 0 || floor === floors[index - 1]! + 1);
  return contiguous
    ? `Floors ${floors[0]}–${floors[floors.length - 1]}`
    : `Floors ${floors.slice(0, -1).join(", ")} and ${floors[floors.length - 1]}`;
}

/**
 * The counters worth showing for each view.
 *
 * Camera health needs stale and missing separately, because the summary counts
 * them together — "47 stale or missing" beside a lone "Stale feeds: 45" looks
 * like an error when it is really two of the three numbers. Availability needs
 * the reasons a space is unusable rather than camera state.
 */
function factsFor(view: CardResult["view"], metrics: GarageMetrics): { title: string; value: string }[] {
  const fact = (title: string, value: number): { title: string; value: string } => ({ title, value: String(value) });

  if (view === "stale-feeds") {
    return [
      fact("Stale feeds", metrics.staleFeeds),
      fact("Missing feeds", metrics.missingFeeds),
      fact("Offline sensors", metrics.offlineSensors),
      fact("Out of service", metrics.outOfService),
    ];
  }
  if (view === "availability") {
    return [
      fact("Available", metrics.available),
      fact("Occupied", metrics.occupied),
      fact("Reserved", metrics.reserved),
      fact("Out of service", metrics.outOfService),
    ];
  }
  return [
    fact("Available", metrics.available),
    fact("Occupied", metrics.occupied),
    fact("Stale feeds", metrics.staleFeeds),
    fact("Out of service", metrics.outOfService),
  ];
}

/** How to see the rest, in terms that apply to the view actually shown. */
function narrowingHint(view: CardResult["view"]): string {
  if (view === "stale-feeds") return "Ask to narrow the floors, raise the threshold, or show the next page.";
  if (view === "availability") return "Ask to narrow the floors or designation, or show the next page.";
  return "Ask for the next page to see more.";
}

export function buildAdaptiveCard(result: CardResult): Record<string, unknown> {
  const scope = describeScope(result);
  /*
    Prefer the floor-scoped counters when the request was filtered. Without
    this the card rendered garage-wide totals directly beneath a floor-scoped
    summary — "Stale feeds: 98" under "47 of the 316 mapped spaces on floors
    7-9" — two correct numbers answering different questions.
  */
  const metrics = result.metricsInScope ?? result.metrics;

  const body: Record<string, unknown>[] = [
    {
      type: "TextBlock",
      text: result.title,
      size: "Large",
      weight: "Bolder",
      wrap: true,
    },
    {
      type: "TextBlock",
      text: result.summary,
      wrap: true,
      spacing: "Small",
    },
    {
      // Naming the scope is what keeps the counters below unambiguous.
      type: "TextBlock",
      text: scope,
      isSubtle: true,
      size: "Small",
      weight: "Bolder",
      spacing: "Medium",
      wrap: true,
    },
    {
      type: "FactSet",
      facts: factsFor(result.view, metrics),
    },
  ];

  // Which floors the matches actually fell on. A single floor needs no split.
  if (result.floorBreakdown && result.floorBreakdown.length > 1) {
    body.push({
      type: "FactSet",
      separator: true,
      spacing: "Medium",
      facts: result.floorBreakdown.map((entry) => ({
        title: `Floor ${entry.floor}`,
        value: `${entry.count} of ${entry.configured}`,
      })),
    });
  }

  for (const bay of result.bays.slice(0, 6)) {
    const columns: Record<string, unknown>[] = [];
    if (bay.imageUrl) {
      columns.push({
        type: "Column",
        width: "100px",
        items: [{
          type: "Image",
          url: bay.imageUrl,
          altText: `Last camera image for parking space ${bay.spaceNumber}`,
          size: "Medium",
        }],
      });
    }
    columns.push({
      type: "Column",
      width: "stretch",
      items: [
        {
          type: "TextBlock",
          text: `Space ${bay.spaceNumber}`,
          weight: "Bolder",
          wrap: true,
        },
        {
          type: "TextBlock",
          text: [
            `Bay ${bay.bayId}`,
            `Floor ${bay.floor}`,
            bay.thumbnailAgeMinutes == null
              ? "No camera timestamp"
              : `Image age ${Math.round(bay.thumbnailAgeMinutes)} min`,
          ].join(" • "),
          isSubtle: true,
          size: "Small",
          wrap: true,
        },
      ],
    });
    body.push({ type: "ColumnSet", separator: true, columns });
  }

  /*
    The card shows at most six bays, so it is almost always a partial list and
    has to say so — otherwise six rows read as the complete answer.
  */
  const shown = Math.min(result.bays.length, 6);
  if (result.totalMatches > shown) {
    body.push({
      type: "TextBlock",
      text: `Showing ${shown} of ${result.totalMatches}. ${narrowingHint(result.view)}`,
      isSubtle: true,
      size: "Small",
      wrap: true,
    });
  }

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body,
  };
}
