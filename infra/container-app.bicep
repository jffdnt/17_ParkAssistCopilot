targetScope = 'resourceGroup'

param location string = resourceGroup().location
param containerAppName string = 'parkassist-mcp'
param containerRegistryName string
param managedEnvironmentName string = 'parkassist-copilot-env'
param identityName string = 'id-parkassist-prod'
param imageTag string

param entraTenantId string
param entraClientId string

@secure()
param cameraSigningSecret string

param parkAssistApiBaseUrl string = 'https://parkassistproxy99b.azurewebsites.net/api'
param parkingGarage string = '5 Bell'
param corsAllowedOrigins string
param sharePointSiteUrl string = ''
param sharePointListName string = 'SensorHealth'
param minReplicas int = 1
param maxReplicas int = 2
param rateLimitWindowSeconds int = 60
param rateLimitMaxRequests int = 300

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
            { name: 'ENTRA_REQUIRED_SCOPE', value: 'access_as_user' }
            { name: 'CAMERA_SIGNING_SECRET', secretRef: 'camera-signing-secret' }
            { name: 'CAMERA_URL_TTL_SECONDS', value: '300' }
            { name: 'PARKASSIST_API_BASE_URL', value: parkAssistApiBaseUrl }
            { name: 'PARKING_GARAGE', value: parkingGarage }
            { name: 'STALE_AFTER_MINUTES', value: '15' }
            { name: 'CACHE_SECONDS', value: '30' }
            { name: 'TRUST_PROXY_HOPS', value: '1' }
            { name: 'RATE_LIMIT_WINDOW_SECONDS', value: string(rateLimitWindowSeconds) }
            { name: 'RATE_LIMIT_MAX_REQUESTS', value: string(rateLimitMaxRequests) }
          ], optionalSharePointEnvironment)
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
