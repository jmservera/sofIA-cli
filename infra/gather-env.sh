#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# gather-env.sh — Fetch environment values from an existing Azure AI Foundry
#                 resource group without redeploying.
#
# Queries the AI Services account and project already provisioned by deploy.sh,
# then writes (or updates) the .env file with the same variables.
#
# Usage:
#   ./infra/gather-env.sh --resource-group <name> [options]
#
# Exit codes:
#   0 — Values gathered and written successfully
#   1 — Prerequisite / parameter check failed
#   2 — Resource query failed
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────────────

SUBSCRIPTION=""
RESOURCE_GROUP=""
ACCOUNT_NAME="sofia-foundry"
MODEL=""

# ── Parameter parsing ─────────────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Required:
  -g, --resource-group <name>   Resource group containing the Foundry resources

Optional:
  -s, --subscription <id>       Azure subscription ID (default: current az CLI subscription)
  -n, --account-name <name>     AI Services account name (default: sofia-foundry)
  -m, --model <name>            Override model deployment name (default: auto-detected)
  -h, --help                    Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--subscription)
      SUBSCRIPTION="$2"; shift 2 ;;
    -g|--resource-group)
      RESOURCE_GROUP="$2"; shift 2 ;;
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

if [[ -z "$RESOURCE_GROUP" ]]; then
  echo "❌ Missing required parameter: --resource-group (-g)" >&2
  usage >&2
  exit 1
fi

# ── Prerequisite checks ──────────────────────────────────────────────────────

echo "🔍 Checking prerequisites..."

if ! command -v az &>/dev/null; then
  echo "❌ Azure CLI (az) is not installed." >&2
  echo "   Install: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli" >&2
  exit 1
fi

if ! az account show &>/dev/null; then
  echo "❌ Not logged in to Azure. Run 'az login' first." >&2
  exit 1
fi

if [[ -n "$SUBSCRIPTION" ]]; then
  echo "📋 Setting subscription to: $SUBSCRIPTION"
  if ! az account set --subscription "$SUBSCRIPTION" 2>/dev/null; then
    echo "❌ Could not set subscription '$SUBSCRIPTION'." >&2
    exit 1
  fi
fi

echo "✅ Prerequisites passed"

# ── Verify resource group exists ──────────────────────────────────────────────

echo ""
echo "🔍 Verifying resource group: $RESOURCE_GROUP"

if ! az group show --name "$RESOURCE_GROUP" &>/dev/null; then
  echo "❌ Resource group '$RESOURCE_GROUP' not found." >&2
  echo "   Run deploy.sh first to create the infrastructure." >&2
  exit 2
fi

# ── Find the AI Services account ─────────────────────────────────────────────

echo "🔍 Looking up AI Services account: $ACCOUNT_NAME"

if ! az cognitiveservices account show \
       --resource-group "$RESOURCE_GROUP" \
       --name "$ACCOUNT_NAME" &>/dev/null; then
  echo "⚠️  Account '$ACCOUNT_NAME' not found. Searching for AI Services accounts in the resource group..."
  ACCOUNT_NAME=$(az cognitiveservices account list \
    --resource-group "$RESOURCE_GROUP" \
    --query "[?kind=='AIServices'].name | [0]" \
    --output tsv 2>/dev/null || true)

  if [[ -z "$ACCOUNT_NAME" ]]; then
    echo "❌ No AI Services account found in resource group '$RESOURCE_GROUP'." >&2
    exit 2
  fi
  echo "   Found account: $ACCOUNT_NAME"
fi

# ── Find the project and its endpoint ────────────────────────────────────────

echo "🔍 Looking up Foundry project..."

PROJECT_ENDPOINT=$(az cognitiveservices account show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$ACCOUNT_NAME" \
  --query "properties.endpoints.\"AI Foundry API\"" \
  --output tsv 2>/dev/null || true)

# If the account-level endpoint isn't what we need, try querying the project
if [[ -z "$PROJECT_ENDPOINT" ]]; then
  # List projects under the account
  PROJECT_NAME=$(az resource list \
    --resource-group "$RESOURCE_GROUP" \
    --resource-type "Microsoft.CognitiveServices/accounts/projects" \
    --query "[0].name" \
    --output tsv 2>/dev/null || true)

  if [[ -n "$PROJECT_NAME" ]]; then
    # The resource name is "account/project", extract just the project part
    LOCAL_PROJECT="${PROJECT_NAME##*/}"
    echo "   Found project: $LOCAL_PROJECT"

    PROJECT_ENDPOINT=$(az rest \
      --method GET \
      --uri "https://management.azure.com/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.CognitiveServices/accounts/$ACCOUNT_NAME/projects/$LOCAL_PROJECT?api-version=2025-06-01" \
      --query "properties.endpoints.\"AI Foundry API\"" \
      --output tsv 2>/dev/null || true)
  fi
fi

if [[ -z "$PROJECT_ENDPOINT" ]]; then
  echo "❌ Could not determine the Foundry project endpoint." >&2
  echo "   Ensure a project exists under account '$ACCOUNT_NAME'." >&2
  exit 2
fi

echo "   Endpoint: $PROJECT_ENDPOINT"

# ── Find the model deployment name ───────────────────────────────────────────

if [[ -z "$MODEL" ]]; then
  echo "🔍 Looking up model deployment..."
  MODEL=$(az cognitiveservices account deployment list \
    --resource-group "$RESOURCE_GROUP" \
    --name "$ACCOUNT_NAME" \
    --query "[0].name" \
    --output tsv 2>/dev/null || true)

  if [[ -z "$MODEL" ]]; then
    echo "⚠️  No model deployment found. Using default: gpt-4.1-mini"
    MODEL="gpt-4.1-mini"
  fi
fi

echo "   Model deployment: $MODEL"

# ── Write .env file ───────────────────────────────────────────────────────────

ENV_FILE="$PWD/.env"

set_env_var() {
  local key="$1" value="$2"
  if [[ -f "$ENV_FILE" ]] && grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=\"${value}\"|" "$ENV_FILE"
  else
    echo "${key}=\"${value}\"" >> "$ENV_FILE"
  fi
}

set_env_var "FOUNDRY_PROJECT_ENDPOINT" "$PROJECT_ENDPOINT"
set_env_var "FOUNDRY_MODEL_DEPLOYMENT_NAME" "$MODEL"

# ── Output ────────────────────────────────────────────────────────────────────

echo ""
echo "✅ Environment values gathered successfully!"
echo ""
echo "Written to $(realpath "$ENV_FILE"):"
echo ""
echo "  FOUNDRY_PROJECT_ENDPOINT=\"$PROJECT_ENDPOINT\""
echo "  FOUNDRY_MODEL_DEPLOYMENT_NAME=\"$MODEL\""
echo ""
