# Research: AI Foundry Search Service Deployment

**Feature**: 005-ai-search-deploy  
**Date**: 2026-03-01  
**Status**: Complete — all NEEDS CLARIFICATION items resolved

## R1: Azure AI Foundry Bicep Resource Types

**Decision**: Use `Microsoft.CognitiveServices` resource provider (API version `2025-06-01`) with 5 resources for the basic agent setup.

**Rationale**: The basic (Microsoft-managed) setup minimizes complexity — no BYO Storage, Key Vault, Cosmos DB, or AI Search needed. Microsoft manages these behind the scenes. This aligns with FR-008 (basic agent setup) and the workshop/PoC use case.

**Required Resources**:

| # | Bicep Resource Type | Purpose |
|---|---------------------|---------|
| 1 | `Microsoft.CognitiveServices/accounts` (kind: `AIServices`) | Foundry account with `allowProjectManagement: true` and `customSubDomainName` |
| 2 | `Microsoft.CognitiveServices/accounts/deployments` | Model deployment (default: `gpt-4.1-mini`, version `2025-04-14`, SKU `GlobalStandard`) |
| 3 | `Microsoft.CognitiveServices/accounts/projects` | Foundry project — provides the endpoint URL |
| 4 | `Microsoft.CognitiveServices/accounts/capabilityHosts` | Account-level capability host (`capabilityHostKind: 'Agents'`) |
| 5 | `Microsoft.CognitiveServices/accounts/projects/capabilityHosts` | Project-level capability host (basic setup = empty connections) |

**Alternatives considered**:
- **Azure Verified Module (`br/public:avm/ptn/ai-ml/ai-foundry`)**: Less transparent, harder to document each resource per FR-011. Rejected for PoC simplicity.
- **Standard agent setup (BYO resources)**: Requires Cosmos DB, Storage, Key Vault, AI Search, multiple role assignments. Over-engineered for workshop scenario.

**Gotchas**:
- `customSubDomainName` is mandatory and must be globally unique — generate with a suffix (e.g., `sofia-<uniqueString>`)
- `allowProjectManagement: true` is required for child projects
- Capability hosts cannot be updated after creation; must delete and recreate
- Account capability host must be created before project capability host (`dependsOn`)
- Model deployment must exist before the account capability host references it

## R2: Model Deployment Configuration

**Decision**: Default to `gpt-4.1-mini` with `GlobalStandard` SKU, version `2025-04-14`.

**Rationale**: `gpt-4.1-mini` supports `web_search_preview` and is cost-effective for workshop scenarios. `GlobalStandard` SKU routes to the nearest available region, providing the broadest availability. The spec (FR-012) explicitly requires `gpt-4.1-mini` as default.

**Alternatives considered**:
- **`gpt-4.1`**: More capable but higher cost. Unnecessary for web search query routing.
- **`gpt-4o-mini`**: Also supported but `gpt-4.1-mini` is newer and matches the spec decision.
- **`Standard` SKU**: Regional-only deployment; model must be available in the exact account region. More restrictive than `GlobalStandard`.

## R3: `web_search_preview` Region and Model Support

**Decision**: No region restrictions — `web_search_preview` is available in all 23 Agent Service regions, including `swedencentral`.

**Rationale**: Research confirms web search is universally available across all Agent Service regions. No deployment script region validation needed beyond basic AI Services availability.

**Supported model families**: gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, gpt-4o, gpt-4o-mini, o3, o4-mini, o3-mini, o1, gpt-5. Notably NOT supported: DeepSeek, Llama, Grok.

## R4: @azure/ai-projects SDK Integration Pattern

**Decision**: Use `@azure/ai-projects@beta` (v2.x preview) with `AIProjectClient`, `agents.createVersion()`, and OpenAI-style `responses.create()` pattern.

**Rationale**: This is the current official SDK documented at learn.microsoft.com for the Foundry Agent Service. It replaces the older `@azure/ai-agents` package and provides a unified API for agent lifecycle management.

**Key API Pattern**:

```typescript
import { DefaultAzureCredential } from "@azure/identity";
import { AIProjectClient } from "@azure/ai-projects";

// 1. Create client
const project = new AIProjectClient(endpoint, new DefaultAzureCredential());
const openAIClient = await project.getOpenAIClient();

// 2. Create ephemeral agent with web search
const agent = await project.agents.createVersion("sofia-web-search", {
  kind: "prompt",
  model: deploymentName,
  instructions: "You are a web search assistant...",
  tools: [{ type: "web_search_preview" }],
});

// 3. Create conversation, send message, get response
const conversation = await openAIClient.conversations.create();
const response = await openAIClient.responses.create(
  { conversation: conversation.id, input: query },
  { body: { agent: { name: agent.name, type: "agent_reference" } } },
);

// 4. Extract citations
for (const item of response.output) {
  if (item.type === "message") {
    for (const content of item.content) {
      if (content.type === "output_text" && content.annotations) {
        for (const annotation of content.annotations) {
          if (annotation.type === "url_citation") {
            // { url, start_index, end_index }
          }
        }
      }
    }
  }
}

// 5. Cleanup
await openAIClient.conversations.delete(conversation.id);
await project.agents.deleteVersion(agent.name, agent.version);
```

**Alternatives considered**:
- **`@azure/ai-agents` (classic API)**: Older `AgentsClient` with threads/runs pattern. Still works but being superseded by `AIProjectClient`.
- **Raw HTTP POST (current pattern)**: Requires manual token management, no built-in credential chain. Rejected for security and maintainability.

## R5: Authentication Migration

**Decision**: Replace API key auth (`SOFIA_FOUNDRY_AGENT_KEY`) with `DefaultAzureCredential` from `@azure/identity`.

**Rationale**: `DefaultAzureCredential` provides a credential chain that automatically discovers the best available credential (Azure CLI → Managed Identity → Environment). Eliminates secrets from environment variables. Aligns with FR-013 and the secure-by-default constitution principle.

**Credential chain order** (what `DefaultAzureCredential` tries):
1. `EnvironmentCredential` (`AZURE_CLIENT_ID` + `AZURE_TENANT_ID` + `AZURE_CLIENT_SECRET`)
2. `WorkloadIdentityCredential` (Kubernetes)
3. `ManagedIdentityCredential` (Azure-hosted)
4. `AzureDeveloperCliCredential` (`azd auth login`)
5. `AzureCliCredential` (`az login`)
6. `AzurePowerShellCredential` (`Connect-AzAccount`)

**Required RBAC role**: `Azure AI User` at the Foundry project scope.

**Environment variables (new)**:
- `FOUNDRY_PROJECT_ENDPOINT` — e.g. `https://<name>.services.ai.azure.com/api/projects/<project>`
- `FOUNDRY_MODEL_DEPLOYMENT_NAME` — e.g. `gpt-4.1-mini`

**Migration behavior** (FR-016): If legacy `SOFIA_FOUNDRY_AGENT_ENDPOINT` or `SOFIA_FOUNDRY_AGENT_KEY` are detected, CLI emits an error message with migration instructions. Old vars are never used.

## R6: Deployment Script Design

**Decision**: Bash script (`deploy.sh`) wrapping `az deployment sub create` for subscription-level Bicep deployment, with prerequisite validation.

**Rationale**: Bash is portable across Linux, macOS, and WSL/Git Bash (FR-010). Subscription-level deployment is needed because the script auto-creates the resource group (FR-002). `az deployment sub create` handles this natively.

**Script flow**:
1. Validate prerequisites: `az` CLI installed, user logged in, subscription accessible
2. Accept parameters: subscription ID, resource group name, region (default: `swedencentral`), account name, model (default: `gpt-4.1-mini`)
3. Generate unique subdomain name from account name
4. Run `az deployment sub create` with Bicep template
5. Query outputs: project endpoint URL, model deployment name
6. Print configuration instructions for `FOUNDRY_PROJECT_ENDPOINT` and `FOUNDRY_MODEL_DEPLOYMENT_NAME`

**Teardown script** (`teardown.sh`):
1. Accept resource group name
2. Validate resource group exists (informational exit if not)
3. Run `az group delete --yes --no-wait` for non-blocking deletion

## R7: Copilot SDK Tool Registration

**Decision**: Keep the existing `web.search` tool name and `ToolDefinition` interface. The handler function internally calls the Foundry Agent Service SDK instead of raw HTTP.

**Rationale**: The Copilot SDK tool contract (tool name, parameters, handler signature) is unchanged — only the implementation behind `createWebSearchTool()` changes. This maintains backward compatibility with prompt references (`discover.md`, `develop.md`) and the `mcpContextEnricher.ts` integration.

**Integration pattern**: The `createWebSearchTool()` factory creates the `AIProjectClient` and an ephemeral agent on first call. The agent and conversation are reused for the session lifetime. On session end (or error), the agent and conversation are cleaned up.

**Alternatives considered**:
- **Create agent per query**: Too expensive — agent creation has latency. Rejected.
- **Persistent agent (not deleted)**: Would accumulate agents in the Foundry project. Rejected per FR-015 (ephemeral lifecycle).
- **Lazy initialization**: Agent created on first `web.search` call, not on session start. This avoids agent creation overhead when web search is never invoked. **This is the chosen pattern** — create lazily, delete on session end.

## R8: Ephemeral Agent Lifecycle

**Decision**: Lazy creation on first web search call, automatic deletion on process exit or session end.

**Rationale**: Creating the agent at session start adds unnecessary latency if web search is never used. Creating on first call amortizes the cost and ensures cleanup happens reliably.

**Implementation**:
- `webSearch.ts` maintains a module-level `AgentSession` (agent ID, conversation ID, client references)
- First call to `web.search` handler triggers `AgentSession.initialize()` — creates agent + conversation
- Subsequent calls reuse the same agent and conversation
- `AgentSession.cleanup()` deletes the conversation and agent version
- Register cleanup via `process.on('beforeExit', ...)` and expose a `destroyWebSearchSession()` for explicit cleanup from the workshop command

## R9: New Dependencies Impact

**Decision**: Add `@azure/ai-projects@beta` and `@azure/identity` as production dependencies.

**Impact assessment**:
- `@azure/identity` is well-maintained (v4.13.0+), widely used, no known security issues
- `@azure/ai-projects@beta` is in preview — API may change. Pin to a specific beta version for stability
- Both are tree-shakeable ESM packages
- No conflicting peer dependencies with existing packages (`commander`, `zod`, `pino`, etc.)
- TypeScript types are included in both packages

**Alternatives considered**:
- **Optional dependencies**: Would complicate the build. Since web search is a core workshop tool, these should be required dependencies.
