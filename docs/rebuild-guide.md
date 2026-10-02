# Rebuild guide: new tenant, new machine

This is the runbook for standing this solution up from zero in a **different
Azure subscription and Microsoft 365/Entra tenant**, starting from a clone of
this repository on a new machine. It covers everything the other docs
assume is already done: provisioning Azure resources, registering the Entra
app, and wiring the one-time tenant registrations the deployed service
depends on. For the parts that are already well documented and don't change
between tenants, this guide hands off to the existing doc instead of
repeating it.

**What you end up with** (matching [deployment-state.md](deployment-state.md)):

1. The ParkAssist Node/Express service running on Azure Container Apps.
2. The primary Microsoft 365 Copilot route — SPFx Copilot Components,
   deployed from `copilotComponent/` — giving the interactive dashboard,
   camera previews, and drill-downs, plus a bundled OpenAPI action for
   same-turn text facts.
3. The Teams/text-only fallback — a Copilot Studio agent calling the MCP
   endpoint.

**What you're deliberately not rebuilding:** the declarative-agent package
that used to live in `appPackage/` (`OAuthPluginVault` + `RemoteMCPServer`).
It never reliably reached the server in the original tenant (see
[release-history.md](release-history.md#teamsm365-copilot-sso-on-behalf-of-route--tested-not-working)),
was superseded by the SPFx route, and has since been deleted from this repo
along with its supporting toolchain (`m365agents.yml`, `scripts/package-agent.ps1`,
`scripts/generate-icons.ps1`, `env/.env.dev`, `env/.env.local.example`). Its
Teams SSO client ID registration and `preAuthorizedApplications` entries were
specific to that broken path — skip them here. The `connector/` Power Apps
custom-connector fallback is
also optional; only set it up if the Copilot Studio MCP onboarding wizard is
unavailable in the new environment (see
[copilot-studio-setup.md](copilot-studio-setup.md#power-apps-custom-connector-fallback)).

## 0. Prerequisites

| Tool/access | Needed for |
| --- | --- |
| Node.js 22 (root), Node.js 22.14.x (`copilotComponent/`, pinned by its SPFx 1.24 preview dependency) | Build everything |
| Azure CLI (`az`) with the Bicep tooling (`az bicep install` if prompted) | Infrastructure, ACR builds |
| PowerShell 7+ | `scripts/deploy-azure.ps1` |
| Azure subscription access: Contributor + enough rights to assign `AcrPull` (or User Access Administrator) on the target resource group | Provisioning |
| Global Administrator or Application Administrator in the target Entra tenant | App registration, admin consent |
| SharePoint Online with a tenant app catalog, and rights to upload/deploy/approve API access | SPFx Copilot Component |
| A Copilot Studio environment in the target tenant | Teams/text fallback |
| Docker — optional | Local image testing only; deployment uses ACR cloud builds (`az acr build`), same as the original setup |

Clone the repo onto the new machine, then:

```powershell
npm install
Copy-Item .env.example .env
```

Leave `PARKASSIST_API_BASE_URL`, `PARKING_GARAGE`, and the checked-in
`src/server/data/bay-map.csv` as they are if you're pointing at the same
live 5 Bell ParkAssist data source — only the tenant/Azure-side values below
need to change. If this rebuild also targets a different garage or upstream
API, update those first and confirm `npm run dev` + `npm test` pass locally
before continuing.

## 1. Register the Entra app

One single-tenant Entra app backs **both** remaining routes: the server's
own token validation (`AUTH_MODE=entra`), the SPFx component's delegated
calls, and the Copilot Studio MCP tool's OAuth connection.

```powershell
az login
az account set --subscription "<target subscription>"

az ad app create --display-name "ParkAssist Copilot" --sign-in-audience AzureADMyOrg
# Note the returned `appId` (client ID) and `id` (object ID).
az ad sp create --id <appId>
```

In the [Entra admin center](https://entra.microsoft.com/) for this app:

1. **Expose an API** → accept the default Application ID URI
   (`api://<appId>`) → **Add a scope**: name `access_as_user`, consentable
   by admins and users, any display name/description, state **Enabled**.
2. **API permissions** → **Add a permission** → **APIs my organization
   uses** → find this same app → **Delegated permissions** →
   `access_as_user` → **Add permissions** → **Grant admin consent for
   `<tenant>`**. (This is a self-referencing permission; it's what lets
   Copilot Studio's connection and the SharePoint-approved delegated calls
   get tokens without per-user consent prompts.)
3. **Certificates & secrets** — you'll add one later, in step 5, once
   Copilot Studio needs it. You can also do it now:
   ```powershell
   az ad app credential reset --id <appId> --append --display-name "Copilot Studio MCP OAuth" --years 1
   ```
   Save the secret value immediately; it's shown only once.

Record `appId` (→ `ENTRA_CLIENT_ID`) and your tenant ID (→
`ENTRA_TENANT_ID`). You do **not** need to set `api.requestedAccessTokenVersion`
or add `preAuthorizedApplications` — `src/server/auth.ts` already accepts
both v1 (`api://<clientId>`) and v2 (`<clientId>`) token audiences, and
nothing here uses the Teams/Office on-behalf-of path that needed
preauthorization.

## 2. Provision Azure and deploy the service

Generate two secrets once, and reuse them in steps 2 and 4:

```powershell
$env:PARKASSIST_CAMERA_SIGNING_SECRET = <random 32+ character value>
$env:PARKASSIST_PLUGIN_API_KEY = <a different random 32+ character value>
```

Review the plan, then deploy (see [infra/README.md](../infra/README.md) for
what each Bicep template provisions):

```powershell
./scripts/deploy-azure.ps1 `
  -ResourceGroup <new resource group> `
  -Location <azure region> `
  -ContainerRegistryName <new, globally-unique ACR name> `
  -EntraTenantId <tenant id from step 1> `
  -EntraClientId <appId from step 1> `
  -CorsAllowedOrigins "https://<new tenant>.sharepoint.com" `
  -SharePointSiteUrl "https://<new tenant>.sharepoint.com/sites/<site>" `
  -WhatIfOnly
```

Drop `-WhatIfOnly` once the plan looks right. The script creates the
resource group, foundation resources (Log Analytics, ACR, Container Apps
environment, managed identity scoped to `AcrPull` only), builds an immutable
image tag in ACR, and deploys the Container App. It never deploys `:latest`.

Note the script's output `URL:` value — that's your new
`PUBLIC_BASE_URL`/`baseUrl` for every step below.

Verify before continuing:

```powershell
curl https://<new-app>.<region>.azurecontainerapps.io/health
curl https://<new-app>.<region>.azurecontainerapps.io/ready
curl -i https://<new-app>.<region>.azurecontainerapps.io/api/status-detail?status=available
# expect 401, not 404 — proves the route exists and Entra enforcement is live
```

If the `SensorHealth` SharePoint overlay is in use, also grant the
Container App's managed identity (`id-parkassist-prod` by default) the
site-scoped Microsoft Graph permission for the new tenant's site — this is
outside the Bicep template by design (see the last line of
[infra/README.md](../infra/README.md)).

## 3. Register the hybrid plugin's API key

The bundled OpenAPI action (`copilotComponent/copilot/live-data-plugin.json`)
authenticates with `ApiKeyPluginVault`, which needs a one-time registration
in the Teams developer portal:

1. Open [Teams developer portal → Tools → API key registration](https://dev.teams.microsoft.com/tools/api-key-registration).
2. **Create an API key** (or **New API key**) → **Add secret** → paste the
   same value you put in `$env:PARKASSIST_PLUGIN_API_KEY` above.
3. Fill in: **API key name** (e.g. `ParkAssist Garage Live Data`),
   **Base URL** = your new Container App URL (must match the `servers[0].url`
   you'll set in step 4), **Target tenant** = restrict to this tenant,
   **Target Teams App** = **Any Teams app** (you can bind it to the published
   app ID later).
4. **Save**. Copy the generated **API key registration ID**.

You'll use that ID in the next step.

## 4. Build and deploy the primary route (SPFx Copilot Components)

Update the environment-specific values before building:

| File | Field(s) to update |
| --- | --- |
| `copilotComponent/config/parkassist-environment.json` | `resourceUri`: `api://<appId>`; `baseUrl`: the new Container App URL |
| `copilotComponent/copilot/manifest.json` | `validDomains`: the new Container App hostname |
| `copilotComponent/copilot/parkassist-live-data.json` | `servers[0].url`: the new Container App URL |
| `copilotComponent/copilot/live-data-plugin.json` | `runtimes[0].auth.reference_id`: the API key registration ID from step 3 |

Optionally also regenerate the Teams app `id` in `copilotComponent/copilot/manifest.json`
(any new GUID) — not required for a different tenant, but conventional for
a distinct app identity. Leave the `id` values in
`copilotComponent/config/package-solution.json` as they are; those only need
to be unique within one tenant's catalog.

If you're using real publisher/legal URLs (optional for an internal pilot):

```powershell
$env:PUBLISHER_WEBSITE_URL = "https://..."
$env:PRIVACY_URL = "https://.../privacy.html"
$env:TERMS_OF_USE_URL = "https://.../terms.html"
node scripts/set-release-metadata.mjs
```

Then build and run the gate:

```powershell
Push-Location copilotComponent
npm ci
npm run build
Pop-Location
npm run release:check
```

`release:check` fails loudly if the OpenAPI document still points at the
old tenant's hostname or if `live-data-plugin.json` still has the
placeholder `reference_id` (`PENDING_HYBRID_API_KEY_REGISTRATION`) — treat
it as the final check that steps 3–4 are consistent before you deploy.

From here, follow [copilotComponent/README.md § Deployment](../copilotComponent/README.md#deployment)
exactly as written — it's already tenant-agnostic:

1. Upload and deploy `sharepoint/solution/parkassist-garage-copilot-component.sppkg`
   to the new tenant's app catalog.
2. Approve `ParkAssist Copilot` / `access_as_user` in **SharePoint Admin
   Center → Advanced → API access**. (The pending request's resource name
   must exactly match the Entra app's display name from step 1 — a common
   mismatch point.)
3. Select the app in the catalog → **Add to all sites** → **Add to Teams**.
4. In Microsoft 365 Copilot → Agent Store → **Built by your org** → add
   **ParkAssist Garage**.

No Microsoft 365 Copilot license is required to build, deploy, or test
Copilot UX components during this public preview.

## 5. Deploy the Teams/text fallback (Copilot Studio)

Follow [copilot-studio-setup.md](copilot-studio-setup.md) sections 2–4
end to end in the new Copilot Studio environment; it's already written
generically. Three things worth calling out that aren't spelled out there:

- **Creating the OAuth connection** (section 2, step 5 "Production: OAuth
  2.0"): use the Entra app from step 1 as both client and resource.
  - Client ID: `appId` from step 1. Client secret: the one you generated in
    step 1 (or generate a fresh one the same way).
  - Endpoints: `https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/{authorize,token,token}`.
  - Scope: `api://<appId>/access_as_user`.
  - After you create the tool, Copilot Studio generates a connector-specific
    callback URL (`https://global.consent.azure-apim.net/redirect/...`).
    Copy it and add it under the Entra app's **Authentication → Web →
    Redirect URIs**, then come back and reconnect/save the tool.
- **Harden the generative AI settings** before publishing — this isn't in
  copilot-studio-setup.md but matters for the "answers must come from the
  live tools, not model knowledge" design documented in
  [security.md](security.md): in the agent's **Settings → Generative AI**,
  turn off **Allow ungrounded responses**, **Use information from the
  Web**, **File uploads**, and **Tenant graph grounding with semantic
  search**.
- If you'd rather manage the agent as code instead of the portal UI, the
  hardened configuration is already checked into `copilotStudio/agent/`
  (`pac copilot push --project-dir ./copilotStudio/agent` against a new,
  empty agent you create first in the target environment). Note that
  `connectionreferences.mcs.yml` references the *original* tenant's OAuth
  connection GUID, which won't exist in the new tenant — you'll still need
  to create the connection manually as above and rebind it. For a first
  rebuild, doing the portal walkthrough in copilot-studio-setup.md is more
  reliable than replaying the sync files across tenants.

## 6. Acceptance

Run through [copilot-studio-setup.md § 6 Acceptance checklist](copilot-studio-setup.md#6-acceptance-checklist),
plus:

- Dashboard drill-downs: each counter (Available, Occupied, Stale or
  missing feeds, Out of service) opens a per-floor breakdown that sums to
  its tile.
- Full plates render only for occupied spaces, in the drill-down and in
  plate search; every other view omits them (see
  [security.md](security.md)).
- Opening a space issues a fresh signed camera URL via
  `GET /api/camera-preview-url`, not a URL embedded in the drill-down
  response (see [architecture.md](architecture.md)).
- **Ask Copilot** / **Summarize** narrates the currently published
  dashboard or drill-down context without an extra tool call.

## 7. After it's live

Update [deployment-state.md](deployment-state.md) with the new tenant's
production routes, versions, and identifiers — it currently describes the
original tenant and will be wrong for this one. Start a fresh
[release-history.md](release-history.md) entry (or a new file) for this
environment's rollout rather than editing the original tenant's history in
place.
