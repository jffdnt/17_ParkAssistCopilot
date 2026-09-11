import type { GarageToolResult } from "../../shared/contracts.js";

export function buildAdaptiveCard(result: Omit<GarageToolResult, "adaptiveCard">): Record<string, unknown> {
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
      type: "FactSet",
      facts: [
        { title: "Available", value: String(result.metrics.available) },
        { title: "Occupied", value: String(result.metrics.occupied) },
        { title: "Stale feeds", value: String(result.metrics.staleFeeds) },
        { title: "Out of service", value: String(result.metrics.outOfService) },
      ],
    },
  ];

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

  if (result.hasMore) {
    body.push({
      type: "TextBlock",
      text: `${result.totalMatches - result.bays.length} more results are available. Ask the agent to narrow the floor or show the next page.`,
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
