# ParkAssist Copilot Components

This SPFx 1.24 preview solution is the active Microsoft 365 Copilot presentation layer for ParkAssist. It packages four Copilot Components:

- garage overview;
- available spaces;
- license-plate search;
- stale or missing camera feeds.

Each component obtains an Entra delegated token through `AadHttpClient`, calls the matching `/api/*` endpoint on the ParkAssist service, renders a Fluent UI dashboard or camera-result grid, and publishes the displayed facts as model context. **Refresh** reloads the current view in place; **Summarize** asks Copilot to narrate the published context in a follow-up turn.

## Build

Use Node.js 22.14.x:

```powershell
npm ci
npm run build
```

The default deployment coordinates are in `config/parkassist-environment.json`. For another environment, either set `PARKASSIST_CONFIG_FILE` to a JSON file with `name`, `resourceUri`, and `baseUrl`, or set `PARKASSIST_RESOURCE_URI` and `PARKASSIST_BASE_URL` directly before building. The build rejects non-Entra resource URIs and non-HTTPS service origins.

The build creates:

- `sharepoint/solution/parkassist-garage-copilot-component.sppkg` for the SharePoint tenant app catalog;
- `teams/parkassist-garage.zip`, embedded in the solution and synchronized to the tenant agent catalog.

## Deployment

1. Upload and deploy the `.sppkg` to the tenant app catalog.
2. Approve `ParkAssist Copilot` / `access_as_user` in SharePoint Admin Center → Advanced → API access.
3. Select the app in the app catalog, run **Add to all sites**, and then **Add to Teams**.
4. Add **ParkAssist Garage** from Microsoft 365 Copilot → Agent Store → Built by your org.

Every package update requires a version bump in both `config/package-solution.json` and `copilot/manifest.json`, followed by **Add to all sites** and **Add to Teams** again. Deployment coordinates are injected at build time; build each environment from its matching configuration file and retain the resulting package as an environment-specific artifact.

## Production prerequisites

- The ParkAssist service must use Entra authentication and allow the tenant SharePoint origin through `CORS_ALLOWED_ORIGINS`.
- The SharePoint API permission request must be approved.
- Replace the placeholder developer website, privacy, and terms URLs before public distribution.
- SPFx 1.24 is still a preview dependency in this solution; validate the supported upgrade path before broad rollout.
