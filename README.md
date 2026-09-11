# ParkAssist Copilot

ParkAssist Copilot is a read-only Microsoft Copilot experience for the **5 Bell** parking garage. It exposes live garage data through a Streamable HTTP MCP server and renders an expressive React + Fluent UI widget inside Microsoft 365 Copilot. The same MCP server can be connected to a Copilot Studio agent and published to Microsoft Teams.

The implementation was derived from the data sources and bay map used by Power Apps canvas app `d64fefaa-7ac3-4ea8-a823-a27ec0878b50` (`ParkAssist`). The older `12_CopilotWebpart` project informed the Direct Line/Teams requirements, but this repository uses the current MCP Apps pattern instead of embedding a separate SPFx Web Chat surface.

## What it can answer

| User intent | MCP tool | Result |
| --- | --- | --- |
| “Which cameras have stale feeds?” | `get-stale-camera-feeds` | Stale/missing bays, timestamps, sensor issues, and short-lived camera previews |
| “What spaces are available on floor 5?” | `find-available-spaces` | Live vacant, in-service spaces filtered by floor/designation |
| “Where is plate ABC123?” | `search-license-plate` | Occupied bay matches; partial results are masked |
| “How is the garage looking?” | `garage-overview` | Occupancy, availability, out-of-service, and camera-health metrics |

## Architecture

```text
Teams / Microsoft 365 Copilot
        │
        ├─ Copilot Studio agent ─ Power Platform MCP connection ─┐
        │                                                        │
        └─ Declarative agent ─ MCP plugin + Entra SSO ───────────┤
                                                                 ▼
                      ParkAssist MCP service (Node/Express)
                       │          │                 │
                       │          │                 └─ React MCP App resource
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
| `PARKASSIST_API_BASE_URL` | Existing live ParkAssist proxy; defaults to the canvas app’s endpoint |
| `PARKING_GARAGE` | Garage filter; defaults to `5 Bell` |
| `STALE_AFTER_MINUTES` | Default stale-camera threshold; defaults to `15` |
| `AUTH_MODE` | `none` for local only, `api-key` for Copilot Studio testing, `entra` for production SSO |
| `CAMERA_SIGNING_SECRET` | At least 32 random characters used to sign temporary preview URLs |
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
- `POST|GET|DELETE /mcp` — Streamable HTTP MCP endpoint
- `GET /api/cameras/{bayId}?exp=...&sig=...` — signed image proxy
- `GET /preview?preview=stale` — local visual-QA fixture

Deploy the container to an HTTPS host such as Azure Container Apps. The production service must use `AUTH_MODE=entra` for the Microsoft 365 declarative-agent route. Copilot Studio also supports API-key connections for a limited pilot, but Entra/OAuth is preferred for user attribution and Conditional Access.

## Connect to Copilot Studio and Teams

Follow [copilot-studio-setup.md](docs/copilot-studio-setup.md). It covers the recommended Copilot Studio MCP onboarding wizard, the Power Apps custom-connector fallback, publishing the agent, and personal Teams validation before broader sharing.

This repository also includes a Microsoft 365 declarative-agent package in `appPackage/`. That route is the one that renders the React MCP App inline in Microsoft 365 Copilot. Copy `env/.env.local.example` to `env/.env.local`, provision the Entra/Teams authentication registration, then use Microsoft 365 Agents Toolkit or:

```powershell
./scripts/package-agent.ps1
```

The source package intentionally contains deployment tokens; the script resolves them into `appPackage/build/appPackage.local.zip` and fails if any token remains.

Current Microsoft guidance:

- [Add MCP tools/resources to Copilot Studio](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-components-to-agent)
- [Connect a Copilot Studio agent to an MCP server](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent)
- [Publish Copilot Studio agents to Teams and Microsoft 365](https://learn.microsoft.com/en-us/microsoft-copilot-studio/publication-add-bot-to-microsoft-teams)
- [Build MCP Apps for Microsoft 365 Copilot](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-mcp-apps)
- [Build a Microsoft 365 plugin from an MCP server](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-mcp-plugins)

## Privacy and operational limits

- Read-only: no reservations, alert dismissal, or source-system writes.
- Plate searches require at least three characters. Partial-match lists stay masked; only an exact normalized match may reveal the full plate.
- Camera URLs are HMAC-signed, bay-scoped, and expire after five minutes by default.
- Camera bytes are proxied; upstream URLs and credentials are never sent to the client.
- Responses are point-in-time snapshots and show their generated time.
- The server caches live bay data briefly (30 seconds by default) to reduce load.

See [security.md](docs/security.md) before enabling production access.

## Repository map

```text
appPackage/              Microsoft 365 declarative-agent package template
connector/               Power Apps custom MCP connector fallback
docs/                    architecture, security, and setup guidance
scripts/                 smoke test, icon generator, package builder
src/server/              MCP server, auth, live API, Graph, signed images
src/server/data/         canvas-app-derived 5 Bell bay map
src/widget/              React 19 + Fluent UI v9 MCP App
tests/                   bay map, privacy, stale logic, and signature tests
```
