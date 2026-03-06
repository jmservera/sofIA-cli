// ──────────────────────────────────────────────────────────────────────────────
// Resource-group-scoped resources for Azure AI Foundry
//
// Deployed as a module from main.bicep (subscription-scoped).
// ──────────────────────────────────────────────────────────────────────────────

// ── Parameters (passed from main.bicep) ──────────────────────────────────────

param location string
param accountName string
param projectName string
param modelDeploymentName string
param modelName string
param modelVersion string
param modelSkuName string
param modelSkuCapacity int
param uniqueSuffix string

@description('Object ID of the user principal to grant Azure AI Developer access. Obtain with: az ad signed-in-user show --query id -o tsv')
param userPrincipalId string

// ── Derived values ───────────────────────────────────────────────────────────

var customSubDomainName = '${accountName}-${uniqueSuffix}'

// Azure AI Developer — allows creating/managing agents and using models
// https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles#azure-ai-developer
var azureAIDeveloperRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '64702f94-c441-49e6-a78b-ef80e0188fee')

// ── Resource 1: AI Services Account (Foundry) ────────────────────────────────
// Top-level Foundry account with project management enabled.
// kind: AIServices provides access to Foundry Agent Service capabilities.

resource aiAccount 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: accountName
  location: location
  kind: 'AIServices'
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: customSubDomainName
    allowProjectManagement: true
    publicNetworkAccess: 'Enabled'
  }
}

// ── Resource 2: Model Deployment ─────────────────────────────────────────────
// Deploys the language model that will process web search queries.
// Default: gpt-4.1-mini with GlobalStandard SKU for broadest availability.

resource modelDeploy 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: aiAccount
  name: modelDeploymentName
  sku: {
    name: modelSkuName
    capacity: modelSkuCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    currentCapacity: modelSkuCapacity
  }
}

// ── Resource 3: Foundry Project ──────────────────────────────────────────────
// Provides the endpoint URL used by the sofIA CLI (FOUNDRY_PROJECT_ENDPOINT).

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: aiAccount
  name: projectName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {}
  dependsOn: [
    modelDeploy
  ]
}

// ── Resource 4: Account Capability Host (Agents) ─────────────────────────────
// Enables the Agent Service at the account level.
// Must be created before the project capability host.

resource accountCapabilityHost 'Microsoft.CognitiveServices/accounts/capabilityHosts@2025-06-01' = {
  parent: aiAccount
  name: 'default'
  properties: {
    capabilityHostKind: 'Agents'
  }
  dependsOn: [
    project
    modelDeploy
  ]
}

// ── Resource 5: Project Capability Host (Agents) ─────────────────────────────
// Enables the Agent Service at the project level.
// Basic (Microsoft-managed) setup — empty connections array.

resource projectCapabilityHost 'Microsoft.CognitiveServices/accounts/projects/capabilityHosts@2025-06-01' = {
  parent: project
  name: 'default'
  properties: {
    capabilityHostKind: 'Agents'
  }
  dependsOn: [
    accountCapabilityHost
  ]
}

// ── Resource 6: Role Assignment — Azure AI Developer for the deploying user ──
// Grants the deploying user permission to create ephemeral agents, use models,
// and invoke web_search_preview through the Foundry Agent Service.

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiAccount.id, userPrincipalId, azureAIDeveloperRoleId)
  scope: aiAccount
  properties: {
    principalId: userPrincipalId
    roleDefinitionId: azureAIDeveloperRoleId
    principalType: 'User'
  }
}

// ── Outputs ──────────────────────────────────────────────────────────────────

output projectEndpoint string = project.properties.endpoints['AI Foundry API']
