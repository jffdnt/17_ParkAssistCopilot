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

The CLI 2.8.1 `pac copilot init` operation imported the minimal agent solution as part of workspace generation. The checked-in workspace contains the hardened instructions that still need to be pushed after the MCP connection is configured.

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

## Remaining deployment gates

1. **Admin approval**: an M365 admin needs to approve the published app in Teams Admin Center (`https://aka.ms/teamsfx-mtac`) → Manage apps, search "ParkAssist Copilot", before it's available to users org-wide. (If `jffdnt@Castletonstage.onmicrosoft.com` already is the admin, this can be done directly there.)
2. Replace placeholder `PUBLISHER_WEBSITE_URL`/`PRIVACY_URL`/`TERMS_OF_USE_URL` with real pages if this is ever submitted to the public Teams Store (not required for internal-only use).
3. Publish the Copilot Studio agent (Publish button) so the newly added MCP tool is live in published channels, and push the hardened workspace instructions (`copilotStudio/README.md`'s `pac copilot push`/`publish` steps) once the remote connection reference is pulled down.
4. Test a live stale-camera prompt in a new 1:1 Teams/Copilot chat, and separately verify the Teams/M365 SSO (on-behalf-of) route actually mints a token `auth.ts` accepts — it was never exercised end-to-end and could hit the same v1-vs-v2 audience issue the Copilot Studio connector hit.
