# Deployment state

Last updated: 2026-10-02

Short summary of what's actually running in production today. For the full
chronological rollout log, acceptance testing, and operational gotchas, see
[release-history.md](release-history.md). For the active deployment plan and
validation proof, see
[.azure/deployment-plan.md](../.azure/deployment-plan.md) — it is the
deployment source of truth.

## Production routes

- **Microsoft 365 Copilot (primary pilot):** SPFx Copilot Components (`copilotComponent/`) call the Entra-protected `/api/*` routes directly with the signed-in user's delegated token (`AadHttpClient`) for the interactive dashboard, camera previews, and drill-downs. A paired OpenAPI plugin calls the API-key-protected `/api/plugin/*` routes through a tenant-scoped Enterprise Token Store key for same-turn model text.
- **Teams / text fallback:** the Copilot Studio agent **ParkAssist Garage Text** (agent ID `d92774c9-4171-446a-9d7c-485bb0b4a850`) calls the Streamable HTTP MCP endpoint for same-turn text and Adaptive Cards. It has no dashboard or drill-down.
- **Removed:** an earlier declarative-agent package (`appPackage/`, `OAuthPluginVault` route) never reliably reached the server in this tenant and has been deleted from the repo; see [release-history.md](release-history.md) for the investigation.

## Current versions

- **Server:** image `parkassist-mcp:20261002-platecontext1`, Container App revision `parkassist-mcp--0000016` (`parkassist-mcp` in `rg-parkassist-prod`), release `1.9.5`.
- **SPFx package:** App Catalog item `e18adece-2878-4fcf-9e03-c65e4448dd54`, version `1.9.5.0`, enabled and deployed tenant-wide; **Add to Teams** has been invoked.
- **Pending (locally validated, not yet deployed):** `1.9.6` moves camera-preview issuance off the `GET /api/status-detail` drill-down response and onto a new on-demand `GET /api/camera-preview-url?bayId=…` call made only after a user opens a space — see [architecture.md](architecture.md) for the current contract. `.azure/deployment-plan.md` has full validation proof for this release. Update this section once it is deployed and verified live.

## Power Platform / Copilot Studio reference

- Environment: `https://orgdc7bf008.crm.dynamics.com/` (`Jeffrey Dent's Environment`)
- Copilot solution: `fivebell_ParkAssistCopilot`; publisher prefix `fivebell`
- Fallback agent: **ParkAssist Garage Text** (`d92774c9-4171-446a-9d7c-485bb0b4a850`), state Active / Provisioned / Published
- MCP tool connection: persistent OAuth 2.0 (Manual) connection against Entra app `750929bd-e2b6-4019-838c-365c36cbcb22`

## Azure reference

- Subscription: `Azure subscription 1` (`7005a55f-0b9a-4c0c-9f43-5789209b0e4d`), resource group `rg-parkassist-prod` (East US)
- Container Apps environment: `parkassist-copilot-env`; registry `acrparkassist6047`; identity `id-parkassist-prod` (scoped to `AcrPull` on the registry only)
- Entra app: `ParkAssist Copilot` (appId `750929bd-e2b6-4019-838c-365c36cbcb22`), scope `access_as_user`, tenant-wide admin consent granted
- Live URL: `https://parkassist-mcp.happyground-f091a09b.eastus.azurecontainerapps.io`

This mirrors the production configuration also recorded in
`.azure/deployment-plan.md`; treat that file as authoritative if the two
ever disagree.
