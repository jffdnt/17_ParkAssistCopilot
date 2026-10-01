# ParkAssist Copilot

ParkAssist Copilot is a read-only Microsoft Copilot experience for the **5 Bell** parking garage. One Node/Express service exposes live garage data through Streamable HTTP MCP and authenticated REST endpoints. The primary Microsoft 365 pilot is the SPFx Copilot UX component in `copilotComponent/`: it renders an interactive dashboard, garage metrics, and camera previews in the conversation. The Copilot Studio agent remains a text-first fallback and the Teams-compatible route while Copilot UX components are in preview.

The implementation was derived from the data sources and bay map used by Power Apps canvas app `d64fefaa-7ac3-4ea8-a823-a27ec0878b50` (`ParkAssist`). The older `12_CopilotWebpart` project informed the Direct Line/Teams requirements, but this repository uses the current MCP Apps pattern instead of embedding a separate SPFx Web Chat surface.

## What it can answer

| User intent | MCP tool | Result |
| --- | --- | --- |
| “Which cameras have stale feeds?” | `get-stale-camera-feeds` | Stale/missing bays, timestamps, sensor issues, and short-lived camera previews |
| “What spaces are available on floor 5?” | `find-available-spaces` | Live vacant, in-service spaces filtered by floor/designation |
| “Where is plate ABC123?” | `search-license-plate` | Occupied bay matches; authorized partial searches return the full matching plate |
| “How is the garage looking?” | `garage-overview` | Occupancy, availability, out-of-service, and camera-health metrics |

## Architecture

```text
Microsoft 365 Copilot ─ SPFx Copilot UX components ─ authenticated REST ─┐
                                                                          │
Teams / text fallback ─ Copilot Studio ─ Power Platform MCP connection ──┤
                                                                          ▼
                   ParkAssist service (Node/Express)
                    │          │                 │
                    │          │                 └─ React MCP App resource (MCP hosts)
                    │          └─ signed, short-lived image proxy
                    ▼
      ParkAssist live API: /bays and /images/{bayId}
                       │
                       └─ optional Microsoft Graph overlay
                          SharePoint site Development / SensorHealth
```

The checked-in 946-row `5 Bell` bay map comes from the canvas app configuration. Occupancy, plates, timestamps, sensor contact, and images are always requested from the live service. See [architecture.md](docs/architecture.md) for the merge and stale-feed rules.

## Local development

Requirements: Node.js 22 or later.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:3000/preview?preview=stale` for a privacy-safe visual fixture. Add `&theme=dark` to check the dark theme. The fixture never calls the garage API and contains no real plate or camera data.

Run all checks:

```powershell
npm run typecheck
npm test
npm run build
Push-Location copilotComponent
npm ci
npm run build
Pop-Location
```

To smoke-test the MCP protocol against a running server:

```powershell
npm run smoke
```

## Configuration

Copy `.env.example` to `.env`. Important production settings:

| Setting | Purpose |
| --- | --- |
| `PUBLIC_BASE_URL` | Public HTTPS service origin, without `/mcp` |
| `CORS_ALLOWED_ORIGINS` | SharePoint origins allowed to call the Copilot Component `/api/*` routes |
| `PARKASSIST_API_BASE_URL` | Existing live ParkAssist proxy; defaults to the canvas app’s endpoint |
| `PARKING_GARAGE` | Garage filter; defaults to `5 Bell` |
| `STALE_AFTER_MINUTES` | Default stale-camera threshold; defaults to `15` |
| `AUTH_MODE` | `none` for local only, `api-key` for Copilot Studio testing, `entra` for production SSO |
| `CAMERA_SIGNING_SECRET` | At least 32 random characters used to sign temporary preview URLs |
| `RATE_LIMIT_WINDOW_SECONDS` / `RATE_LIMIT_MAX_REQUESTS` | Per-replica request safety limit; defaults to 300 requests per minute per client IP |
| `TRUST_PROXY_HOPS` | Trusted reverse-proxy hops used to resolve client IPs; defaults to `0`, while the Container Apps template sets `1` |
| `SHAREPOINT_SITE_URL` | Optional `SensorHealth` overlay; unset to disable |

In Azure, `DefaultAzureCredential` lets the service use a managed identity for Microsoft Graph. Grant only the site-scoped permission needed to read `https://castletonstage.sharepoint.com/sites/Development`; do not place production secrets in `.env` or source control.

## Container deployment

Build and test the production container locally:

```powershell
docker build -t parkassist-copilot .
docker run --rm -p 3000:3000 --env-file .env parkassist-copilot
```

The service exposes:

- `GET /health` — health and configured-space count
- `GET /ready` — readiness check against the core ParkAssist upstream
- `POST|GET|DELETE /mcp` — Streamable HTTP MCP endpoint
- `GET /api/overview|available-spaces|plate-search|stale-feeds` — Entra-protected Copilot Component endpoints
- `GET /api/cameras/{bayId}?exp=...&sig=...` — signed image proxy
- `GET /preview?preview=stale` — local visual-QA fixture

Deploy the container to an HTTPS host such as Azure Container Apps. A production process refuses to start with `AUTH_MODE=none` or with a missing, short, or placeholder camera-signing secret. The deployed Microsoft 365 and Copilot Studio routes use Entra/OAuth for user attribution and Conditional Access.

For repeatable Azure deployment, start with a no-change preview using [deploy-azure.ps1](scripts/deploy-azure.ps1) and the instructions in [infra/README.md](infra/README.md). The flow creates managed identity and Log Analytics, builds an immutable image tag, and configures separate liveness and readiness probes.

Before a release, run `npm run release:check`. Supply the organization-owned publisher/legal URLs through `PUBLISHER_WEBSITE_URL`, `PRIVACY_URL`, and `TERMS_OF_USE_URL`, then run `npm run release:metadata` to update the active Copilot Component manifests.

## Connect to Microsoft 365 Copilot and Teams

For the primary Microsoft 365 experience, build and deploy [copilotComponent](copilotComponent/README.md). It contains four Copilot UX components that call the Entra-protected REST routes and render live dashboards and camera-result grids.

For Teams or a text-only recovery path, follow [copilot-studio-setup.md](docs/copilot-studio-setup.md). The fallback agent uses the MCP route for same-turn numerical answers and Adaptive Card data where the host supports it; it does not provide the SPFx dashboard.

`appPackage/` is retained as a legacy declarative-agent/MCP-plugin experiment. Its `OAuthPluginVault` route did not reach the server in this tenant and is not the current deployment target.

Current Microsoft guidance:

- [Add MCP tools/resources to Copilot Studio](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-components-to-agent)
- [Connect a Copilot Studio agent to an MCP server](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent)
- [Publish Copilot Studio agents to Teams and Microsoft 365](https://learn.microsoft.com/en-us/microsoft-copilot-studio/publication-add-bot-to-microsoft-teams)
- [Build MCP Apps for Microsoft 365 Copilot](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-mcp-apps)
- [Build a Microsoft 365 plugin from an MCP server](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-mcp-plugins)

## Privacy and operational limits

- Read-only: no reservations, alert dismissal, or source-system writes.
- Plate searches require at least three characters. Both partial and exact matches return the full plate.
- Camera URLs are HMAC-signed, bay-scoped, and expire after five minutes by default.
- Camera bytes are proxied; upstream URLs and credentials are never sent to the client.
- Responses are point-in-time snapshots and show their generated time.
- The server caches live bay data briefly (30 seconds by default) to reduce load.

See [security.md](docs/security.md) before enabling production access.

## Repository map

```text
appPackage/              Legacy declarative-agent/MCP-plugin experiment
copilotComponent/        Primary M365 pilot: SPFx Copilot UX components
copilotStudio/           Text-first fallback and Teams route
connector/               Power Apps custom MCP connector fallback
docs/                    architecture, security, and setup guidance
infra/                   Bicep for identity, logs, registry, environment, and Container App
scripts/                 smoke test, icon generator, package builder
src/server/              MCP server, auth, live API, Graph, signed images
src/server/data/         canvas-app-derived 5 Bell bay map
src/widget/              React 19 + Fluent UI v9 MCP App
tests/                   bay map, privacy, stale logic, and signature tests
```
