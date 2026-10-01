# Dashboard drill-down: findings and status

Written 2026-10-01 for branch `claude/determined-bohr-975fqf`. This covers three commits:

- `b565b62` Drill into dashboard counters to see the spaces behind them
- `9a2a073` Let Copilot answer questions about the open drill-down
- `f468873` Prepare 1.9.0 release of the drill-down dashboard

**Status:** built and verified locally against mock data. **Not deployed, and not yet tested against live garage data or in Microsoft 365 Copilot.** The rollout steps are in [deployment-state.md](deployment-state.md#dashboard-drill-down-rollout-190--pending).

## What was asked

1. Make the dashboard's metric cards (Available, Occupied, Stale or missing feeds, Out of service) clickable, and show the spaces behind each one in an organized visual.
2. Let the user ask Copilot about whatever drill-down they are looking at.
3. Deploy and test.

## Findings from inspecting the project

- The dashboard in the original screenshot is the **SPFx Copilot Component** in `copilotComponent/`, not the MCP App widget in `src/widget/`. All four of its UX components (overview, available spaces, plate search, stale feeds) render the same `LiveMetrics` counters.
- The counters only ever had **garage-wide totals** (`metrics`). No endpoint returned every bay in a given status. The list endpoints are paged (24 at most), and there were no endpoints at all for occupied or out-of-service bays. A drill-down needed a new server route.
- The counter definitions lived inline in `computeMetrics` (`src/server/services/parking-data.ts`). A separate drill-down filter could easily drift from them, so the tile and its drill-down would disagree.
- License plates are deliberately restricted to the plate-search path. A drill-down of occupied spaces must not become a back door to every plate in the garage.
- **Model context lands on the next user message, and each publish replaces the previous one.** This is already documented in `docs/deployment-state.md`. Two consequences:
  - Publishing drill-down context alone would make Copilot forget the dashboard.
  - A button that asks Copilot about the view has to publish first and then send a follow-up message. This is the same pattern as the existing **Summarize** button.
- The agent instructions (`copilotComponent/copilot/instruction.txt`) said to call two tools on **every** live request. Without a change, a question like "which floor has the most of these?" would load a new dashboard instead of answering about the drill-down on screen.

## What was built

### Server

- New authenticated route `GET /api/status-detail?status=available|occupied|stale-or-missing|out-of-service`. It uses the same Entra check and CORS handling as the other component routes, and unknown statuses get a 400.
- It returns `GarageStatusDetail` (defined in `src/shared/contracts.ts`): every bay in that status, grouped by floor, with each floor's configured count. Floors with no matches are included.
- The response is unpaged so per-floor counts are complete. It is roughly 100–150 KB at the garage's size of 946 bays.
- One `matchesStatus` predicate now backs both `computeMetrics` and the drill-down, so a drill-down built from the same snapshot always adds up to its tile.
- Each space carries its type, reserved flag, feed state and age, minutes parked (occupied only), any health annotation, and a signed camera URL. **Plates are never included.**

### SPFx component

- **Clickable tiles:** the tiles behave as buttons (`role="button"`, Enter/Space, `aria-expanded`). Clicking one opens `StatusDrilldown` below the counters, and clicking it again closes the panel.
- **Layout:** per-floor bars on the left, and a map of space tiles on the right. Each tile is colored by what matters for that status:
  - Available: by space type.
  - Occupied: by how long the car has been parked (under 1h, 1–4h, 4–12h, 12h+).
  - Stale or missing feeds: stale versus no telemetry.
  - Out of service: by health issue.
- **Filters:** space-type chips, a color key that can show or hide each category, and a selected-space card with the camera preview.
- **Refresh:** reloads an open drill-down in place and keeps its floor and filters.
- **Wiring:** `BaseGarageComponent` provides a `DrilldownHostContext`, so none of the four component prop interfaces had to change.

### Copilot integration

- `drilldownModel.ts` holds the filter logic and builds the model-context text. The screen and Copilot use the same code, so they always describe the same view.
- **What Copilot receives:**
  - Garage-wide counts by floor, category, and space type. These are always complete, so "which floor has the most?" works under any filter.
  - The current filters.
  - Up to 200 of the spaces on screen, with an explicit note when the list is truncated.
  - The selected space, if any.
- Signed camera URLs are excluded.
- `BaseGarageComponent` always publishes the dashboard and drill-down facts together. Updates are debounced by 400 ms so rapid filter clicks don't flood the host, and closing the drill-down goes back to the dashboard facts alone.
- **Ask Copilot** sends any pending update immediately, then asks Copilot to describe the view.
- The agent instructions now treat questions about an open drill-down as follow-ups to answer from context, with no new tool call.

## Verification

| Check | Result |
| --- | --- |
| Root typecheck and build | Pass |
| Root vitest: 35 tests, including new tests that check drill-down totals equal the tiles, no plates, and status validation | Pass |
| SPFx production build: heft lint, bundle, package | Pass |
| SPFx jest: 10 tests, including 5 new ones for filters, the context text, the truncation notice, and no signed URLs | Pass |
| `npm run release:check` | Pass (the existing preview-feature warning only) |
| Browser render with mock data, dark and light themes, all four statuses | Visually checked with Playwright screenshots |
| Published-context capture with a mock host: filter, select, Ask Copilot, close | Context text matched the screen. Closing withdrew it. |
| Live garage data | **Not run.** The network policy blocks the upstream. |
| Microsoft 365 Copilot host | **Not run.** No tenant access. |

## Blockers hit during "deploy and test"

- The cloud session has no `az`, Docker, PowerShell, or Azure/SharePoint credentials.
- The environment's network policy denies `parkassistproxy99b.azurewebsites.net` (the live garage API) and `parkassist-mcp.happyground-f091a09b.eastus.azurecontainerapps.io` (the deployed service). To test live data from a cloud session, add both hosts under **Network access** in the environment settings.
- `sharepoint/solution/*.sppkg` is git-ignored. Run `npm run build` in `copilotComponent/` before uploading.

## Deployment order

1. **Server first.** The live revision `parkassist-mcp--0000010` has no `/api/status-detail` route, so a 1.9.0 component deployed before the server would show "Could not load these spaces" on every tile. After deploying, an unauthenticated `GET /api/status-detail?status=available` must return **401**, not 404.
2. **Then SharePoint 1.9.0.0:** upload, deploy, **Add to all sites**, then **Add to Teams**.

The acceptance steps are listed in `deployment-state.md`.

## Known limitations and open items

- **Camera links expire.** Signed camera URLs last `CAMERA_URL_TTL_SECONDS` (300 s by default) from when the drill-down loaded. If a drill-down stays open longer than that without a refresh, opening a space shows the "preview unavailable" placeholder. **Refresh** re-signs the links. If this proves annoying in use, fetch a fresh signed URL when a space is selected.
- **The answer isn't in the same turn.** Typed questions only see the drill-down after its context has been published, which happens 400 ms after the last change. Ask Copilot doesn't have this problem because it publishes before sending.
- **Preview host risk.** The SPFx Copilot Component host is a Microsoft preview. Earlier notes record a desktop client rendering a SharePoint error surface. Ask Copilot relies on the same follow-up mechanism as Summarize, so it should work wherever Summarize does.
- **The MCP App widget is unchanged.** `src/widget/main.tsx` (used by MCP hosts outside the SPFx pilot) still has static counters.
- **Copilot Studio is unchanged.** The text fallback (**ParkAssist Garage Text**) has no drill-down. The new route is REST-only and has no MCP tool.
- **Large lists are capped for Copilot.** Occupied (around 640 spaces) and garage-wide Available exceed the 200-space list limit. Copilot gets complete counts but only part of the list, and is told so.
- **Mock data only so far.** The UI was tuned on synthetic data. Check the tile density and the 420 px scroll height in the real host, both inline and in fullscreen.
