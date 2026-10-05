targetScope = 'resourceGroup'

param location string = resourceGroup().location
param containerAppName string = 'parkassist-mcp'
param containerRegistryName string
param managedEnvironmentName string = 'parkassist-copilot-env'
param identityName string = 'id-parkassist-prod'
param imageTag string

param entraTenantId string
param entraClientId string
param entraAllowedAudiences string = ''

@secure()
param cameraSigningSecret string

@secure()
param pluginApiKey string

param parkAssistApiBaseUrl string = 'https://parkassistproxy99b.azurewebsites.net/api'
param parkingGarage string = '5 Bell'
param corsAllowedOrigins string
param sharePointSiteUrl string = ''
param sharePointListName string = 'SensorHealth'
param minReplicas int = 1
param maxReplicas int = 2
param rateLimitWindowSeconds int = 60
param rateLimitMaxRequests int = 300
@description('Azure OpenAI account (in this resource group) for the generative UI experiment. Empty leaves the feature off.')
param azureOpenAiResource string = ''
@description('Model deployment name in that account.')
param azureOpenAiDeployment string = ''

param tags object = {
  application: 'ParkAssist Copilot'
  managedBy: 'Bicep'
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: containerRegistryName
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: managedEnvironmentName
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: identityName
}

var publicBaseUrl = 'https://${containerAppName}.${environment.properties.defaultDomain}'
var image = '${registry.properties.loginServer}/parkassist-mcp:${imageTag}'
var optionalSharePointEnvironment = empty(sharePointSiteUrl) ? [] : [
  {
    name: 'SHAREPOINT_SITE_URL'
    value: sharePointSiteUrl
  }
  {
    name: 'SHAREPOINT_LIST_NAME'
    value: sharePointListName
  }
  {
    name: 'AZURE_CLIENT_ID'
    value: identity.properties.clientId
  }
]

var genUiEnabled = !empty(azureOpenAiResource)
// DefaultAzureCredential needs AZURE_CLIENT_ID to pick the user-assigned identity.
// The SharePoint block already sets it; add it here only when that block is off.
var optionalGenUiEnvironment = genUiEnabled ? concat([
  { name: 'GENUI_ENABLED', value: 'true' }
  { name: 'AZURE_OPENAI_RESOURCE', value: azureOpenAiResource }
  { name: 'AZURE_OPENAI_DEPLOYMENT', value: azureOpenAiDeployment }
], empty(sharePointSiteUrl) ? [
  { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
] : []) : []

resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = if (genUiEnabled) {
  name: genUiEnabled ? azureOpenAiResource : 'unused'
}

// Cognitive Services OpenAI User: call deployments with an Entra token, no keys.
resource openAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (genUiEnabled) {
  name: guid(resourceGroup().id, azureOpenAiResource, identity.id, '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
  scope: openAi
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 3000
        transport: 'auto'
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
      secrets: [
        {
          name: 'camera-signing-secret'
          value: cameraSigningSecret
        }
        {
          name: 'plugin-api-key'
          value: pluginApiKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'parkassist-mcp'
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: concat([
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3000' }
            { name: 'PUBLIC_BASE_URL', value: publicBaseUrl }
            { name: 'ALLOWED_HOSTS', value: '${containerAppName}.${environment.properties.defaultDomain}' }
            { name: 'CORS_ALLOWED_ORIGINS', value: corsAllowedOrigins }
            { name: 'AUTH_MODE', value: 'entra' }
            { name: 'ENTRA_TENANT_ID', value: entraTenantId }
            { name: 'ENTRA_CLIENT_ID', value: entraClientId }
            { name: 'ENTRA_ALLOWED_AUDIENCES', value: entraAllowedAudiences }
            { name: 'ENTRA_REQUIRED_SCOPE', value: 'access_as_user' }
            { name: 'PLUGIN_API_KEY', secretRef: 'plugin-api-key' }
            { name: 'CAMERA_SIGNING_SECRET', secretRef: 'camera-signing-secret' }
            { name: 'CAMERA_URL_TTL_SECONDS', value: '300' }
            { name: 'PARKASSIST_API_BASE_URL', value: parkAssistApiBaseUrl }
            { name: 'PARKING_GARAGE', value: parkingGarage }
            { name: 'STALE_AFTER_MINUTES', value: '15' }
            { name: 'CACHE_SECONDS', value: '30' }
            { name: 'TRUST_PROXY_HOPS', value: '1' }
            { name: 'RATE_LIMIT_WINDOW_SECONDS', value: string(rateLimitWindowSeconds) }
            { name: 'RATE_LIMIT_MAX_REQUESTS', value: string(rateLimitMaxRequests) }
          ], optionalSharePointEnvironment, optionalGenUiEnvironment)
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
                scheme: 'HTTP'
                httpHeaders: [
                  {
                    name: 'Host'
                    value: '${containerAppName}.${environment.properties.defaultDomain}'
                  }
                ]
              }
              initialDelaySeconds: 10
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/ready'
                port: 3000
                scheme: 'HTTP'
                httpHeaders: [
                  {
                    name: 'Host'
                    value: '${containerAppName}.${environment.properties.defaultDomain}'
                  }
                ]
              }
              initialDelaySeconds: 5
              periodSeconds: 30
              timeoutSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

output containerAppName string = app.name
output containerAppUrl string = publicBaseUrl
output image string = image
output latestRevisionName string = app.properties.latestRevisionName
