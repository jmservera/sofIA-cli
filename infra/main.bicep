// ──────────────────────────────────────────────────────────────────────────────
// Azure AI Foundry — Basic Agent Setup with Web Search
//
// Provisions:
//   1. Resource Group (auto-created)
//   2. AI Services account (Foundry) with project management enabled
//   3. Model deployment (default: gpt-4.1-mini, GlobalStandard SKU)
//   4. Foundry project (provides the endpoint URL)
//   5. Account-level capability host (Agents)
//   6. Project-level capability host (Agents, basic/Microsoft-managed)
//
// Usage:
//   az deployment sub create --location <region> --template-file main.bicep \
//     --parameters main.bicepparam
//
// See: specs/005-ai-search-deploy/research.md (R1, R2)
// ──────────────────────────────────────────────────────────────────────────────

targetScope = 'subscription'

// ── Parameters ───────────────────────────────────────────────────────────────

@description('Azure region for all resources. Must support Azure AI Foundry Agent Service.')
param location string = 'swedencentral'

@description('Name of the resource group to create or use.')
param resourceGroupName string

@description('Name of the Azure AI Services (Foundry) account. Used to derive the custom subdomain.')
param accountName string = 'sofia-foundry'

@description('Name of the Foundry project. Provides the endpoint URL for the sofIA CLI.')
param projectName string = 'sofia-project'

@description('Name of the model deployment. Used as FOUNDRY_MODEL_DEPLOYMENT_NAME env var.')
param modelDeploymentName string = 'gpt-4.1-mini'

@description('Model name to deploy. Must support web_search_preview tool type.')
param modelName string = 'gpt-4.1-mini'

@description('Model version to deploy. Pinned for reproducibility.')
param modelVersion string = '2025-04-14'

@description('SKU name for the model deployment. GlobalStandard provides broadest region availability.')
param modelSkuName string = 'GlobalStandard'

@description('SKU capacity (TPM in thousands). Default value=5000.')
param modelSkuCapacity int = 5000

@description('Object ID of the user principal to grant Azure AI Developer access. Obtain with: az ad signed-in-user show --query id -o tsv')
param userPrincipalId string

// ── Unique suffix for globally unique names ──────────────────────────────────

var uniqueSuffix = uniqueString(subscription().subscriptionId, resourceGroupName)

// ── Resource Group ───────────────────────────────────────────────────────────

// Auto-create the resource group if it doesn't exist (FR-002)
resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

// ── Module: all resources deployed into the resource group ───────────────────

module resources 'resources.bicep' = {
  name: 'foundry-resources'
  scope: rg
  params: {
    location: location
    accountName: accountName
    projectName: projectName
    modelDeploymentName: modelDeploymentName
    modelName: modelName
    modelVersion: modelVersion
    modelSkuName: modelSkuName
    modelSkuCapacity: modelSkuCapacity
    uniqueSuffix: uniqueSuffix
    userPrincipalId: userPrincipalId
  }
}

// ── Outputs ──────────────────────────────────────────────────────────────────

@description('Foundry project endpoint URL — set as FOUNDRY_PROJECT_ENDPOINT')
output projectEndpoint string = resources.outputs.projectEndpoint

@description('Model deployment name — set as FOUNDRY_MODEL_DEPLOYMENT_NAME')
output modelDeploymentName string = modelDeploymentName
