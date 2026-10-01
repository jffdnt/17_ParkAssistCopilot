[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $ResourceGroup,
  [Parameter(Mandatory = $true)] [string] $Location,
  [Parameter(Mandatory = $true)] [string] $ContainerRegistryName,
  [Parameter(Mandatory = $true)] [string] $EntraTenantId,
  [Parameter(Mandatory = $true)] [string] $EntraClientId,
  [Parameter(Mandatory = $true)] [string] $CorsAllowedOrigins,
  [string] $ContainerAppName = 'parkassist-mcp',
  [string] $ManagedEnvironmentName = 'parkassist-copilot-env',
  [string] $IdentityName = 'id-parkassist-prod',
  [string] $LogAnalyticsWorkspaceName = 'log-parkassist-prod',
  [string] $AcrPullRoleAssignmentName = '',
  [string] $ImageTag = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'),
  [string] $SharePointSiteUrl = '',
  [string] $CameraSigningSecret = $env:PARKASSIST_CAMERA_SIGNING_SECRET,
  [switch] $WhatIfOnly
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$foundationTemplate = Join-Path $workspaceRoot 'infra/foundation.bicep'
$appTemplate = Join-Path $workspaceRoot 'infra/container-app.bicep'

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
  throw 'Azure CLI (az) is required.'
}
if ([string]::IsNullOrWhiteSpace($CameraSigningSecret) -or $CameraSigningSecret.Length -lt 32) {
  throw 'Set PARKASSIST_CAMERA_SIGNING_SECRET to a random value of at least 32 characters.'
}
if ($CorsAllowedOrigins -notmatch '^https://') {
  throw 'CorsAllowedOrigins must contain at least one HTTPS origin.'
}

az account show --only-show-errors | Out-Null

if (-not $WhatIfOnly) {
  az group create --name $ResourceGroup --location $Location --only-show-errors | Out-Null
}

$foundationParameters = @(
  "location=$Location"
  "containerRegistryName=$ContainerRegistryName"
  "managedEnvironmentName=$ManagedEnvironmentName"
  "logAnalyticsWorkspaceName=$LogAnalyticsWorkspaceName"
  "identityName=$IdentityName"
)
if (-not [string]::IsNullOrWhiteSpace($AcrPullRoleAssignmentName)) {
  $foundationParameters += "acrPullRoleAssignmentName=$AcrPullRoleAssignmentName"
}
$appParameters = @(
  "location=$Location"
  "containerAppName=$ContainerAppName"
  "containerRegistryName=$ContainerRegistryName"
  "managedEnvironmentName=$ManagedEnvironmentName"
  "identityName=$IdentityName"
  "imageTag=$ImageTag"
  "entraTenantId=$EntraTenantId"
  "entraClientId=$EntraClientId"
  "cameraSigningSecret=$CameraSigningSecret"
  "corsAllowedOrigins=$CorsAllowedOrigins"
  "sharePointSiteUrl=$SharePointSiteUrl"
)

if ($WhatIfOnly) {
  az deployment group what-if --resource-group $ResourceGroup --template-file $foundationTemplate --parameters $foundationParameters --only-show-errors
  az deployment group what-if --resource-group $ResourceGroup --template-file $appTemplate --parameters $appParameters --only-show-errors
  return
}

az deployment group create --name 'parkassist-foundation' --resource-group $ResourceGroup --template-file $foundationTemplate --parameters $foundationParameters --only-show-errors | Out-Null

az acr build --registry $ContainerRegistryName --image "parkassist-mcp:$ImageTag" --file (Join-Path $workspaceRoot 'Dockerfile') $workspaceRoot --only-show-errors

$deployment = az deployment group create --name "parkassist-app-$ImageTag" --resource-group $ResourceGroup --template-file $appTemplate --parameters $appParameters --only-show-errors --output json | ConvertFrom-Json
$outputs = $deployment.properties.outputs
Write-Output "Deployed $($outputs.image.value)"
Write-Output "URL: $($outputs.containerAppUrl.value)"
Write-Output "Revision: $($outputs.latestRevisionName.value)"
