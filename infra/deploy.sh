#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# deploy.sh — One-command Azure AI Foundry deployment for sofIA
#
# Provisions:
#   - Resource group (auto-created)
#   - AI Services account with Foundry project
#   - Model deployment (gpt-4.1-mini by default)
#   - Agent Service capability hosts
#
# Usage:
#   ./infra/deploy.sh --subscription <id> --resource-group <name> [options]
#
# Exit codes:
#   0 — Deployment succeeded
#   1 — Prerequisite check failed
#   2 — Deployment failed
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────────────

SUBSCRIPTION=""
RESOURCE_GROUP=""
LOCATION="swedencentral"
ACCOUNT_NAME="sofia-foundry"
MODEL="gpt-4.1-mini"

# ── Parameter parsing ─────────────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Required:
  -s, --subscription <id>       Azure subscription ID
  -g, --resource-group <name>   Resource group name (created if missing)

Optional:
  -l, --location <region>       Azure region (default: swedencentral)
  -n, --account-name <name>     Foundry account name (default: sofia-foundry)
  -m, --model <name>            Model deployment name (default: gpt-4.1-mini)
  -h, --help                    Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--subscription)
      SUBSCRIPTION="$2"; shift 2 ;;
    -g|--resource-group)
      RESOURCE_GROUP="$2"; shift 2 ;;
    -l|--location)
      LOCATION="$2"; shift 2 ;;
    -n|--account-name)
      ACCOUNT_NAME="$2"; shift 2 ;;
    -m|--model)
      MODEL="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "❌ Unknown option: $1" >&2
      usage >&2
      exit 1 ;;
  esac
done

# ── Validate required parameters ─────────────────────────────────────────────

if [[ -z "$SUBSCRIPTION" ]]; then
  echo "❌ Missing required parameter: --subscription (-s)" >&2
  usage >&2
  exit 1
fi

if [[ -z "$RESOURCE_GROUP" ]]; then
  echo "❌ Missing required parameter: --resource-group (-g)" >&2
  usage >&2
  exit 1
fi

# ── Prerequisite checks ──────────────────────────────────────────────────────

echo "🔍 Checking prerequisites..."

# Check az CLI is installed
if ! command -v az &>/dev/null; then
  echo "❌ Azure CLI (az) is not installed." >&2
  echo "   Install: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli" >&2
  exit 1
fi

# Check user is logged in
if ! az account show &>/dev/null; then
  echo "❌ Not logged in to Azure. Run 'az login' first." >&2
  exit 1
fi

# Set subscription
echo "📋 Setting subscription to: $SUBSCRIPTION"
if ! az account set --subscription "$SUBSCRIPTION" 2>/dev/null; then
  echo "❌ Could not set subscription '$SUBSCRIPTION'." >&2
  echo "   Check the subscription ID and your permissions." >&2
  exit 1
fi

echo "✅ Prerequisites passed"

# ── Deploy ────────────────────────────────────────────────────────────────────

echo ""
echo "🚀 Deploying Azure AI Foundry infrastructure..."
echo "   Resource Group: $RESOURCE_GROUP"
echo "   Location:       $LOCATION"
echo "   Account:        $ACCOUNT_NAME"
echo "   Model:          $MODEL"
echo ""

DEPLOYMENT_NAME="sofia-foundry-$(date +%Y%m%d%H%M%S)"

if ! az deployment sub create \
  --location "$LOCATION" \
  --name "$DEPLOYMENT_NAME" \
  --template-file "$SCRIPT_DIR/main.bicep" \
  --parameters "$SCRIPT_DIR/main.bicepparam" \
  --parameters \
    resourceGroupName="$RESOURCE_GROUP" \
    location="$LOCATION" \
    accountName="$ACCOUNT_NAME" \
    modelDeploymentName="$MODEL" \
    modelName="$MODEL" \
  --output json; then
  echo "" >&2
  echo "❌ Deployment failed." >&2
  echo "   Check the error above for details." >&2
  echo "   Common issues:" >&2
  echo "   - Insufficient permissions (need Owner or Contributor)" >&2
  echo "   - Region doesn't support AI Foundry Agent Service" >&2
  echo "   - Resource name conflict (try a different --account-name)" >&2
  exit 2
fi

# ── Query outputs ─────────────────────────────────────────────────────────────

PROJECT_ENDPOINT=$(az deployment sub show \
  --name "$DEPLOYMENT_NAME" \
  --query "properties.outputs.projectEndpoint.value" \
  --output tsv 2>/dev/null || echo "")

MODEL_DEPLOYMENT_NAME=$(az deployment sub show \
  --name "$DEPLOYMENT_NAME" \
  --query "properties.outputs.modelDeploymentName.value" \
  --output tsv 2>/dev/null || echo "$MODEL")

# ── Output ────────────────────────────────────────────────────────────────────

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Set these environment variables to configure sofIA:"
echo ""
echo "  export FOUNDRY_PROJECT_ENDPOINT=\"$PROJECT_ENDPOINT\""
echo "  export FOUNDRY_MODEL_DEPLOYMENT_NAME=\"$MODEL_DEPLOYMENT_NAME\""
echo ""
echo "To tear down: ./infra/teardown.sh --resource-group $RESOURCE_GROUP"
