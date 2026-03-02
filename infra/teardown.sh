#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# teardown.sh — Remove Azure AI Foundry resources deployed by deploy.sh
#
# Deletes the specified resource group and all contained resources.
# Clean exit (0) when the resource group doesn't exist.
#
# Usage:
#   ./infra/teardown.sh --resource-group <name> [--yes]
#
# Exit codes:
#   0 — Teardown succeeded or resource group doesn't exist
#   1 — Prerequisite check failed
#   2 — Deletion failed
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────

RESOURCE_GROUP=""
AUTO_CONFIRM=false

# ── Parameter parsing ─────────────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Required:
  -g, --resource-group <name>   Resource group to delete

Optional:
  --yes                         Skip confirmation prompt
  -h, --help                    Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -g|--resource-group)
      RESOURCE_GROUP="$2"; shift 2 ;;
    --yes)
      AUTO_CONFIRM=true; shift ;;
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

echo "✅ Prerequisites passed"

# ── Check if resource group exists ────────────────────────────────────────────

echo ""
echo "🔍 Checking resource group: $RESOURCE_GROUP"

RG_EXISTS=$(az group exists --name "$RESOURCE_GROUP" 2>/dev/null || echo "false")

if [[ "$RG_EXISTS" != "true" ]]; then
  echo "ℹ️  Resource group '$RESOURCE_GROUP' does not exist. Nothing to delete."
  exit 0
fi

# ── Confirm deletion ─────────────────────────────────────────────────────────

if [[ "$AUTO_CONFIRM" != "true" ]]; then
  echo ""
  echo "⚠️  This will delete resource group '$RESOURCE_GROUP' and ALL its resources."
  read -rp "Are you sure? (y/N): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

# ── Delete resource group ────────────────────────────────────────────────────

echo ""
echo "🗑️  Deleting resource group: $RESOURCE_GROUP"

if ! az group delete --name "$RESOURCE_GROUP" --yes --no-wait; then
  echo "" >&2
  echo "❌ Failed to delete resource group '$RESOURCE_GROUP'." >&2
  exit 2
fi

echo "✅ Resource group '$RESOURCE_GROUP' deletion initiated (non-blocking)."
echo "   Resources will be fully removed within a few minutes."
