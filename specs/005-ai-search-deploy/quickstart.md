# Quickstart: AI Foundry Search Service Deployment

**Feature**: 005-ai-search-deploy  
**Date**: 2026-03-01

## Prerequisites

- **Azure CLI** installed and logged in (`az login`)
- **Azure subscription** with Owner or Contributor permissions
- **Node.js 20+** for running the sofIA CLI
- **Bash shell** (Linux, macOS, or Windows WSL/Git Bash)

## 1. Deploy the Infrastructure

```bash
# From the repository root (uses your current az CLI subscription)
./infra/deploy.sh --resource-group sofia-workshop-rg
```

This provisions:

- Azure AI Foundry account with SystemAssigned managed identity
- Model deployment (`gpt-4.1-mini` by default)
- Foundry project with Agent Service capability enabled

**Customize** (optional):

```bash
./infra/deploy.sh \
  --resource-group sofia-workshop-rg \
  --subscription <id> \
  --location eastus \
  --account-name my-foundry \
  --model gpt-4o-mini
```

## 2. Configure sofIA

After deployment, the script automatically writes the required environment variables to a `.env` file in the workspace root:

```bash
FOUNDRY_PROJECT_ENDPOINT="https://sofia-foundry-abc123.services.ai.azure.com/api/projects/sofia-project"
FOUNDRY_MODEL_DEPLOYMENT_NAME="gpt-4.1-mini"
```

The sofIA CLI loads this `.env` file automatically at startup — no manual configuration needed.

> **Note**: No API key needed. sofIA authenticates using your Azure login credentials (`az login`).

## 3. Verify Web Search

Start a sofIA workshop session:

```bash
sofia workshop --new-session
```

During the **Discover** phase, describe a real company. sofIA will automatically invoke the `web.search` tool to research the company, its competitors, and industry trends. Search results include clickable source URLs.

## 4. Teardown (When Done)

```bash
./infra/teardown.sh --resource-group sofia-workshop-rg
```

This deletes the resource group and all contained Azure resources to stop billing.

## Migrating from Legacy Configuration

If you previously used `SOFIA_FOUNDRY_AGENT_ENDPOINT` / `SOFIA_FOUNDRY_AGENT_KEY`:

1. **Remove** the old variables from your environment
2. **Set** the new variables (`FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_MODEL_DEPLOYMENT_NAME`)
3. **Ensure** you are logged in via `az login`

The CLI will display an error if it detects the old variables, guiding you through the migration.

## Troubleshooting

| Symptom                                  | Cause                                | Fix                                                                                                       |
| ---------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| "Web search not configured"              | Env vars not set                     | Set `FOUNDRY_PROJECT_ENDPOINT` and `FOUNDRY_MODEL_DEPLOYMENT_NAME`                                        |
| "Azure authentication failed"            | Not logged in or token expired       | Run `az login`                                                                                            |
| "Legacy web search env vars detected"    | Old `SOFIA_FOUNDRY_*` vars still set | Remove them, set new vars                                                                                 |
| Deploy fails: "subscription not found"   | Wrong subscription selected          | Run `az account set --subscription <id>`                                                                  |
| Deploy fails: "insufficient permissions" | Not Owner/Contributor                | Ask an admin to grant access                                                                              |
| Web search returns no results            | Model didn't use web search          | This is normal — the model decides when to search                                                         |
| "Web search disabled at subscription"    | Admin blocked the tool               | Run `az feature unregister --name OpenAI.BlockedTools.web_search --namespace Microsoft.CognitiveServices` |

## Cost Expectations

- **Foundry account**: Free (billing is per-usage)
- **Model deployment**: Pay-per-token for `gpt-4.1-mini` queries
- **Grounding with Bing Search**: Usage-based ([pricing](https://www.microsoft.com/bing/apis/grounding-pricing))
- **Typical workshop**: A few dozen web search queries — minimal cost
- **Teardown immediately after workshop** to avoid idle resource charges
