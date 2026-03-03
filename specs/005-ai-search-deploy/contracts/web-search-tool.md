# Contract: `web.search` Copilot SDK Tool

**Feature**: 005-ai-search-deploy  
**Date**: 2026-03-01  
**Interface type**: Copilot SDK custom tool (registered via `ToolDefinition`)

## Overview

The `web.search` tool is exposed to the LLM through the GitHub Copilot SDK's tool registration system. When invoked, it queries the Azure AI Foundry Agent Service (with `web_search_preview` enabled) and returns structured results with URL citations.

## Tool Definition

```typescript
const WEB_SEARCH_TOOL_DEFINITION: ToolDefinition = {
  name: 'web.search',
  description:
    'Search the web for information about companies, industries, technologies, and trends. ' +
    'Returns structured results with title, URL, and snippet.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query string.',
      },
    },
    required: ['query'],
  },
};
```

**Contract stability**: The tool name (`web.search`), parameter schema, and return format are stable contracts referenced by multiple prompts (`discover.md`, `develop.md`) and the `mcpContextEnricher.ts` module. Changes require updating all consumers.

## Input

| Parameter | Type   | Required | Description                                                         |
| --------- | ------ | -------- | ------------------------------------------------------------------- |
| `query`   | string | yes      | Web search query (e.g., "Contoso Ltd competitors in healthcare AI") |

## Output

### Success response

```typescript
interface WebSearchResult {
  results: WebSearchResultItem[];
  sources?: string[]; // Deduplicated citation URLs
  degraded?: false;
}

interface WebSearchResultItem {
  title: string; // Page title from citation
  url: string; // Source URL (from url_citation annotation)
  snippet: string; // Relevant text excerpt
}
```

**Example**:

```json
{
  "results": [
    {
      "title": "Contoso Ltd - Healthcare AI Solutions",
      "url": "https://contoso.com/about",
      "snippet": "Contoso Ltd is a leading provider of AI-powered healthcare solutions..."
    },
    {
      "title": "Top Healthcare AI Companies 2026 - TechReview",
      "url": "https://techreview.com/healthcare-ai-2026",
      "snippet": "The healthcare AI market is dominated by... Contoso ranks #3..."
    }
  ],
  "sources": ["https://contoso.com/about", "https://techreview.com/healthcare-ai-2026"]
}
```

### Degraded response

Returned when the Foundry Agent Service is unavailable, misconfigured, or returns an error. The workshop continues without web search capabilities.

```json
{
  "results": [],
  "degraded": true,
  "error": "Foundry agent returned 401 Unauthorized — run `az login` to refresh credentials"
}
```

### Degradation scenarios

| Condition                          | `degraded` | `error` message                                                                              |
| ---------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `FOUNDRY_PROJECT_ENDPOINT` not set | `true`     | "Web search not configured — set FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_MODEL_DEPLOYMENT_NAME" |
| `DefaultAzureCredential` fails     | `true`     | "Azure authentication failed — run `az login`"                                               |
| Agent creation fails               | `true`     | "Failed to create web search agent: {details}"                                               |
| Query returns error                | `true`     | "Web search query failed: {status} {message}"                                                |
| Network error                      | `true`     | "Network error: {message}"                                                                   |
| Rate limited (429)                 | `true`     | "Web search rate limited — retry in {seconds}s"                                              |

## Integration Points

### Consuming prompts

- [src/prompts/discover.md](../../src/prompts/discover.md): `**web.search**: Research the user's industry, competitors, and trends`
- [src/prompts/develop.md](../../src/prompts/develop.md): `**web.search** — Use when stuck on an implementation pattern`

### Consuming code

- `src/develop/mcpContextEnricher.ts`: Calls `isWebSearchConfigured()` to conditionally query web search when stuck for 2+ iterations
- `src/cli/preflight.ts` (new): Legacy env var detection check (FR-016)

## Configuration Contract

### Required environment variables

| Variable                        | Example                                                                         | Description                              |
| ------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------- |
| `FOUNDRY_PROJECT_ENDPOINT`      | `https://sofia-foundry-abc123.services.ai.azure.com/api/projects/sofia-project` | Foundry project endpoint URL             |
| `FOUNDRY_MODEL_DEPLOYMENT_NAME` | `gpt-4.1-mini`                                                                  | Model deployment name for agent creation |

### Authentication

Uses `DefaultAzureCredential` — no API key environment variables. User must be logged in via `az login` (local development) or have a managed identity (Azure-hosted).

### Legacy env var rejection (FR-016)

If either `SOFIA_FOUNDRY_AGENT_ENDPOINT` or `SOFIA_FOUNDRY_AGENT_KEY` is set:

- Preflight check fails with `required: true`
- Error message: `"Legacy web search env vars detected. Migrate: replace SOFIA_FOUNDRY_AGENT_ENDPOINT with FOUNDRY_PROJECT_ENDPOINT and remove SOFIA_FOUNDRY_AGENT_KEY (API key auth is no longer used). See docs/environment.md"`

## Lifecycle Contract

### Initialization (lazy)

```
Session starts → web.search NOT invoked → no agent created (zero overhead)
Session starts → web.search invoked → agent + conversation created → reused for session
```

### Cleanup

```
Session ends → destroyWebSearchSession() called → conversation deleted → agent version deleted
Process exit → process.beforeExit handler → same cleanup
Cleanup fails → warning logged → no throw (stale agent cleaned manually)
```

### Public API

```typescript
// Check if web search can be used (env vars present)
function isWebSearchConfigured(): boolean;

// Create the tool handler function
function createWebSearchTool(config: WebSearchConfig): (query: string) => Promise<WebSearchResult>;

// Explicitly clean up the ephemeral agent and conversation
function destroyWebSearchSession(): Promise<void>;
```

---

# Contract: Deployment Script CLI

**Interface type**: Shell script (Bash)

## `deploy.sh`

### Usage

```bash
./infra/deploy.sh \
  --resource-group <resource-group-name> \
  [--subscription <subscription-id>] \
  [--location <azure-region>] \
  [--account-name <foundry-account-name>] \
  [--model <model-deployment-name>]
```

### Parameters

| Flag                     | Required | Default                     | Description                              |
| ------------------------ | -------- | --------------------------- | ---------------------------------------- |
| `--resource-group`, `-g` | yes      | —                           | Resource group name (created if missing) |
| `--subscription`, `-s`   | no       | current az CLI subscription | Azure subscription ID                    |
| `--location`, `-l`       | no       | `swedencentral`             | Azure region                             |
| `--account-name`, `-n`   | no       | `sofia-foundry`             | Foundry account name                     |
| `--model`, `-m`          | no       | `gpt-4.1-mini`              | Model deployment name                    |

### Exit codes

| Code | Meaning                                                 |
| ---- | ------------------------------------------------------- |
| 0    | Deployment succeeded                                    |
| 1    | Prerequisite check failed (az CLI, login, subscription) |
| 2    | Deployment failed (Bicep error)                         |

### Output (stdout on success)

The script writes `FOUNDRY_PROJECT_ENDPOINT` and `FOUNDRY_MODEL_DEPLOYMENT_NAME` to a `.env` file in the workspace root (creating or updating it), then prints:

```
✅ Deployment complete!

Environment variables written to /path/to/workspace/.env:

  FOUNDRY_PROJECT_ENDPOINT="https://sofia-foundry-abc123.services.ai.azure.com/api/projects/sofia-project"
  FOUNDRY_MODEL_DEPLOYMENT_NAME="gpt-4.1-mini"

To tear down: ./infra/teardown.sh --resource-group <resource-group-name>
```

## `teardown.sh`

### Usage

```bash
./infra/teardown.sh --resource-group <resource-group-name>
```

### Parameters

| Flag                     | Required | Default | Description              |
| ------------------------ | -------- | ------- | ------------------------ |
| `--resource-group`, `-g` | yes      | —       | Resource group to delete |

### Exit codes

| Code | Meaning                                            |
| ---- | -------------------------------------------------- |
| 0    | Teardown succeeded or resource group doesn't exist |
| 1    | Prerequisite check failed                          |
| 2    | Deletion failed                                    |

### Behavior

- If resource group doesn't exist: prints informational message, exits 0
- Prompts for confirmation before deletion (unless `--yes` flag)
- Uses `az group delete --yes --no-wait` for non-blocking deletion
