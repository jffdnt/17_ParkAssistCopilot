# Architecture and data semantics

## Delivery paths

- **Microsoft 365 Copilot primary pilot:** `copilotComponent/` supplies four SPFx Copilot UX components that call the Entra-protected `/api/*` endpoints with the signed-in user's delegated token. They render the live dashboard and camera previews inline, can refresh in place, and can send a follow-up prompt to narrate the published dashboard context.
- **Teams and text fallback:** Copilot Studio calls the Streamable HTTP MCP endpoint through a delegated OAuth connection. The model receives text and structured content in the same turn. This route is deliberately text-first because the Copilot Studio MCP bridge does not render the MCP Apps React UI in the current deployment.
- **Legacy:** `appPackage/` contains the superseded direct MCP-plugin experiment. Its `OAuthPluginVault` flow did not work reliably in this tenant and is not the active route.

## Source alignment

The ParkAssist canvas app uses two live sources:

1. The ParkAssist proxy at `https://parkassistproxy99b.azurewebsites.net/api` for bays, visits/plates, timestamps, and images.
2. SharePoint list `SensorHealth` at `https://castletonstage.sharepoint.com/sites/Development` for operational annotations such as `IsActive`, `LastChecked`, `IssueType`, `SuggestedStatus`, and `ImageUrl`.

The canvas app also contains the business map from bay ID to space number, designation, and garage. `src/server/data/bay-map.csv` is a normalized extract of that map. The MCP service filters it to `5 Bell` and merges each configured row with `/bays` at request time.

## Availability rule

A configured space is returned as available only when all of these are true:

- a matching live bay record exists;
- `is_occupied` is false;
- `is_reserved` is false;
- `out_of_service` is false.

No live record means unknown, not available.

## Stale camera rule

The default stale threshold is 15 minutes and can be overridden per tool request.

- `healthy`: `thumbnail_timestamp` exists and its age is within the threshold.
- `stale`: the timestamp exists and is older than the threshold.
- `missing`: the timestamp is absent or invalid.

Missing telemetry is included in stale-feed results because it requires the same operational review. Results sort missing feeds first, then the oldest snapshot first. The upstream `last_contact` age and optional SharePoint issue are shown separately; neither replaces the thumbnail timestamp when deciding camera freshness.

## Camera previews

Tool results never expose the upstream `/images/{bayId}` URL. The server creates a short-lived URL containing the bay ID, expiry, and an HMAC signature. The proxy validates all three values and verifies that the bay belongs to the configured garage before retrieving bytes. The default TTL is five minutes.

The React widget displays up to 24 results per page. The structured result also carries an Adaptive Card representation for hosts that cannot render the MCP App resource.

## Failure behavior

- Live bay requests retry transient failures up to three attempts.
- Image requests retry transient failures once.
- Cached bay data expires after 30 seconds by default.
- If SharePoint Graph access fails, the core garage result still returns without the health overlay.
- Empty results are distinguished from upstream service errors.
- `/health` is a process liveness check; `/ready` verifies that the core ParkAssist source returns configured spaces with a five-second timeout.
- Protected routes and signed camera URLs have a configurable per-replica fixed-window safety limit. Distributed enforcement still belongs at Azure ingress/WAF.
- Access logs are structured JSON with a correlation ID, route path, status, and duration. Query strings and bodies are intentionally excluded so plate queries are not logged.

## UI contract

Each MCP tool returns:

- plain text for model reasoning and accessible fallback;
- `structuredContent` using `GarageToolResult`;
- the `ui://parkassist-copilot/garage-view.html` MCP App resource binding;
- an Adaptive Card object inside the structured result.

The single-file widget is bundled into `dist/widget/mcp-app.html`, uses Fluent UI v9 themes, honors reduced motion, and requests a fresh tool result through the MCP Apps bridge when the user selects Refresh.

The Copilot UX components consume the same `GarageToolResult`-shaped JSON through `/api/overview`, `/api/available-spaces`, `/api/plate-search`, and `/api/stale-feeds`. They publish the displayed facts back to Copilot as model context. The host supplies that context on the next model turn; the dashboard's **Summarize** action creates that turn for the user.

Each dashboard counter (Available, Occupied, Stale or missing feeds, Out of service) is also a button. Selecting one calls `/api/status-detail?status=available|occupied|stale-or-missing|out-of-service`, which returns every bay that counter includes, grouped by floor (`GarageStatusDetail` in `src/shared/contracts.ts`). The tile counts and the drill-down use the same `matchesStatus` predicate in `parking-data.ts`, so a drill-down from the same snapshot always adds up to its tile. The response is unpaged so per-floor counts are complete. It carries signed camera preview URLs, which load only when a space is opened, and it never includes plates; plate lookup stays behind the plate-search tool. The drill-down does not change the model context, and it reloads when the dashboard is refreshed.
