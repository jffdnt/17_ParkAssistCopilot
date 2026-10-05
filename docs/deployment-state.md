# Deployment state

Last updated: 2026-10-05

Short summary of what's actually running in production today. For the full
chronological rollout log, acceptance testing, and operational gotchas, see
[release-history.md](release-history.md). For the active deployment plan and
validation proof, see
[.azure/deployment-plan.md](../.azure/deployment-plan.md) — it is the
deployment source of truth.

## Production routes

- **Microsoft 365 Copilot (primary pilot):** SPFx Copilot Components (`copilotComponent/`) call the Entra-protected `/api/*` routes directly with the signed-in user's delegated token (`AadHttpClient`) for the interactive dashboard, camera previews, and drill-downs. A paired OpenAPI plugin calls the API-key-protected `/api/plugin/*` routes through a tenant-scoped Enterprise Token Store key for same-turn model text.
- **Teams / text fallback:** the Copilot Studio agent **ParkAssist Garage Text** (agent ID `d92774c9-4171-446a-9d7c-485bb0b4a850`) calls the Streamable HTTP MCP endpoint for same-turn text and Adaptive Cards. It has no dashboard or drill-down.
- **Generative UI (`/genui`):** a standalone page where an Azure OpenAI model (`gpt-5.4-mini` on `oai-parkassist-dev`) composes each answer as a validated view from an allowlist of components; the server fills in every number. Entra sign-in (MSAL, SPA redirect `…/genui` on the ParkAssist Copilot app) and the same `access_as_user` check as `/api/*`. Enabled by `GENUI_ENABLED=true`; see the *Generative UI experiment* entry in [release-history.md](release-history.md).
- **Removed:** an earlier declarative-agent package (`appPackage/`, `OAuthPluginVault` route) never reliably reached the server in this tenant and has been deleted from the repo; see [release-history.md](release-history.md) for the investigation.

## Current versions

- **Server:** image `parkassist-mcp:20261005-genui1` (ACR digest `sha256:0c8e13f170c01027877fab45eb42113a05c9d40cb0e15c8fcc6f011a7f606cae`), Container App revision `parkassist-mcp--0000017` (`parkassist-mcp` in `rg-parkassist-prod`), release `1.9.6` plus the generative UI. It replaced `20261002-platecontext1` (`--0000016`), which stays in ACR for rollback.
- **SPFx package:** App Catalog item `e18adece-2878-4fcf-9e03-c65e4448dd54`, version `1.9.6.0`, valid and deployed tenant-wide (uploaded with `--overwrite` and deployed 2026-10-05). **Add to Teams** has not been re-invoked for `1.9.6.0` yet.
- **`1.9.6` (deployed 2026-10-05):** camera-preview issuance moved off the `GET /api/status-detail` drill-down response onto the on-demand `GET /api/camera-preview-url?bayId=…` call made only after a user opens a space — see [architecture.md](architecture.md) for the current contract. Live drill-down camera-preview acceptance in Microsoft 365 Copilot has not been recorded yet.

## Power Platform / Copilot Studio reference

- Environment: `https://orgdc7bf008.crm.dynamics.com/` (`Jeffrey Dent's Environment`)
- Copilot solution: `fivebell_ParkAssistCopilot`; publisher prefix `fivebell`
- Fallback agent: **ParkAssist Garage Text** (`d92774c9-4171-446a-9d7c-485bb0b4a850`), state Active / Provisioned / Published
- MCP tool connection: persistent OAuth 2.0 (Manual) connection against Entra app `750929bd-e2b6-4019-838c-365c36cbcb22`

## Azure reference

- Subscription: `Azure subscription 1` (`7005a55f-0b9a-4c0c-9f43-5789209b0e4d`), resource group `rg-parkassist-prod` (East US)
- Container Apps environment: `parkassist-copilot-env`; registry `acrparkassist6047`; identity `id-parkassist-prod` (`AcrPull` on the registry, and **Cognitive Services OpenAI User** on `oai-parkassist-dev`, granted by `infra/container-app.bicep`)
- Entra app: `ParkAssist Copilot` (appId `750929bd-e2b6-4019-838c-365c36cbcb22`), scope `access_as_user`, tenant-wide admin consent granted
- Azure OpenAI: account `oai-parkassist-dev` (East US), deployment `gpt-5.4-mini` (Global Standard, 50K TPM), Entra authentication only (the app uses no keys). No budget alert is configured.
- Live URL: `https://parkassist-mcp.happyground-f091a09b.eastus.azurecontainerapps.io`

This mirrors the production configuration also recorded in
`.azure/deployment-plan.md`; treat that file as authoritative if the two
ever disagree.
