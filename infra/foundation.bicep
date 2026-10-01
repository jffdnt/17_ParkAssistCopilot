targetScope = 'resourceGroup'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Globally unique Azure Container Registry name.')
param containerRegistryName string

@description('Container Apps managed environment name.')
param managedEnvironmentName string = 'parkassist-copilot-env'

@description('Log Analytics workspace name.')
param logAnalyticsWorkspaceName string = 'log-parkassist-prod'

@description('User-assigned identity used by the Container App.')
param identityName string = 'id-parkassist-prod'

@description('Existing AcrPull role-assignment name when adopting a manually assigned identity. Leave empty for a deterministic new assignment.')
param acrPullRoleAssignmentName string = ''

param tags object = {
  application: 'ParkAssist Copilot'
  managedBy: 'Bicep'
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: containerRegistryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: managedEnvironmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

var acrPullRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)
var resolvedAcrPullRoleAssignmentName = empty(acrPullRoleAssignmentName)
  ? guid(registry.id, identity.id, acrPullRoleId)
  : acrPullRoleAssignmentName

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: resolvedAcrPullRoleAssignmentName
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleId
  }
}

output containerRegistryName string = registry.name
output containerRegistryServer string = registry.properties.loginServer
output managedEnvironmentName string = environment.name
output managedEnvironmentDefaultDomain string = environment.properties.defaultDomain
output identityName string = identity.name
output identityClientId string = identity.properties.clientId
