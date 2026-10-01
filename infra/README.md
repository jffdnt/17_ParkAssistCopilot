# Azure infrastructure

The production topology is split into two idempotent Bicep deployments:

- `foundation.bicep` creates Log Analytics, ACR with the admin account disabled, the Container Apps environment, and a user-assigned identity with `AcrPull`.
- `container-app.bicep` deploys an immutable image tag, Entra configuration, Container Apps secret reference, scaling, and separate liveness/readiness probes.

Use `scripts/deploy-azure.ps1` from the repository root. The script provisions the foundation, builds an immutable image in ACR, and deploys a new Container App revision. It never deploys `:latest`.

```powershell
$env:PARKASSIST_CAMERA_SIGNING_SECRET = '<random 32+ character value>'
./scripts/deploy-azure.ps1 `
  -ResourceGroup rg-parkassist-prod `
  -Location eastus `
  -ContainerRegistryName acrparkassist6047 `
  -LogAnalyticsWorkspaceName workspace-rgparkassistprodrOTu `
  -AcrPullRoleAssignmentName eba9defa-f6a6-4c84-ac09-a357ad7919d5 `
  -EntraTenantId '<tenant-guid>' `
  -EntraClientId '<application-guid>' `
  -CorsAllowedOrigins 'https://castletonstage.sharepoint.com' `
  -SharePointSiteUrl 'https://castletonstage.sharepoint.com/sites/Development' `
  -WhatIfOnly
```

Remove `-WhatIfOnly` only after reviewing the plan. The script expects an authenticated Azure CLI session with rights to create resource-group deployments, build in ACR, and assign `AcrPull`.

`LogAnalyticsWorkspaceName` should name the workspace already connected to an adopted Container Apps environment. `AcrPullRoleAssignmentName` is needed only when adopting an identity whose role assignment was created outside Bicep; new environments can omit it and use the deterministic assignment name.

The identity still needs the site-scoped Microsoft Graph permission used by the optional `SensorHealth` overlay; that tenant-level grant is intentionally outside this subscription template.
