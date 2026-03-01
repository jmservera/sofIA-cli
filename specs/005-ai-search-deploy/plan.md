# Implementation Plan: AI Foundry Search Service Deployment

**Branch**: `005-ai-search-deploy` | **Date**: 2026-03-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-ai-search-deploy/spec.md`

## Summary

Provide one-command deployment of Azure AI Foundry infrastructure (account, project, model deployment) via Bicep + shell script, and migrate the sofIA CLI's `web.search` tool from raw HTTP + API key (`SOFIA_FOUNDRY_AGENT_ENDPOINT`/`SOFIA_FOUNDRY_AGENT_KEY`) to the `@azure/ai-projects` SDK with `DefaultAzureCredential` auth and ephemeral `web_search_preview` agents. Includes teardown, prerequisite validation, and clean-break migration from legacy env vars.

## Technical Context

**Language/Version**: Node.js 20 LTS + TypeScript 5.3, Bash (deployment scripts), Bicep (IaC)  
**Primary Dependencies**: `@github/copilot-sdk ^0.1.28`, `@azure/ai-projects` (new), `@azure/identity` (new), `zod ^4.3.6`  
**Storage**: N/A (stateless infrastructure provisioning; session state handled by existing `SessionStore`)  
**Testing**: Vitest 4.x (unit + integration), TDD Red→Green→Review per constitution  
**Target Platform**: CLI — Linux, macOS, Windows (WSL/Git Bash); Azure for infrastructure deployment  
**Project Type**: CLI tool + Infrastructure-as-Code  
**Performance Goals**: Web search query returns grounded results with citations within 10 seconds (SC-003)  
**Constraints**: Deploy completes in <15 minutes (SC-001); teardown in <10 minutes (SC-004); agent lifecycle is ephemeral (created/deleted per CLI session)  
**Scale/Scope**: Workshop/PoC usage — small number of queries per session; single resource group deployment

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Default gates for this repository (sofIA Copilot CLI) — derived from `.specify/memory/constitution.md`:

- **Outcome-first discovery**: ✅ PASS — Deploys the web search backend that enables real-time company/industry research during the Discover phase (Step 1). Directly ties to the workshop's core value: grounding ideation in real-world context.
- **Secure-by-default**: ✅ PASS — Migrates from API key auth (`SOFIA_FOUNDRY_AGENT_KEY`) to `DefaultAzureCredential` (least privilege, no secrets in env vars). Legacy key vars trigger an error, not silent fallback. Logger redaction remains.
- **Node.js + TypeScript**: ✅ PASS — CLI integration uses `@azure/ai-projects` + `@azure/identity` TypeScript SDKs. Bicep + Bash for infrastructure only (not runtime code).
- **MCP-first**: ⚠️ EXCEPTION — The Foundry Agent Service does not expose an MCP server; the `@azure/ai-projects` SDK is the only supported integration surface. The tool is still registered as a Copilot SDK tool (`web.search`) and used by MCP-aware phases. Documented in Complexity Tracking.
- **Test-first (NON-NEGOTIABLE)**: ✅ PASS — All SDK integration code must follow Red→Green→Review. Unit tests for config validation, credential detection, and migration error. Integration tests with fakes for agent create/query/delete lifecycle. Bash deployment script validated via dry-run tests.
- **CLI transparency**: ✅ PASS — Deployment script streams progress (`az deployment` output, prerequisite check results, resource provisioning status). CLI surfaces web search availability/degradation to user. Teardown confirms resource deletion.

## Project Structure

### Documentation (this feature)

```text
specs/005-ai-search-deploy/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── web-search-tool.md
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
infra/                          # NEW — Infrastructure-as-Code
├── main.bicep                  # Foundry account, project, model deployment
├── main.bicepparam             # Default parameters (swedencentral, gpt-4.1-mini)
├── deploy.sh                   # One-command deployment script (FR-002)
└── teardown.sh                 # Resource group deletion (FR-007)

src/
├── mcp/
│   └── webSearch.ts            # MODIFIED — Migrate from raw HTTP + API key
│                               #   to @azure/ai-projects SDK + DefaultAzureCredential
│                               #   + ephemeral agent lifecycle (create/query/delete)
├── cli/
│   └── preflight.ts            # MODIFIED — Add legacy env var detection check (FR-016)
├── shared/
│   └── copilotClient.ts        # UNCHANGED — ToolDefinition interface still used
└── develop/
    └── mcpContextEnricher.ts   # MODIFIED — Update isWebSearchConfigured() import

docs/
└── environment.md              # MODIFIED — Update env var documentation

tests/
├── unit/
│   ├── webSearch.spec.ts       # NEW — Config validation, credential auth, migration error
│   └── infraDeploy.spec.ts     # NEW — Deploy script parameter validation (dry-run)
└── integration/
    └── webSearchAgent.spec.ts  # NEW — Ephemeral agent lifecycle with fakes
```

**Structure Decision**: Single project layout (Option 1) with a new `infra/` directory at the repository root for Bicep templates and deployment scripts. This follows Azure conventions and keeps infrastructure separate from application code. The `src/mcp/webSearch.ts` module is modified in-place (not moved) since it already has the correct responsibility boundary.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| MCP-first exception: direct SDK call to Foundry Agent Service | Azure AI Foundry Agent Service has no MCP server; `@azure/ai-projects` is the only supported client SDK. The tool is still exposed as a Copilot SDK tool and consumed by MCP-aware phases. | No MCP adapter exists for this service. Writing a custom MCP proxy would add complexity with no ecosystem benefit. |
