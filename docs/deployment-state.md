# Deployment state

Last verified: 2026-09-11

## Power Platform

- Environment: `https://orgdc7bf008.crm.dynamics.com/` (`Jeffrey Dent's Environment`)
- Existing canvas solution: `5BellParkAssist`
- Publisher prefix: `fivebell`
- Copilot solution: `fivebell_ParkAssistCopilot`
- Copilot Studio agent: `ParkAssist Copilot`
- Agent ID: `d92774c9-4171-446a-9d7c-485bb0b4a850`
- Agent state reported by `pac copilot list`: Active / Provisioned / Published
- MCP tool connection: configured (OAuth 2.0 Manual) and verified live — see "Copilot Studio MCP tool connection" below.
- Teams/Microsoft 365 channel validation: not completed

The CLI 2.8.1 `pac copilot init` operation imported the minimal agent solution as part of workspace generation. The checked-in workspace's hardened instructions have since been pushed live (see below).

## Copilot Studio workspace sync (2026-09-12)

- `pac copilot clone --bot d92774c9-4171-446a-9d7c-485bb0b4a850` into a scratch directory captured the `.mcs/` sync-tracking folder (`botdefinition.json`, `changetoken.txt`, `conn.json`) plus artifacts generated when the MCP tool was added: `connectionreferences.mcs.yml`, `agents/topic.ParkAssistGarageMCP.mcs.yml`, and `connectors/fivebell_5Fparkassist-20garage-20mcp-.../`. `pac copilot pull --project-dir ./copilotStudio/agent` alone reported "0 changes" because a fresh clone's changetoken is already at HEAD — the artifacts had to be copied in manually from the clone, not pulled incrementally. All copied into `copilotStudio/agent/` (the `.mcs/` folder is gitignored via its own nested `.gitignore`).
- `pac copilot push --project-dir ./copilotStudio/agent` then pushed the hardened instructions (and `gptCapabilities.webBrowsing: false`) live — confirmed via a fresh `pac copilot clone` that the remote `agent.mcs.yml` now matches.
- **Found a real gap**: the live agent's `aISettings` (`useModelKnowledge`, `isFileAnalysisEnabled`, `isSemanticSearchEnabled`) were all `true`, contradicting the checked-in `settings.mcs.yml` (`false`) and the documented hardened design ("garage facts must come from the four live MCP tools rather than general model knowledge" — this repo's README/copilotStudio README). `pac copilot push` does not touch these fields. Fixed directly in the maker portal: Settings → Generative AI → turned off "Allow ungrounded responses," "Use information from the Web," "File uploads," and "Tenant graph grounding with semantic search." Verified via a fresh `pac copilot clone` that all three `aISettings` flags are now `false`. `copilotStudio/agent/settings.mcs.yml` was updated to match (also picked up a `contentModeration: High` field that Copilot Studio now serializes).
- **Gotcha**: saving Settings while a concurrent `pac copilot push` (or another save) is in flight fails with `HTTP PreconditionFailed ... ConcurrencyVersionMismatch`. Fix is to click "Discard changes" and redo the edit on the refreshed page — don't retry the same save blindly.
- The agent was published (see "Published" below) *before* this workspace sync and settings fix, so **a re-publish is needed** for the hardened instructions and disabled knowledge/search/file settings to reach Teams/M365 channels.

## Azure

- Subscription: `Azure subscription 1` (`7005a55f-0b9a-4c0c-9f43-5789209b0e4d`)
- Intended resource group: `rg-parkassist-prod` (East US)
- Existing stopped `parkassist-sidecar-prod-7388` is a Python 3.11 Function App and is not being overwritten.
- Entra application `ParkAssist Copilot` created: appId `750929bd-e2b6-4019-838c-365c36cbcb22`, object id `0b8d3128-235a-4884-af38-1f4043657a3a`, single-tenant (`AzureADMyOrg`). Identifier URI `api://750929bd-e2b6-4019-838c-365c36cbcb22` and API scope `access_as_user` (scope id `844beaa4-3c24-4a8a-a878-bc66c6dc7346`) are configured.
- Service principal (enterprise application) created for the app: object id `1ad4bd63-deab-4bf1-94a9-447fc0977ed0`.
- Self-referencing delegated permission added (`requiredResourceAccess` pointing at its own `appId`/`access_as_user` scope) plus `preAuthorizedApplications` entries for the well-known Teams/Office client app IDs, so users aren't prompted for consent inside Teams.
- **Admin consent granted** tenant-wide for `access_as_user` via an `oauth2PermissionGrants` record (`consentType: AllPrincipals`, grant id `Y73UGqve8UuUqUR_wJd-0GO91Bqr3vFLlKlEf8CXftA`).
- Added `https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect` as a Web redirect URI, and pre-authorized the Microsoft Enterprise token store client (`ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b`) for `access_as_user`, per the [Entra SSO auth config guide](https://learn.microsoft.com/microsoft-365/copilot/extensibility/plugin-authentication-entra-sso) Step 3.
- **Teams SSO client ID registration created** in Teams Developer Portal (Tools → "Microsoft Entra SSO client ID registration"):
  - Registration name: `ParkAssist Copilot MCP Auth`
  - Base URL: `https://parkassist-mcp.happyground-f091a09b.eastus.azurecontainerapps.io/mcp`
  - Restricted to Teams app `14e36884-3c9c-4c8c-a238-ce3a4acdc8f2`, org restricted to `Castletonstage.onmicrosoft.com`
  - Client (application) ID: `750929bd-e2b6-4019-838c-365c36cbcb22`, scope `access_as_user`
  - **Registration ID**: `1f35027f-bf09-40cf-b55b-3f1331b41048` → written to `MCP_AUTH_REGISTRATION_ID` in `env/.env.dev` and `env/.env.local`.
  - Generated **Application ID URI**: `api://auth-1f35027f-bf09-40cf-b55b-3f1331b41048/750929bd-e2b6-4019-838c-365c36cbcb22` → added to the Entra app's `identifierUris` (alongside the original `api://750929bd-e2b6-4019-838c-365c36cbcb22`).
- No client secret configured (not needed for Entra SSO / on-behalf-of flow).
- `Microsoft.App`, `Microsoft.OperationalInsights`, and `Microsoft.ContainerRegistry` were already registered on this subscription (no action needed).

## MCP service (Azure Container Apps) — LIVE

- Reused existing Container Apps environment `parkassist-copilot-env` (already present in `rg-parkassist-prod`, default domain `happyground-f091a09b.eastus.azurecontainerapps.io`).
- Created Azure Container Registry `acrparkassist6047` (Basic SKU, admin user enabled) and built/pushed the repo `Dockerfile` via `az acr build --registry acrparkassist6047 --image parkassist-mcp:latest .` (cloud build, no local Docker needed — succeeded in ~2m22s).
- Created Container App `parkassist-mcp` in `rg-parkassist-prod`, pulling from the ACR image, external ingress on target port 3000, 1 replica (min=max=1), 0.5 vCPU / 1.0Gi memory.
- Environment variables set: `AUTH_MODE=entra`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `PUBLIC_BASE_URL`, `CAMERA_SIGNING_SECRET` (freshly generated random secret, not committed anywhere), `NODE_ENV=production`, and `ALLOWED_HOSTS` (had to be added after first deploy — the server's Express host-header allowlist defaults to localhost only and rejected the real FQDN with a 400 until `ALLOWED_HOSTS` was set).
- **Live URL**: `https://parkassist-mcp.happyground-f091a09b.eastus.azurecontainerapps.io`
  - `GET /health` → `200 {"status":"ok","service":"parkassist-copilot","configuredSpaces":946}`
  - `GET /.well-known/oauth-protected-resource/mcp` → `200`, correctly advertises the Entra tenant's `/v2.0` authorization server and the `access_as_user` scope.
  - `POST /mcp` (no bearer token) → `401 Unauthorized` as expected (Entra auth enforcement working).
- `MCP_SERVER_URL=https://parkassist-mcp.happyground-f091a09b.eastus.azurecontainerapps.io/mcp` and `MCP_SERVER_HOST=parkassist-mcp.happyground-f091a09b.eastus.azurecontainerapps.io` written into `env/.env.dev` and `env/.env.local`.

## Microsoft 365 Agents Toolkit (Teams app)

- CLI: `@microsoft/m365agentstoolkit-cli` v1.1.16 (`atk`), installed globally.
- Signed in as `jffdnt@Castletonstage.onmicrosoft.com` via `atk auth login m365`.
- Ran `atk provision --env dev` against `m365agents.yml` (a `dev` env file was created at `env/.env.dev` alongside the tokens-only `env/.env.local` used by `scripts/package-agent.ps1`, because the toolkit reserves the `local` env name for a `m365agents.local.yml` debug profile that this repo doesn't have).
- Result: real Teams app created and extended to Microsoft 365.
  - `TEAMS_APP_ID`: `14e36884-3c9c-4c8c-a238-ce3a4acdc8f2`
  - `M365_TITLE_ID`: `T_8856b67d-8116-52bc-8aa2-e8395cffea77`
  - `M365_APP_ID`: `0d5ec794-5e22-42ca-a069-a694efac1359`
  - `TEAMS_APP_TENANT_ID`: `6efb014c-08b0-427f-a89b-8b9b20f8acad`
- The same `TEAMS_APP_ID` was mirrored into `env/.env.local` so `scripts/package-agent.ps1` produces a manifest with the real app ID too.
- Note: the first provision attempt reused a leftover placeholder value (`00000000-0000-0000-0000-000000000000`) from the example env file instead of generating a new ID — the toolkit only mints a fresh GUID when `TEAMS_APP_ID` is blank. Clearing the field before provisioning fixed it; watch for this if re-provisioning from a copied `.env` file.
- **Publisher metadata**: `PUBLISHER_EMAIL=jffdnt@gmail.com` (real). `PUBLISHER_WEBSITE_URL`/`PRIVACY_URL`/`TERMS_OF_USE_URL` are still placeholder `example.com` pages — acceptable for internal/personal use, but must be replaced with real reachable pages before Teams Store submission or `atk publish` validation against a public audience.
- **Manifest version fix**: `atk publish` failed validation with `VersionHasMajorLessThan1` because `appPackage/manifest.json` had `"version": "0.1.0"`. Bumped to `"1.0.0"` (Teams Store rule: major version must be ≥ 1).
- **Published**: `atk publish --env dev` succeeded — *"[ParkAssist Copilot-dev] is published successfully to Admin Portal"*. The app is now submitted to the tenant's Teams admin catalog (`https://aka.ms/teamsfx-mtac`) and is pending admin approval before it's available org-wide. All 61 Teams Store validation checks passed.

## Copilot Studio MCP tool connection — LIVE

- Added via the MCP onboarding wizard (Tools → Add a tool → Model Context Protocol) as **ParkAssist Garage MCP**, pointing at `https://parkassist-mcp.happyground-f091a09b.eastus.azurecontainerapps.io/mcp`, authentication **OAuth 2.0 (Manual)**.
- Reused the existing Entra app `750929bd-e2b6-4019-838c-365c36cbcb22` as both the OAuth client and the resource, per the setup doc's guidance. This required two changes beyond what the Teams SSO route needed:
  - **Client secret**: none existed (Teams OBO flow doesn't need one). Created one via `az ad app credential reset --id 750929bd-... --append --display-name "Copilot Studio MCP OAuth" --years 1`.
  - **Redirect URI**: Copilot Studio generates a connector-specific callback URL (`https://global.consent.azure-apim.net/redirect/fivebell-5fparkassist-20garage-20mcp-5f32f5df5297fc8ee8`) after the tool is created; added it to the app's Web redirect URIs via `az ad app update --web-redirect-uris ...` (kept the existing Teams and prior-attempt URIs too).
  - OAuth endpoints used: Authorization/Token/Refresh = `https://login.microsoftonline.com/6efb014c-08b0-427f-a89b-8b9b20f8acad/oauth2/v2.0/{authorize,token,token}`; Scope = `api://750929bd-e2b6-4019-838c-365c36cbcb22/access_as_user`.
- **Token version bug found and fixed**: the app's manifest had `api.requestedAccessTokenVersion: null`, so Entra issued v1.0-format tokens (`aud: api://750929bd-...`, `iss: https://sts.windows.net/.../`) even though the v2.0 endpoints were used. `src/server/auth.ts` only accepted the v2 GUID audience, so every call failed with `JWTClaimValidationFailed: unexpected "aud" claim value` (visible in `az containerapp logs show`, not surfaced clearly by Copilot Studio's UI — it just says "connection ... no longer valid" / "Entra access token is invalid or expired"). Two fixes were applied, both worth keeping:
  1. Set `api.requestedAccessTokenVersion: 2` on the app (`az rest --method PATCH .../applications/0b8d3128-235a-4884-af38-1f4043657a3a` with body `{"api":{"requestedAccessTokenVersion":2}}`) so future tokens are v2-format.
  2. Made `verifyEntraToken` in `src/server/auth.ts` accept **either** `config.entraClientId` (v2 GUID) or `` `api://${config.entraClientId}` `` (v1 URI) as valid audience — defensive regardless of which format Entra issues, including for the Teams/M365 OBO route which hasn't been end-to-end tested yet and could hit the same mismatch. Rebuilt via `az acr build --registry acrparkassist6047 --image parkassist-mcp:latest .` and deployed via `az containerapp update -n parkassist-mcp -g rg-parkassist-prod --image acrparkassist6047.azurecr.io/parkassist-mcp:latest`.
- **Gotcha**: after fixing auth, the tool still showed a cached "connection is no longer valid" error in the tool's detail pane even after recreating the connection and clicking "Refresh connector" — this was stale client-side UI state, not a real failure. A full page reload showed the tool's connection as genuinely "Not connected" (never actually bound); reselecting it from the Connection dropdown and clicking **Save** fixed the binding. The Tools **list** view (not the detail page) and, most reliably, an actual test-pane chat message are the trustworthy signals — the detail page's inline error banner can lag behind reality.
- **Verified live in the Test pane** (2026-09-11) — all four tools called successfully with real data:
  - "Give me a live overview of the 5 Bell garage." → 848 available / 47 occupied / 52 out of service / 130 stale feeds / 946 total.
  - "Which cameras have stale feeds? Show me the bay previews." → bay IDs, floor, image age listed.
  - "Show available General spaces on floor 5." → 84 results returned.
  - "Find plate ABC123." → correctly reported not found.
- **2026-09-12**: plate masking was deliberately removed at the user's request (see `src/server/services/parking-data.ts`, `docs/security.md`) — `search-license-plate` and `find-available-spaces` now return the full plate for every match, not just exact ones. Docs, tool descriptions, and the Copilot Studio agent instructions were updated to match; `copilotStudio/agent/agent.mcs.yml` and `appPackage/instruction.txt` still need to be pushed/republished to take effect on the live agent.
- **Gotcha — `az containerapp update --image ...:latest` can silently no-op**: redeploying twice with the `:latest` tag (once for the auth.ts audience fix, once for the plate-masking removal) never created a new revision or replica — `az containerapp revision list` kept showing only `parkassist-mcp--0000001` from the very first deploy, and `az containerapp replica list` confirmed the same pod (`...-zjjhg`, created at the initial deploy time) was still running both times. Container Apps apparently didn't detect a spec change because the image *reference string* was identical, even though the tag's content had changed in ACR. In practice this means **the auth.ts dual-audience fix was never actually live** during the "verified live in the Test pane" round above — that success was solely the `requestedAccessTokenVersion: 2` manifest change taking effect once Entra re-issued a v2-format token. Fix: build and deploy with a unique, immutable tag (e.g. `az acr build --registry acrparkassist6047 --image parkassist-mcp:$(date -u +%Y%m%d-%H%M%S) --image parkassist-mcp:latest .`, then `az containerapp update --image acrparkassist6047.azurecr.io/parkassist-mcp:<that tag>`) and confirm with `az containerapp revision list` / `replica list` that a new revision and replica actually appeared before trusting a deploy. The plate-masking removal was redeployed this way and confirmed live (full plates like `WGF5250` returned in a fresh Test pane conversation) — the auth.ts dual-audience fix rode along in the same image and is now genuinely live too, just untested in isolation.
- **Gotcha — same-thread chat responses can look stale even when the fix is live**: right after the (eventually real) redeploy, re-asking the same plate question *in the same Test pane conversation* still returned masked-looking plates identical to earlier turns. This was the model echoing its own prior answers for conversational consistency, not a real masking bug — a **new Test session** (the "Start new test session" icon, top-right of the test pane) immediately showed full plates. When verifying a server-side fix in Copilot Studio's test pane, always start a fresh conversation rather than continuing an existing one.

## Published (2026-09-12)

- Clicked **Publish** in Copilot Studio (without "Force newest version" — no active users yet) — confirmed *"Your agent was published at 7:36 PM on 9/11/2026!"*. The MCP tool and current instructions are now the published version for any connected channel.
- **Re-published** after the workspace sync and settings fix above — confirmed *"Your agent was published at 7:49 PM on 9/11/2026!"*. This publish includes the hardened instructions (pushed via `pac copilot push`) and the disabled model-knowledge/web/file/semantic-search settings; the first publish did not.

## Teams admin approval (2026-09-12) — DONE

- Teams Admin Center (`https://admin.teams.microsoft.com` → Teams apps → Manage apps) showed **ParkAssist Copilot-dev** (App ID `2a51960b-58de-48f3-be6c-b9859c1544cc`, submitted by Jeffrey Dent) as 1 pending custom-app approval. Permissions tab showed "This app will not get any permissions when installed" — no elevated Teams/Graph permissions requested. Approved via **Publish** in the app's detail page (confirmed with default org-wide availability). Status may take a few hours to propagate per Teams' own message.

## Teams/M365 Copilot SSO (on-behalf-of) route — TESTED, NOT WORKING

Installed **ParkAssist Copilot-dev** from Teams' app store (`Apps → Built for your org`) and opened it in Microsoft 365 Copilot chat (`teams.cloud.microsoft` → Copilot). This exercises a completely different path from Copilot Studio: the declarative-agent plugin in `appPackage/` (`ai-plugin.json`, `auth.type: OAuthPluginVault`, `reference_id` = the Entra SSO client registration `1f35027f-bf09-40cf-b55b-3f1331b41048`), calling the same MCP server directly.

- Every tool invocation (garage-overview, find-available-spaces) fails with a generic *"the parking status service is currently unavailable"* / *"the request failed"* message — no specific error surfaced to the user.
- **Confirmed via `az containerapp logs show` that the request never reaches the MCP server at all** — no new log lines appear for any of these attempts, even though the exact same server correctly handles Copilot Studio's calls seconds apart. This rules out `auth.ts` (the v1/v2 audience fix, the dual-audience fix, `ALLOWED_HOSTS`, etc.) as the cause — the failure is entirely upstream, inside Microsoft's plugin/SSO infrastructure or this app's plugin config.
- Enabled Copilot **developer mode** (`-developer on` in the chat, per [enabling developer mode](https://learn.microsoft.com/microsoft-365/copilot/extensibility/prerequisites#enabling-developer-mode)) to try to get the debug information card documented in [Troubleshoot MCP and API plugin authentication](https://learn.microsoft.com/microsoft-365/copilot/extensibility/plugin-authentication-troubleshooting) — no debug card, no sign-in prompt, and no additional detail appeared; the response text was identical to without developer mode.
- Manually re-verified every value the troubleshooting doc calls out as a common cause, all correct: `ai-plugin.dev.json`'s `reference_id` (`1f35027f-...`) matches the Entra SSO registration ID in Teams Developer Portal; the registration's **Base URL** (`https://parkassist-mcp.happyground-f091a09b.eastus.azurecontainerapps.io/mcp`) matches the plugin's `runtimes[0].spec.url` exactly; **Teams app ID** restriction matches (`14e36884-...`); the registration's **Client (application) ID** (`750929bd-...`) and **scope** (`access_as_user`) match the Entra app. This app has no `bots`/`composeExtensions` entry (`composeExtensions: []` in manifest.json) — it's declarative-agent-only, so there's no separate Teams-bot chat surface to fall back to for comparison.
- Found a Microsoft Q&A thread ([M365 Copilot - Cowork cannot make a connection to custom MCP](https://learn.microsoft.com/answers/a/12775868)) describing the identical symptom for a different custom MCP plugin: works when configured correctly, but the "Connect"/auth step silently does nothing in the M365 Copilot surface specifically. This, plus the total absence of any request reaching our server or any debug/sign-in UI appearing, points to a **Microsoft-side reliability or preview-feature limitation** in the `OAuthPluginVault` + `RemoteMCPServer` combination for M365 Copilot chat, rather than a fixable misconfiguration in this repo.
- **Superseded 2026-09-12** — see "M365 Copilot route rebuilt on Copilot Components" below. Rather than keep chasing the `OAuthPluginVault` failure, the M365 route was rebuilt on SPFx Copilot Components, which removes that mechanism entirely. The declarative agent in `appPackage/` is now the legacy path.
- **Not tried before the rebuild**: testing from the Teams desktop or mobile client instead of the web/`teams.cloud.microsoft` surface; opening a Microsoft support case.

## M365 Copilot route rebuilt on Copilot Components (2026-09-12) — WORKING

The `OAuthPluginVault` + `RemoteMCPServer` route above never reached our server. **SPFx Copilot Components** (SPFx 1.24 preview; called "SharePoint Copilot Apps" in the July preview) replace it, and the new route is verified working end to end. Source lives in `copilotComponent/`.

### Why this fixes it

Copilot Components are the same MCP Apps model, but Microsoft hosts the component inside the tenant. The build merges your component's tools into `ai-plugin.json` and emits `"auth": { "type": "None" }` against a Microsoft-hosted `{{TENANT_MCP_URL}}` — **there is no `OAuthPluginVault` and no Enterprise Token Store OBO anywhere in the pipeline**, so the exact mechanism that was silently failing is gone. The component instead runs client-side in the tenant and calls ParkAssist directly with the signed-in user's delegated token via `AadHttpClient`, which `src/server/auth.ts` already validates (audience + `access_as_user`).

A prerequisite finding: this model was previously blocked in this same tenant by a widget-sandbox bug (empty `ui/csp`, nested iframe never initialized) documented in `C:\dev\16_CopilotApp\adr\ADR-003`. **SPFx 1.24.0-beta.3 (2026-08-27) fixes it** — beta.3 emits a populated `ui/csp` block and adds build-time agent-manifest validation. That was confirmed by upgrading and redeploying the sibling project before any ParkAssist work started.

### Server changes

- Added four read-only endpoints in `src/server/index.ts`, all behind the same `requireMcpAuthorization` as `/mcp` and registered through a shared `registerComponentRoute` helper: `GET /api/overview`, `/api/available-spaces`, `/api/plate-search`, and `/api/stale-feeds`. The SPFx components need plain REST; making them speak MCP JSON-RPC (initialize → session id → `tools/call`) from the browser would be needless complexity. `/api/plate-search` enforces the three-character minimum server-side, because the Copilot v2.4 parameter subset drops schema constraints (see Gotchas).
- Added scoped CORS for `/api/*` driven by a new `CORS_ALLOWED_ORIGINS` env var (`src/server/config.ts`). The MCP transport never needed CORS; the component does, because it runs on the tenant's SharePoint origin. Set to `https://castletonstage.sharepoint.com` on the Container App. Verified: allowed origin gets the header, other origins get none.
- Fixed `.dockerignore` — bare `node_modules`/`dist` only match the context root, so `copilotComponent/node_modules` was being uploaded to ACR. Added `**/` variants and excluded `copilotComponent` outright.

### SPFx solution (`copilotComponent/`)

- Scaffolded non-interactively: `yo @microsoft/sharepoint --solution-name copilotComponent --component-type copilotComponent --component-name StaleCameraFeeds --framework react --plusbeta --skip-feature-deployment`. Additional components are added by re-running the generator inside the solution with `--component-type copilotComponent --component-name <Name> --skip-install`; it mints the GUID and wires `config/config.json` and `config/copilot-agent.json` automatically.
- **Four components, matching the four MCP tools**: `garageOverview` (GarageOverviewTool), `availableSpaces` (AvailableSpacesTool), `plateSearch` (PlateSearchTool), and `staleCameraFeeds` (StaleCameraFeedsTool).
- Shared code lives in `src/components/`: `BaseGarageComponent` (load → publish model context → render lifecycle), `GarageShell` (host theming, header, expand/collapse), and `BayGrid`. `src/services/ParkAssistService.ts` exposes one method per endpoint against a single typed response envelope, since every endpoint returns the same shape.
- All four call through `AadHttpClient` against resource `api://750929bd-e2b6-4019-838c-365c36cbcb22`.
- `config/package-solution.json` declares `webApiPermissionRequests` for resource **`ParkAssist Copilot`** / `access_as_user`. The resource string must match the Entra app's display name exactly — ADR-003 §2.1 lost time to this with a mismatched name. Approved once in SharePoint Admin Center → Advanced → API access (the `m365 spo serviceprincipal permissionrequest` commands still fail with "unauthorized operation", as ADR-003 §2.4 found).
- The component pushes `updateModelContextAsync({ content, structuredContent })` after loading so Copilot can answer follow-ups about the data.

### Deployment steps

1. `npx heft build --production && npx heft package-solution --production`.
2. `m365 spo app add --filePath ./sharepoint/solution/parkassist-garage-copilot-component.sppkg --appCatalogScope tenant --overwrite`, then `m365 spo app deploy`.
3. Approve the API permission request in SharePoint Admin Center → Advanced → API access.
4. In the app catalog UI: select the app → **Add to all sites** (enforced prerequisite) → **Add to Teams**. Still no CLI equivalent for the `SyncSolutionToTeams` step.
5. In Microsoft 365 Copilot → More agents → Agent Store → "Built by your org" → **ParkAssist Garage** → Add.

### Verified 2026-09-12

- Card renders inline and in fullscreen with live data: *"125 stale or missing across all floors · threshold 15 min"*, real bay IDs/floors/ages, and the HMAC-signed camera previews loading correctly.
- Follow-up question returned model-visible data: *"Total stale or missing camera feeds: 123 … using a 15-minute staleness threshold"* plus a full Bay ID/Space table for floor 7. The 125→123 difference across the two snapshots is live data moving, which also confirms it is not cached.

### Gotchas

- **`updateModelContextAsync` lands on the *next* user message, not the current turn.** On the first turn the agent said it "returned an interactive component" but could not list details. That is by design — the API docs state each call overwrites the previous context and is sent to the model on the next message. Use `sendFollowUpMessageAsync` if an immediate narrated turn is ever needed.
- The build strips unsupported JSON Schema keywords from tool parameters: `Stripped unsupported schema keyword(s) … [exclusiveMinimum, additionalProperties, $schema]`. Zod refinements like `.positive()` do not survive into the Copilot-facing schema — enforce them server-side (we do).
- Probing a freshly deployed Container App revision can race container startup. `/api/stale-feeds` returned 404 at 02:18:52 while the new container only logged "listening" at 02:18:57; it returned the correct 401 moments later. Check the startup log line before concluding a route is missing.
- **Agent-catalog propagation lags the app-catalog deploy, and the agent keeps serving its old toolset until it catches up.** After deploying v1.1.0.0 with four tools, Copilot still answered *"GarageOverviewTool … isn't available in my current toolset"* and kept routing everything to the only tool it knew. A new conversation does not help — the toolset is bound to the synced agent version, not the session. Bump `copilot/manifest.json` `version` on every change (the overview docs require this or the old definition sticks), re-run **Add to all sites** → **Add to Teams**, then wait. Note that re-uploading a package also resets "Added to all sites" back to No, so both steps must be repeated on every upgrade.
- Also noticed **`appPackage/build/ai-plugin.dev.json` is stale** — it still has the pre-2026-09-12 "partial matches remain masked" tool description. Unrelated to the SSO failure, but re-run `./scripts/package-agent.ps1` (or `atk provision`/`publish`) before relying on this package again so the tool descriptions match the current no-masking behavior.
- **Re-published** after the workspace sync and settings fix above — confirmed *"Your agent was published at 7:49 PM on 9/11/2026!"*. This publish includes the hardened instructions (pushed via `pac copilot push`) and the disabled model-knowledge/web/file/semantic-search settings; the first publish did not.
