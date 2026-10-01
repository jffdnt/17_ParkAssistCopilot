# Deployment state

Workspace reviewed, public health/auth probed, and tenant deployment in progress: 2026-10-01.

## Current route summary

- **Microsoft 365 Copilot primary pilot:** SPFx Copilot UX components → delegated REST calls → interactive dashboard, camera-result grids, refresh, narration, and fullscreen UI.
- **Teams and text fallback:** Copilot Studio → delegated Power Platform MCP connection → same-turn model-visible text/structured content. Its checked-in name is **ParkAssist Garage Text** so users can distinguish it from the interactive pilot.
- **Legacy:** the direct declarative-agent package in `appPackage/` is retained for history but its `OAuthPluginVault` route is not the deployment target.
- Public probe on 2026-10-01: `/health` returned 200 with 946 configured spaces, OAuth resource metadata returned 200, and unauthenticated `/mcp` returned 401.

## Interactive pilot rollout (2026-10-01)

- Implemented shared live metrics, camera-result grids, responsive header actions, in-place **Refresh**, context-aware **Summarize**, and fullscreen expansion across all four Copilot UX components.
- Bumped both the SharePoint solution and declarative-agent manifest to `1.7.0`; the production build, 5 SPFx tests, 31 service/widget tests, TypeScript checks, package validation, root build, and release readiness check pass.
- Uploaded the generated `.sppkg` over the existing catalog item (source and package retained), deployed it, and confirmed the catalog reports version `1.7.0.0`, Enabled, Valid, and Added to all sites. No old tenant entry or OAuth connection was deleted.
- Triggered **Add to Teams** from the App Catalog. Microsoft 365 currently exposes both an obsolete `ParkAssist Copilot-dev` entry and the installed **ParkAssist Garage** component agent (`T_0578f3fd-7dba-04a7-45c8-4df50572adc8`). The obsolete entry failed before reaching `/api/overview`; the correct installed entry rendered successfully. Do not use `ParkAssist Copilot-dev` for acceptance.
- **Interactive acceptance passed.** The overview rendered 946 configured, 944 reporting, 195 available, 700 occupied, 52 out of service, 74% occupancy, 54 missing feeds, and 28 offline sensors. **Refresh** produced a new generated time and new live totals, **Summarize** quoted the published context without another tool call, and **Expand** opened the full content-preview panel.
- **Camera acceptance passed.** `Which cameras are stale on floors 7-9? Show me the bay previews.` rendered 97 affected spaces, a correct floor breakdown (47/100, 0/110, 50/106), a coverage notice, and 12 signed live camera images.
- The UI is serving the `1.7.0.0` SharePoint assets, but the host's installed-agent metadata still advertises Teams manifest `1.6.0` and the prior first-turn wording. Re-check agent-catalog propagation later; this does not block the dashboard or images, but the refreshed declarative-agent instructions should eventually replace “card” with “interactive live dashboard.”
- The Copilot Studio fallback workspace and live agent were renamed to **ParkAssist Garage Text**. Agent `d92774c9-4171-446a-9d7c-485bb0b4a850` was republished successfully at `2026-10-01 18:07:08`; `pac copilot list` now reports the new name with Published / Active / Provisioned state. The previously installed Microsoft 365 channel package may retain its old display name until its channel package is regenerated/reinstalled.

## Production hardening rollout (2026-10-01)

- The fail-closed production configuration, plate-data minimization, bounded REST validation, structured privacy-safe access logs, per-replica rate limiting, `/ready`, build-time Copilot Component environment injection, CI coverage, release guardrails, and Bicep deployment path are implemented and locally verified.
- Azure `what-if` was reviewed before rollout. Image `parkassist-mcp:20261001-hardening1` is live as healthy revision `parkassist-mcp--0000009` at 100% traffic. `/health` returns 946 configured spaces and `/ready` returns 944 live spaces.
- The Container App now uses user-assigned identity `id-parkassist-prod` for ACR pulls, liveness/readiness probes, secret-backed camera signing, and 1-2 replica HTTP-concurrency scaling. The ACR admin account is disabled.
- The camera-signing secret was rotated during deployment; previously issued five-minute image links expired naturally.
- The Copilot Component stack was upgraded and build-tested on `1.24.0-beta.5`. Package `1.7.0.0` is valid, enabled, deployed tenant-wide, and is the primary Microsoft 365 pilot package while agent-catalog propagation is verified.
- The Copilot Studio Microsoft 365 channel was activated with **Make agent available in Microsoft 365 Copilot** selected. Package version `1.0.4`, title ID `T_3600a791-cafc-ae46-1d56-4224e22705dd`, was installed for the maker account and verified with a non-sensitive live overview.
- Publisher metadata now points to the reachable ParkAssist pages at `https://jffdnt.github.io/parkassist/`. The source repository has a private GitHub remote at `https://github.com/jffdnt/17_ParkAssistCopilot`.
- The release-readiness check passes. The remaining warning is structural: the primary SharePoint Copilot App is still a Microsoft preview feature, so the Copilot Studio fallback remains required.

## Power Platform

- Environment: `https://orgdc7bf008.crm.dynamics.com/` (`Jeffrey Dent's Environment`)
- Existing canvas solution: `5BellParkAssist`
- Publisher prefix: `fivebell`
- Copilot solution: `fivebell_ParkAssistCopilot`
- Copilot Studio fallback agent: `ParkAssist Garage Text`
- Agent ID: `d92774c9-4171-446a-9d7c-485bb0b4a850`
- Agent state reported by `pac copilot list`: Active / Provisioned / Published
- MCP tool connection: replacement persistent OAuth 2.0 Manual connection created for the maker account and verified live — see "Copilot Studio MCP tool connection" below.
- Teams uses the Copilot Studio/MCP fallback route; Microsoft 365 pilots the SPFx Copilot UX route first.

The CLI 2.8.1 `pac copilot init` operation imported the minimal agent solution as part of workspace generation. The checked-in workspace's hardened instructions have since been pushed live (see below).

## Previous Microsoft 365 Copilot Studio route (2026-10-01) — TEXT FALLBACK

- The earlier SPFx agent reproduced two unacceptable first-turn behaviors in the Microsoft 365 desktop client: `updateModelContextAsync` cannot make the component payload available to the current model turn, and the PortableComponent host rendered a SharePoint error surface instead of the ParkAssist UI. Version `1.7.0` now treats the UI as the first-turn answer and offers a **Summarize** action that explicitly creates the next, context-aware model turn.
- The Copilot Studio agent instructions require `garage-overview` answers to quote the returned configured-space, occupancy, availability, out-of-service, and camera-health numbers in the same turn. It must never redirect the user to a card or payload for values the tool returned. Its current source name is **ParkAssist Garage Text**.
- `pac copilot push` and an immutable-ID publish updated agent `d92774c9-4171-446a-9d7c-485bb0b4a850`. The remote record is Active / Provisioned / Published with publish time `2026-10-01T16:47:52Z`.
- The Microsoft 365 and Microsoft Teams channel had the Microsoft 365 checkbox selected but had never been added. The channel is now active. The generated Microsoft 365 package is version `1.0.4`, title ID `T_3600a791-cafc-ae46-1d56-4224e22705dd`, with agent application ID `27d8b970-fee0-415c-9d8b-acf4705d08d5`.
- The prior conversation's MCP connection reference was stale and inaccessible. Replacement persistent OAuth connection `bb925b30aeee4cadb9d78dffa35c3d1e`, using `api://750929bd-e2b6-4019-838c-365c36cbcb22/access_as_user`, was created and connected for `jffdnt@Castletonstage.onmicrosoft.com`. The pre-existing user connection `7ad06f52a0e940a7bcf66f98acddda39` also currently reports Connected; it was not deleted.
- Non-sensitive Copilot Studio acceptance returned live same-turn text: 186 available, 709 occupied, 52 out of service, and 24 stale camera feeds at `2026-10-01 16:58 UTC`.
- After installation in Microsoft 365 Copilot, the same prompt returned live same-turn text: 195 available, 700 occupied, 52 out of service, 0 stale camera feeds, and 74% occupancy at `2026-10-01 17:00 UTC`. The changing figures are expected point-in-time snapshots and prove the model received the live tool result.
- The SPFx tenant package was deliberately retained and has since been upgraded in place to `1.7.0.0`; removing it is not part of the current plan.

## Copilot Studio workspace sync (2026-09-12)

- `pac copilot clone --bot d92774c9-4171-446a-9d7c-485bb0b4a850` into a scratch directory captured the `.mcs/` sync-tracking folder (`botdefinition.json`, `changetoken.txt`, `conn.json`) plus artifacts generated when the MCP tool was added: `connectionreferences.mcs.yml`, `agents/topic.ParkAssistGarageMCP.mcs.yml`, and `connectors/fivebell_5Fparkassist-20garage-20mcp-.../`. `pac copilot pull --project-dir ./copilotStudio/agent` alone reported "0 changes" because a fresh clone's changetoken is already at HEAD — the artifacts had to be copied in manually from the clone, not pulled incrementally. All copied into `copilotStudio/agent/` (the `.mcs/` folder is gitignored via its own nested `.gitignore`).
- `pac copilot push --project-dir ./copilotStudio/agent` then pushed the hardened instructions (and `gptCapabilities.webBrowsing: false`) live — confirmed via a fresh `pac copilot clone` that the remote `agent.mcs.yml` now matches.
- **Found a real gap**: the live agent's `aISettings` (`useModelKnowledge`, `isFileAnalysisEnabled`, `isSemanticSearchEnabled`) were all `true`, contradicting the checked-in `settings.mcs.yml` (`false`) and the documented hardened design ("garage facts must come from the four live MCP tools rather than general model knowledge" — this repo's README/copilotStudio README). `pac copilot push` does not touch these fields. Fixed directly in the maker portal: Settings → Generative AI → turned off "Allow ungrounded responses," "Use information from the Web," "File uploads," and "Tenant graph grounding with semantic search." Verified via a fresh `pac copilot clone` that all three `aISettings` flags are now `false`. `copilotStudio/agent/settings.mcs.yml` was updated to match (also picked up a `contentModeration: High` field that Copilot Studio now serializes).
- **Gotcha**: saving Settings while a concurrent `pac copilot push` (or another save) is in flight fails with `HTTP PreconditionFailed ... ConcurrencyVersionMismatch`. Fix is to click "Discard changes" and redo the edit on the refreshed page — don't retry the same save blindly.
- The agent was initially published before this workspace sync and settings fix, then re-published afterward as recorded in "Published" below.

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
- **Published**: `atk publish --env dev` succeeded — *"[ParkAssist Copilot-dev] is published successfully to Admin Portal"*. It was pending admin approval at this point in the chronology; approval was completed later as recorded below. All 61 Teams Store validation checks passed.

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
- **2026-09-12**: plate masking was deliberately removed at the user's request. Both partial and exact occupied-bay searches return the full matching plate. The agent was subsequently republished as recorded below. The 2026-10-01 hardening pass further limited machine-readable plate fields to the plate-search result; stale-feed and availability responses omit them.
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

## M365 Copilot route rebuilt on Copilot Components (2026-09-12; promoted again 2026-10-01)

The `OAuthPluginVault` + `RemoteMCPServer` route above never reached our server. **SPFx Copilot Components** (SPFx 1.24 preview; called "SharePoint Copilot Apps" in the July preview) replaced it at the time, and the web route was verified end to end. A later Microsoft 365 desktop host failure temporarily moved the active route to Copilot Studio. Version `1.7.0` promotes the component route again with an explicit dashboard-first first turn and a user-triggered narration follow-up; Copilot Studio is retained as the fallback.

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

### Verified 2026-09-12 — all four tools

Each tool was exercised in Microsoft 365 Copilot with natural language (not just direct `Call <Tool>` invocations), confirming the orchestrator routes correctly, the card renders, and the follow-up model context lands.

- **StaleCameraFeedsTool** — *"125 stale or missing across all floors · threshold 15 min"*, real bay IDs/floors/ages, HMAC-signed camera previews loading. Follow-up returned *"Total stale or missing camera feeds: 123"* plus a full Bay ID/Space table for floor 7. The 125→123 drift across snapshots confirms live, uncached data.
- **GarageOverviewTool** — all nine metric tiles populated: 853 available, 42 occupied, 0 reserved, 52 out of service, 65 stale feeds, 9 missing feeds, 47 offline sensors, 946 configured, 4% occupancy. The 946 matches `/health`'s `configuredSpaces`. Follow-up correctly reported occupancy percent, configured spaces, offline sensors, and the live-reporting count (944 of 946).
- **AvailableSpacesTool** — *"91 available across floor 5"* with the floor filter applied from natural language, designations shown, camera previews suppressed (they add nothing for a vacancy list), and a "79 more … narrow by floor or designation" hint.
- **PlateSearchTool** — partial query `XDK` returned 2 matches: Space 5D (XDK9692, floor 5) and Space B11 (XDK9583, floor 8), full plates shown per the no-masking decision. A non-matching query renders a clean "No occupied spaces match that plate right now" state.

**Bug found and fixed during verification**: the overview card initially showed em-dashes for Configured spaces and Occupancy because `IGarageMetrics` guessed at field names. The server's `GarageMetrics` contract uses `configured` and `occupancyPercent` (already a percentage, not a 0–1 rate), not `totalSpaces`/`occupancyRate`. Corrected, and the previously-dropped `reserved`, `missingFeeds`, `offlineSensors`, and `live` fields are now surfaced too.

**Camera previews on all bay views (added after the initial four-tool verification).** Originally only the stale-feed path signed camera URLs, so plate matches rendered a "No telemetry" placeholder exactly where a preview helps most — confirming you have found the right vehicle. `includeImage` is now a `ListOptions` flag, defaulting to `false` so the MCP tools keep their existing payloads, and `/api/plate-search` and `/api/available-spaces` opt in. Verified live: plate search for `XDK` renders both matches with real photos alongside their plates, and availability renders a photo per space.

One consequence worth knowing: the availability card originally hid the camera-age badge, which became misleading once photos appeared, because a snapshot can be stale while the sensor is current. The badge is back on for availability. Note also that these overhead cameras cover more than one bay, so a vehicle visible in frame is not necessarily in *that* bay — the age badge plus the bay label are what make a photo interpretable.

### Floor-scoped, definitive answers (2026-09-12)

Asking *"which cameras are stale on the 7-9 floors"* produced no usable answer, in either the card or the agent's prose. Three separate defects stacked up:

1. **No way to express a floor range.** Both list tools took a single `floor` integer, so Copilot's only options were to call for one floor (silently dropping two) or omit the filter entirely (answering about the whole garage). Neither answers the question.
2. **Per-floor counts were not derivable by any client.** A caller receives one page of bays — 12 of them — while `totalMatches` can be in the hundreds. Nothing in the payload split the total by floor, and counting the returned page understates every floor. Verified how badly: with no floor filter the 12-bay page for this garage contains *only floor 7* bays, because the sort is by staleness descending. A card built from that page would show floor 7 photos under the heading "98 across all floors" while the user asked about 7 through 9.
3. **The stale-feeds card never said it was truncated.** The availability card had a "N more" hint; this one did not, so 12 of 125 looked like the complete set.

Fixes, server side:

- `ListOptions.floors?: number[]` on `findAvailableSpaces` and `getStaleCameraFeeds`, superseding `floor` (kept for callers already in the field). A set rather than a min/max range, so "floors 2 and 9" costs nothing extra.
- `GarageToolResult.floorBreakdown` — `{ floor, count, configured }` per floor, computed over the **whole** match set before paging, so it is the only trustworthy per-floor source. Floors that were asked about but matched nothing stay in the list at zero: "floor 8: 0" is an answer, an absent row is an ambiguity.
- `GarageToolResult.configuredInScope` gives the count a denominator, so the summary reads "47 of the 316 mapped spaces on floors 7-9" rather than a bare 47.
- `describeFloors` collapses a contiguous run, so the answer reads back the scope the way it was asked: "on floors 7-9", "on floors 1, 5 and 11", "on floor 7".
- `fallbackText` in `mcp.ts` now leads with that summary, adds the per-floor line, and states whether the listed bays are all of them. This is the model-visible text for the **Copilot Studio** route, which does get it in the same turn.
- `baseResult` took its optional tail as an object; it had reached the point where call sites passed `undefined` to skip a parameter.

Fixes, component side:

- `ResultSummary` renders the answer sentence, a per-floor badge row, and a coverage line ("Every match is shown below." / "35 more are not shown…") above the grid on both list cards. The grid shows examples; this block is what makes the card answer the question.
- The model context leads with the same sentence and adds `answer`, `floorBreakdown`, `configuredInScope`, `listedBays`, and `isCompleteList` to `structuredContent`, plus an explicit "All N are listed below" / "the remainder are not in this payload" line — without it the model reads a 12-row list as the total.
- Instructions tell the agent to pass `floors` whenever any floor is named, never to answer a multi-floor question from a single-floor call, and never to count the listed bays to produce a total.

**The `floors` tool parameter is a string (`"7-9"`, `"2,5,9"`), not an array, on the SPFx route only.** This host is documented below to strip schema keywords it cannot carry, and a stripped parameter does not fail loudly — it silently widens the query to the whole garage, which is the exact bug being fixed. A string parameter is known to survive the pipeline, and `parseFloors` expands ranges, lists, `to`/`through`, and reversed bounds client-side. The build output confirms it survives intact. The MCP route keeps a real integer array, since MCP carries full JSON Schema.

Verified locally against live data before deploying (`AUTH_MODE=none` on port 3099, 946 configured spaces):

| Query | Result |
| --- | --- |
| `?floors=7,8,9` | "47 of the 316 mapped spaces on floors 7-9…", breakdown floor 7: 47 of 100, floor 8: 0 of 110, floor 9: 0 of 106 |
| `?floors=8,9` | "0 of the 216 mapped spaces on floors 8-9…", `hasMore: false` |
| `?floors=1,5,11` | "…on floors 1, 5 and 11", all 2 matches listed, complete |
| no filter | "98 of the 946 mapped spaces across all floors…", page contains only floor 7 |
| `/api/plate-search`, `/api/overview` | unchanged, no breakdown, previews intact |

The operational finding worth keeping: **every one of the 47 stale feeds on floors 7-9 is on floor 7, and they are ~6.8 days old** (`thumbnailAgeMinutes` ≈ 9,806). Floors 8 and 9 are completely clean. That is precisely the answer the old card could not give.

**Deployed 2026-09-12.** Server image `parkassist-mcp:20260912-154542` built via `az acr build --no-logs` (that flag avoids the Windows log-streaming `UnicodeEncodeError` noted below), rolled out as revision `parkassist-mcp--0000006`, confirmed by `az containerapp revision list` showing the new tag with 1 replica and the container logging "listening" at 16:11:12. Live `/api/stale-feeds?floors=7,8,9` returns 401 rather than 404, so the route exists and Entra is enforced; `/health` reports 946 configured spaces. SPFx `v1.5.0.0` uploaded and deployed to the tenant app catalog (`Deployed: True`, `IsEnabled: True`).

Two things could not be verified from the CLI and are unchanged limitations, not new failures:

- `m365 spo serviceprincipal permissionrequest list` / `grant list` still fail with "Attempted to perform an unauthorized operation" in this tenant (ADR-003 §2.4). The `webApiPermissionRequests` entry is unchanged (`ParkAssist Copilot` / `access_as_user`), so the existing approval should carry; if it did not, the component renders its "Could not load camera health: … 401" state rather than failing silently.
- `m365 teams app list` needs an `AppCatalog.*` scope this CLI connection was not consented for, so the synced agent version cannot be read. **Add to all sites → Add to Teams** still has no CLI equivalent and must be repeated after every upload.

A delegated token for an end-to-end live probe was not obtained: `az account get-access-token --resource api://750929bd-…` requires an interactive `az login --scope api://…/.default`, which would have to replace the existing az session. The server behaviour was instead verified locally against the same live upstream data (table above), and the live deployment verified by revision, replica, startup log, and auth response.

### Adaptive Card scoped to the requested floors (2026-09-12)

The Adaptive Cards are what the **Copilot Studio / Teams** route renders (the SPFx Copilot Components render only in the Microsoft 365 Copilot UX — see the surface note in Gotchas), and they carried a version of the same mismatch the SPFx card had just been fixed for. `buildAdaptiveCard` hardcoded garage-wide `result.metrics`, so a floor-scoped query put "Stale feeds: 89" directly beneath "47 of the 316 mapped spaces on floors 7-9" — two correct numbers answering different questions.

- `computeMetrics` was extracted out of `getSnapshot` so the same definitions can be applied to a floor subset, and the filtered list views now also return `metricsInScope` (`GarageToolResult.metricsInScope`). The card prefers it and falls back to `metrics`, so the overview is untouched.
- The card names its scope ("Floors 7-9" / "Floor 7" / "Garage-wide") above the counters. Labelling is what makes them unambiguous; scoping alone would still leave the reader guessing.
- The FactSet is view-aware. Camera health reports **stale and missing separately**, because the summary counts them together: 45 stale + 2 missing = the 47 in the summary. A lone "Stale feeds: 45" under a summary of 47 reads as an error. Availability reports the reasons a space is unusable (available / occupied / reserved / out of service) rather than camera state.
- The per-floor breakdown is a second FactSet ("Floor 7 — 47 of 100"), drawn only when more than one floor is in scope.
- **Truncation notice fixed**: it was keyed to `hasMore`, which describes the 12-item *page*, while the card renders at most 6 bays. With 8 matches, `hasMore` was false and the card showed 6 rows saying nothing. It now keys off what is actually displayed ("Showing 6 of 47") and the narrowing hint is view-aware — the old text told availability users to "raise the threshold", which that view does not have.

Verified locally against live data, then deployed as `parkassist-mcp:20260912-181236` / revision `parkassist-mcp--0000007` (new replica `…-ksx77`, "listening" at 18:15:57, `/health` 946 spaces, `/api/stale-feeds?floors=7,8,9` returns 401 as expected without a token):

| View | Card |
| --- | --- |
| stale feeds, floors 7-9 | "Floors 7-9" · stale 45, missing 2, offline 47, OOS 47 · floor 7: 47 of 100, floor 8: 0 of 110, floor 9: 0 of 106 · "Showing 6 of 47" |
| availability, floors 7-9 | "Floors 7-9" · available 264 · floor 7: 53 of 100, floor 8: 107 of 110, floor 9: 104 of 106 (sums to 264) |
| overview, plate search | "Garage-wide", counters and behaviour unchanged |

No SPFx redeploy was needed — this is server-only, and the components do not read `adaptiveCard`.

### Gotchas

- **Copilot Components render only in the Microsoft 365 Copilot UX during public preview.** Microsoft states this in both [Overview of SharePoint Copilot Apps](https://learn.microsoft.com/sharepoint/dev/spfx/copilot/overview-copilot-apps) ("During the public preview, SharePoint Copilot Apps render only in the Microsoft 365 Copilot user experience") and its Known issues ("Copilot UX only … Support for other surfaces and hosting options is in the works"). The components are therefore the Microsoft 365 pilot UI, while Copilot Studio remains the Teams and text fallback.
- **"Add to Teams" in the app catalog does not make the app work in Teams.** It publishes the declarative agent to the tenant agent catalog; per the overview docs, "The label of this button will be updated in a future release to better reflect that it also publishes the agent." It is still the required step, just misleadingly named.
- **A stripped tool parameter fails silently, so prefer shapes known to survive.** The build logs which keywords it drops (`Stripped unsupported schema keyword(s) … [additionalProperties, $schema]`), but a dropped *parameter* produces no warning at all — the tool is simply called without it, and a missing filter reads as "no filter", which is a wrong answer rather than an error. This is why the SPFx `floors` parameter is a string the component parses rather than an integer array.
- **`updateModelContextAsync` lands on the *next* user message, not the current turn.** On the first turn the agent said it "returned an interactive component" but could not list details. That is by design — the API docs state each call overwrites the previous context and is sent to the model on the next message. Use `sendFollowUpMessageAsync` if an immediate narrated turn is ever needed.
- The build strips unsupported JSON Schema keywords from tool parameters: `Stripped unsupported schema keyword(s) … [exclusiveMinimum, additionalProperties, $schema]`. Zod refinements like `.positive()` do not survive into the Copilot-facing schema — enforce them server-side (we do).
- Probing a freshly deployed Container App revision can race container startup. `/api/stale-feeds` returned 404 at 02:18:52 while the new container only logged "listening" at 02:18:57; it returned the correct 401 moments later. Check the startup log line before concluding a route is missing.
- **Agent-catalog propagation lags the app-catalog deploy, and the agent keeps serving its old toolset until it catches up.** After deploying v1.1.0.0 with four tools, Copilot still answered *"GarageOverviewTool … isn't available in my current toolset"* and kept routing everything to the only tool it knew. A new conversation does not help — the toolset is bound to the synced agent version, not the session. Bump `copilot/manifest.json` `version` on every change (the overview docs require this or the old definition sticks), re-run **Add to all sites** → **Add to Teams**, then wait. Note that re-uploading a package also resets "Added to all sites" back to No, so both steps must be repeated on every upgrade.
- Also noticed **`appPackage/build/ai-plugin.dev.json` is stale** — it still has the pre-2026-09-12 "partial matches remain masked" tool description. Unrelated to the SSO failure, but re-run `./scripts/package-agent.ps1` (or `atk provision`/`publish`) before relying on this package again so the tool descriptions match the current no-masking behavior.
- **Re-published** after the workspace sync and settings fix above — confirmed *"Your agent was published at 7:49 PM on 9/11/2026!"*. This publish includes the hardened instructions (pushed via `pac copilot push`) and the disabled model-knowledge/web/file/semantic-search settings; the first publish did not.
