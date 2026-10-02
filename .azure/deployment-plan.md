# Azure Deployment Plan

> **Status:** Validated

Generated: 2026-10-01T16:15:00-05:00

---

## 1. Project Overview

**Goal:** Deploy the ParkAssist `1.9.3` dashboard drill-down release to the existing production Container App, then deploy its matching SharePoint Copilot Component package. Publish the `1.9.5` occupied-plate follow-up: the Entra-protected occupied drill-down and its bounded Copilot context expose full plate IDs; other drill-down statuses continue to omit them.

**Path:** Modify existing Azure application

---

## 2. Requirements

| Attribute | Value |
|-----------|-------|
| Classification | Production |
| Scale | Small pilot (under 1,000 users) |
| Budget | Cost-optimized |
| Subscription | Azure subscription 1 (`7005a55f-0b9a-4c0c-9f43-5789209b0e4d`), confirmed |
| Location | East US, confirmed |
| Compliance | Retain the existing East US production environment; no additional requirements |

### Policy Constraints

`az policy assignment list --scope /subscriptions/7005a55f-0b9a-4c0c-9f43-5789209b0e4d` returned no assignments on 2026-10-01.

---

## 3. Components Detected

| Component | Type | Technology | Path |
|-----------|------|------------|------|
| ParkAssist service | API | Node.js 22, Express, MCP/REST | `src/server/` |
| Production image | Container | Multi-stage Node Alpine Dockerfile | `Dockerfile` |
| Primary Copilot UI | Frontend package | SPFx Copilot Components / React | `copilotComponent/` |
| Infrastructure | IaC | Bicep and Azure CLI deployment script | `infra/`, `scripts/deploy-azure.ps1` |

---

## 4. Recipe Selection

**Selected:** AZCLI with Bicep

**Rationale:** The existing production deployment uses `scripts/deploy-azure.ps1` to run idempotent Bicep deployments, ACR cloud builds, and a Container App revision update. There is no `azure.yaml`, and replacing this established path with AZD would add deployment drift.

---

## 5. Architecture

**Stack:** Existing external Azure Container App (`parkassist-mcp`) in `parkassist-copilot-env`, with ACR image storage, Log Analytics, and a user-assigned managed identity.

| Component | Azure Service | SKU / Configuration |
|-----------|---------------|---------------------|
| ParkAssist API | Azure Container Apps | 0.5 vCPU, 1 GiB, 1–2 replicas, HTTPS ingress |
| Image registry | Azure Container Registry | Existing Basic registry `acrparkassist6047` |
| Logs | Log Analytics | Existing 30-day PerGB2018 workspace |
| Image-pull identity | User-assigned managed identity | Existing `id-parkassist-prod` with `AcrPull` |
| Copilot UI | SharePoint App Catalog | Existing tenant package, version `1.9.6.0` |

The release adds the Entra-protected `GET /api/status-detail` endpoint and SPFx drill-down UI. It does not add Azure services, identities, public endpoints, or capacity.

### Role Assignment Verification

- **Status:** Verified
- **Identity:** `id-parkassist-prod`
- **Role:** `AcrPull` (`7f951dda-4ed3-4680-a7ca-43fe172d538d`)
- **Scope:** `acrparkassist6047` only
- **Rationale:** This is the least-privileged role required for the Container App to pull its immutable image. The optional SharePoint Graph overlay is tenant-managed and is not changed by this release.

---

## 6. Provisioning Limit Checklist

| Resource Type | Number to Deploy | Total After Deployment | Limit/Quota | Notes |
|---------------|------------------|------------------------|-------------|-------|
| `Microsoft.App/managedEnvironments` | 0 (reuse existing) | 1 | 20 | `az quota list` / `az quota usage show` for `ManagedEnvironmentCount` in East US on 2026-10-01 |
| `Microsoft.App/containerApps` | 0 net new (update 1 existing app) | 1 | Existing environment capacity | `parkassist-mcp` is `Succeeded`; revision update retains its 1–2 replica configuration |
| `Microsoft.ContainerRegistry/registries` | 0 (reuse existing) | 1 | Existing registry capacity | ACR cloud build pushes one immutable image tag to `acrparkassist6047` |
| `Microsoft.OperationalInsights/workspaces` | 0 (reuse existing) | 1 | Existing workspace capacity | Existing production workspace remains attached |
| `Microsoft.ManagedIdentity/userAssignedIdentities` | 0 (reuse existing) | 1 | Existing identity capacity | Existing `id-parkassist-prod` remains assigned |

**Status:** ✅ Capacity is sufficient. The only quota-applicable resource is reused, and its live usage is 1 of 20. `Microsoft.Quota` was registered before the CLI query.

---

## 7. Execution Checklist

### Phase 1: Planning
- [x] Analyze workspace and existing deployment
- [x] Gather and confirm requirements
- [x] Confirm subscription and location
- [x] Check policy constraints
- [x] Validate quota and capacity
- [x] Select AZCLI/Bicep recipe
- [x] Plan existing Container Apps architecture
- [x] User approved this plan

### Phase 2: Execution
- [x] Verify application locally: root typecheck, 41 root tests, root production build, 10 SPFx tests, SPFx production package, and release readiness check
- [x] Generate the `1.9.3.0` SPFx package
- [x] Run Bicep what-if with existing production parameters and secret references
- [x] Build immutable ACR image and deploy Container App revision (`parkassist-mcp--0000015`, image `20261001-drilldown1`)
- [x] Verify health, readiness, and authenticated route behavior (`/api/status-detail` returns `401` without a token)
- [x] Upload and deploy SharePoint `1.9.3.0` (App Catalog ID `e18adece-2878-4fcf-9e03-c65e4448dd54`)
- [x] Build, test, upload, and deploy SharePoint `1.9.4.0` client follow-up for bounded drill-down model context
- [x] In the App Catalog UI, enable **Add to all sites** and complete **Add to Teams**
- [x] Run Microsoft 365 Copilot drill-down acceptance
- [x] Update plan status to `Ready for Validation`

### Phase 3: Validation
- [x] Invoke azure-validate workflow
- [x] Record validation proof and set status to `Validated`

#### All validation checks pass
- [x] `1.9.6` core validation (CLI, auth, Bicep build, resource-group validate, and what-if)
- [x] `1.9.6` container image build
- [x] `1.9.6` Azure Policy validation
- [x] Core validation (CLI, auth, Bicep build, resource-group validate, and what-if)
- [x] Container image build (Docker is unavailable locally; validated with ACR cloud build)
- [x] Azure Policy validation
- [x] Core validation for `infra/foundation.bicep`: Azure CLI/authentication, Bicep build, resource-group validate, and what-if using existing production parameters
- [x] Core validation for `infra/container-app.bicep`: Azure CLI/authentication, Bicep build, resource-group validate, and what-if using the existing secret references
- [x] Run the root production build and test suite
- [x] Run the SPFx production package build and tests
- [x] Confirm no Azure Policy assignments apply to the subscription
- [x] Verify static Bicep RBAC: `id-parkassist-prod` receives `AcrPull` only on `acrparkassist6047`

### Phase 4: Deployment
- [x] Invoke azure-deploy workflow
- [x] Deploy and verify the server endpoint
- [x] Mark the SharePoint package rollout and Copilot acceptance complete
- [x] Deploy and verify `1.9.5` occupied-plate server and client release

---

## 8. Validation Proof

| Check | Command Run | Result | Timestamp |
|-------|-------------|--------|-----------|
| Production capacity | `az quota list` and `az quota usage show` for `ManagedEnvironmentCount` in East US | Pass: 1 used of 20; no new environment is planned | 2026-10-01 |
| Azure policy | `az policy assignment list --scope /subscriptions/7005a55f-0b9a-4c0c-9f43-5789209b0e4d` | Pass: no assignments | 2026-10-01 |
| Foundation template | `validate-deployment.ps1 -Scope group -ResourceGroup rg-parkassist-prod -Template .\infra\foundation.bicep` with existing parameters | Pass: CLI/authentication, Bicep build, validate, and what-if all passed | 2026-10-01 |
| App template | `validate-deployment.ps1 -Scope group -ResourceGroup rg-parkassist-prod -Template .\infra\container-app.bicep` with existing secure parameters | Pass: CLI/authentication, Bicep build, validate, and what-if all passed | 2026-10-01 |
| Root application | `npm run build; npm test` | Pass: production build; 41 tests passed | 2026-10-01 |
| SPFx package | `cd copilotComponent; npm run build` | Pass: production build/package; 10 tests passed | 2026-10-01 |
| Static RBAC | Reviewed `infra/foundation.bicep` | Pass: `id-parkassist-prod` is assigned only registry-scoped `AcrPull` | 2026-10-01 |
| `1.9.5` foundation template | `validate-deployment.ps1 -Scope group -ResourceGroup rg-parkassist-prod -Template .\infra\foundation.bicep` with existing production parameters | Pass: CLI/authentication, Bicep build, validate, and what-if (2 create, 6 modify, 8 delete) | 2026-10-02 |
| `1.9.5` app template | `validate-deployment.ps1 -Scope group -ResourceGroup rg-parkassist-prod -Template .\infra\container-app.bicep` with existing production parameters | Pass: CLI/authentication, Bicep build, validate, and what-if (0 create, 22 modify, 4 delete) | 2026-10-02 |
| `1.9.5` policy | `az policy assignment list --scope /subscriptions/7005a55f-0b9a-4c0c-9f43-5789209b0e4d` | Pass: no assignments | 2026-10-02 |
| `1.9.5` application | `npm run typecheck; npm run build; npm test -- --runInBand tests/parking-data.test.ts` | Pass: type checks and production build; 17 targeted server tests passed | 2026-10-02 |
| `1.9.5` SPFx package | `cd copilotComponent; npm run build` | Pass: production package; 11 component tests passed | 2026-10-02 |
| `1.9.5` container image | `az acr build --registry acrparkassist6047 --image parkassist-mcp:20261002-platecontext-validate --no-logs` | Pass: ACR run `caj`, digest `sha256:65d597f217136e5eaa960490dfdbfff00c4893597239dda2f37aca02cf47ccae` | 2026-10-02 |
| `1.9.6` foundation template | `validate-deployment.ps1 -Scope group -ResourceGroup rg-parkassist-prod -Template .\infra\foundation.bicep` with session-only current production parameters | Pass: CLI/authentication, Bicep build, validate, and what-if (2 create, 4 modify, 8 delete) | 2026-10-02 |
| `1.9.6` app template | `validate-deployment.ps1 -Scope group -ResourceGroup rg-parkassist-prod -Template .\infra\container-app.bicep` with session-only current production parameters | Pass: CLI/authentication, Bicep build, validate, and what-if (0 create, 22 modify, 4 delete) | 2026-10-02 |
| `1.9.6` policy | `az policy assignment list --scope /subscriptions/7005a55f-0b9a-4c0c-9f43-5789209b0e4d` | Pass: no assignments | 2026-10-02 |
| `1.9.6` application | `npm test -- --run tests/parking-data.test.ts; npm run typecheck; npm run build:server` | Pass: 18 targeted server tests, type checks, and production server build | 2026-10-02 |
| `1.9.6` SPFx package | `cd copilotComponent; npm run build` | Pass: production package; 11 component tests passed | 2026-10-02 |
| `1.9.6` container image | `az acr build --registry acrparkassist6047 --image parkassist-mcp:20261002-previewurl-validate --no-logs` | Pass: ACR run `cam`, digest `sha256:306a4c18d6a44296462d41a2b482f513a450a05c09f99a1d2c1c7ac9786c510b` | 2026-10-02 |

**Validated by:** azure-validate workflow

---

## 9. Deployment Verification

- **Server:** `parkassist-mcp--0000015` is Healthy with one running replica, using `parkassist-mcp:20261001-drilldown1`.
- **Endpoints:** `https://parkassist-mcp.happyground-f091a09b.eastus.azurecontainerapps.io/health` and `/ready` returned 200. Unauthenticated `GET /api/status-detail?status=available` returned 401, proving the new route is live and Entra-protected.
- **Package:** App Catalog item `e18adece-2878-4fcf-9e03-c65e4448dd54` reports version `1.9.4.0`, `CurrentVersionDeployed: true`, `IsEnabled: true`, and `IsValidAppPackage: true`.
- **Client correction:** Live acceptance found that a drill-down model context listing up to 200 spaces was rejected by the Copilot bridge (`400`). Version `1.9.4` preserves complete floor/category/type totals but limits named illustrative spaces to 12; the production SPFx build and its 10 tests pass.
- **`1.9.5` server:** ACR run `cak` built `parkassist-mcp:20261002-platecontext1` (digest `sha256:2b1ec599981ac2d96c75c0d2bc38fb8a38a66cf4e1f4acbf44f5d6e2d3d63c73`). Container App revision `parkassist-mcp--0000016` is Healthy with one replica and 100% traffic. `/health` and `/ready` return 200; unauthenticated occupied-detail requests return 401.
- **`1.9.5` package:** App Catalog item `e18adece-2878-4fcf-9e03-c65e4448dd54` reports version `1.9.5.0`, `CurrentVersionDeployed: true`, `IsEnabled: true`, and `IsValidAppPackage: true`. Tenant-wide site deployment remains enabled. **Add to Teams** was invoked and remains in the catalog's asynchronous “Adding to Teams” state.
- **`1.9.5` Microsoft 365 Copilot acceptance:** A fresh conversation rendered full plate IDs on occupied-space tiles. Selecting space 1C and asking “What is the license plate in the selected space 1C?” returned its displayed plate, bay, floor, and parked duration from published drill-down context. Browser traffic contained only the initial overview and occupied-detail requests; the plate follow-up did not call a ParkAssist endpoint.
- **Live role verification:** `id-parkassist-prod` principal `818bd81b-e56a-4d29-b756-794418d29264` has `AcrPull` scoped only to `acrparkassist6047` (pass).
- **App Catalog publication:** **Add to all sites** is enabled and **Add to Teams** displayed “The app has been added to Teams” for `1.9.4`.
- **Microsoft 365 Copilot acceptance:** In a fresh agent conversation, the overview rendered the interactive dashboard and the occupied drill-down returned 444 spaces. **Ask Copilot** correctly identified Floor 3 as the largest concentration (69 of 132). A subsequent user-typed “Which floor has the most of these occupied spaces?” returned the same result from context. Browser network evidence contained only the initial `GET /api/overview` and one `GET /api/status-detail?status=occupied`; neither context follow-up called a ParkAssist endpoint.

---

## 10. Files

| File | Purpose | Status |
|------|---------|--------|
| `.azure/deployment-plan.md` | Deployment source of truth | Complete |
| `infra/foundation.bicep` | Existing shared production resources | Reused |
| `infra/container-app.bicep` | Existing Container App revision deployment | Reused |
| `scripts/deploy-azure.ps1` | Existing deployment runner | Reused |
| `copilotComponent/sharepoint/solution/parkassist-garage-copilot-component.sppkg` | Built SharePoint package | Ready |

## 11. Next Steps

1. Monitor the existing pilot normally; no further deployment action is required for this release.
