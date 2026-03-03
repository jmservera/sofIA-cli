# Data Model: AI Foundry Search Service Deployment

**Feature**: 005-ai-search-deploy  
**Date**: 2026-03-01

## Entities

### 1. FoundryDeploymentConfig

Configuration for the Bicep deployment. Captured as Bicep parameters and passed via the deployment script.

| Field | Type | Required | Default | Constraints | Notes |
|-------|------|----------|---------|-------------|-------|
| `subscriptionId` | string | yes | — | Valid Azure subscription GUID | From `az account show` or user input |
| `resourceGroupName` | string | yes | — | 1-90 chars, alphanumeric + `-_.()`  | Auto-created if missing (FR-002) |
| `location` | string | no | `swedencentral` | Valid Azure region with Agent Service | FR-004 |
| `accountName` | string | no | `sofia-foundry` | 2-64 chars, `^[a-zA-Z0-9][a-zA-Z0-9_.-]*$` | Used to derive `customSubDomainName` |
| `projectName` | string | no | `sofia-project` | 2-64 chars | Child of account |
| `modelDeploymentName` | string | no | `gpt-4.1-mini` | Valid model deployment name | FR-012 |
| `modelName` | string | no | `gpt-4.1-mini` | Must support `web_search_preview` | See research.md R3 |
| `modelVersion` | string | no | `2025-04-14` | Valid model version | Pinned for reproducibility |
| `modelSkuName` | string | no | `GlobalStandard` | `GlobalStandard` or `Standard` | GlobalStandard for broadest availability |
| `modelSkuCapacity` | int | no | `1` | ≥1 (TPM in thousands) | Sufficient for workshop usage |

### 2. FoundryDeploymentOutput

Output produced by the deployment script. Used to configure the sofIA CLI.

| Field | Type | Description |
|-------|------|-------------|
| `projectEndpoint` | string | Foundry project endpoint URL (e.g., `https://<name>.services.ai.azure.com/api/projects/<project>`) |
| `modelDeploymentName` | string | Model deployment name (e.g., `gpt-4.1-mini`) |
| `resourceGroupName` | string | Resource group containing the deployment (for teardown) |
| `accountName` | string | Foundry account name |

### 3. WebSearchConfig (updated)

Runtime configuration for the `web.search` Copilot SDK tool. Replaces the current `WebSearchConfig` interface in `src/mcp/webSearch.ts`.

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| `projectEndpoint` | string | yes | `FOUNDRY_PROJECT_ENDPOINT` env var | Replaces `endpoint` |
| `modelDeploymentName` | string | yes | `FOUNDRY_MODEL_DEPLOYMENT_NAME` env var | New field |

**Removed fields** (from current `WebSearchConfig`):
- `endpoint` → replaced by `projectEndpoint`
- `apiKey` → eliminated (using `DefaultAzureCredential`)
- `fetchFn` → eliminated (using SDK, not raw fetch)

### 4. AgentSession

Internal state for the ephemeral web search agent, managed within `webSearch.ts`. Not persisted — exists only in memory during a CLI session.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `client` | `AIProjectClient` | yes | Created once per session |
| `openAIClient` | OpenAI client ref | yes | From `client.getOpenAIClient()` |
| `agentName` | string | yes | Agent name (e.g., `sofia-web-search`) |
| `agentVersion` | string | yes | Version returned by `createVersion()` |
| `conversationId` | string | yes | Thread/conversation for message exchange |
| `initialized` | boolean | yes | Tracks lazy initialization state |

**State transitions**:
```
[Uninitialized] → (first web.search call) → [Initialized] → (session end / error) → [Cleaned Up]
```

- **Uninitialized → Initialized**: On first `web.search` call, creates `AIProjectClient`, agent, and conversation.
- **Initialized → Cleaned Up**: On `destroyWebSearchSession()` call or `process.beforeExit`, deletes conversation and agent version.
- If cleanup fails, log warning but do not throw — stale agents will be cleaned up manually or by TTL.

### 5. WebSearchResult (unchanged)

The existing `WebSearchResult` interface remains structurally identical but gains citation data from `url_citation` annotations.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `results` | `WebSearchResultItem[]` | yes | Structured search results |
| `sources` | `string[]` | no | Deduplicated citation URLs (FR-014) |
| `degraded` | boolean | no | `true` if Foundry unavailable/error |
| `error` | string | no | Error message when degraded |

### 6. WebSearchResultItem (updated)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | yes | Page title (extracted from citation or response) |
| `url` | string | yes | Source URL from `url_citation` annotation |
| `snippet` | string | yes | Relevant text excerpt |

### 7. LegacyEnvVarError

Not a data model entity but a specific error condition (FR-016).

| Condition | Action |
|-----------|--------|
| `SOFIA_FOUNDRY_AGENT_ENDPOINT` is set | Emit error: "Legacy env var detected. Migrate to FOUNDRY_PROJECT_ENDPOINT. See docs/environment.md" |
| `SOFIA_FOUNDRY_AGENT_KEY` is set | Emit error: "Legacy env var detected. API key auth is no longer used. See docs/environment.md" |

Checked during preflight (`preflight.ts`). Fails the preflight check with `required: true`.

## Relationships

```
FoundryDeploymentConfig ──(deploys to)──> Azure Resources
                                              │
                                              ├── Foundry Account
                                              │     ├── Model Deployment
                                              │     └── Account Capability Host
                                              └── Foundry Project
                                                    └── Project Capability Host

FoundryDeploymentOutput ──(configures)──> WebSearchConfig (runtime)
                                              │
                                              └── AgentSession (lazy, in-memory)
                                                    │
                                                    ├── AIProjectClient
                                                    ├── Agent (ephemeral)
                                                    └── Conversation
                                                          │
                                                          └── WebSearchResult + citations
```

## Validation Rules

1. **`projectEndpoint`** must match pattern: `https://*.services.ai.azure.com/api/projects/*`
2. **`modelDeploymentName`** must be non-empty string, no whitespace
3. **Legacy env vars**: Presence of `SOFIA_FOUNDRY_AGENT_ENDPOINT` or `SOFIA_FOUNDRY_AGENT_KEY` is a hard error (FR-016)
4. **Bicep parameters**: `accountName` must be unique within the resource group; `customSubDomainName` must be globally unique
5. **Agent cleanup**: Must attempt cleanup even on error; log warnings but do not throw on cleanup failure
