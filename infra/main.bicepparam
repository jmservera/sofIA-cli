using 'main.bicep'

// ── Default parameters for workshop/PoC deployment ───────────────────────────
// Override at deploy time via:
//   az deployment sub create --parameters resourceGroupName='my-rg' location='eastus'

param resourceGroupName = 'sofia-rg'
param location = 'swedencentral'
param accountName = 'sofia-foundry'
param projectName = 'sofia-project'
param modelDeploymentName = 'gpt-4.1-mini'
param modelName = 'gpt-4.1-mini'
param modelVersion = '2025-04-14'
param modelSkuName = 'GlobalStandard'
param modelSkuCapacity = 1

// Resolved at deploy time by deploy.sh via: az ad signed-in-user show --query id -o tsv
param userPrincipalId = ''
