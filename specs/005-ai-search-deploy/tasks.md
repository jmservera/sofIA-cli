# Tasks: AI Foundry Search Service Deployment

**Input**: Design documents from `/specs/005-ai-search-deploy/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/web-search-tool.md, quickstart.md

**Tests**: Tests are REQUIRED for new behavior in this repository (Red → Green → Review). Include test tasks for each user story and write them first.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Infrastructure**: `infra/` at repository root
- **Source code**: `src/` at repository root
- **Tests**: `tests/unit/`, `tests/integration/` at repository root
- **Documentation**: `docs/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies, create directory structure, establish foundational config

- [x] T001 Install `@azure/ai-projects@beta` and `@azure/identity` as production dependencies in package.json
- [x] T002 [P] Create `infra/` directory structure with placeholder files: `infra/main.bicep`, `infra/main.bicepparam`, `infra/deploy.sh`, `infra/teardown.sh`
- [x] T003 [P] Add TypeScript ambient module declarations for `@azure/ai-projects` and `@azure/identity` if needed in src/types/

**Checkpoint**: Dependencies installed, directory structure ready, `npm run typecheck` passes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core changes that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Update `isWebSearchConfigured()` in src/mcp/webSearch.ts to check new env vars (`FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_MODEL_DEPLOYMENT_NAME`) instead of legacy vars
- [x] T005 [P] Add legacy env var detection to preflight checks in src/cli/preflight.ts — fail with migration error message if `SOFIA_FOUNDRY_AGENT_ENDPOINT` or `SOFIA_FOUNDRY_AGENT_KEY` are set (FR-016)
- [x] T006 [P] Update docs/environment.md — replace legacy env var documentation with new `FOUNDRY_PROJECT_ENDPOINT` and `FOUNDRY_MODEL_DEPLOYMENT_NAME` vars, document `DefaultAzureCredential` auth model

**Checkpoint**: Foundation ready — legacy env vars rejected, new env var pattern established, `npm run typecheck` and `npm run lint` pass

---

## Phase 3: User Story 1 — One-Command Search Service Deployment (Priority: P1) 🎯 MVP

**Goal**: A developer runs `./infra/deploy.sh` with subscription + resource group and gets a fully deployed Foundry project with web-search-enabled agent infrastructure. Script outputs configuration values.

**Independent Test**: Run the deployment script against an Azure subscription and verify all 5 resources are provisioned, script outputs correct env var values.

**FR Coverage**: FR-001, FR-002, FR-003, FR-005, FR-006, FR-008, FR-009, FR-010, FR-012

### Tests for User Story 1 (REQUIRED) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [P] [US1] Unit test for deploy script prerequisite validation (az CLI check, login check) in tests/unit/infraDeploy.spec.ts — test parameter parsing, missing required args, default values
- [x] T008 [P] [US1] Unit test verifying Bicep template structure (validate JSON compilation output has all 5 expected resource types) in tests/unit/infraBicep.spec.ts

### Implementation for User Story 1

- [x] T009 [US1] Create Bicep template `infra/main.bicep` with all 5 resources: `Microsoft.CognitiveServices/accounts` (kind: AIServices, allowProjectManagement: true, customSubDomainName), `accounts/deployments` (gpt-4.1-mini, GlobalStandard), `accounts/projects`, `accounts/capabilityHosts` (Agents), `accounts/projects/capabilityHosts` (Agents). Use `targetScope = 'subscription'` with resource group creation per research.md R1
- [x] T010 [US1] Create Bicep parameter file `infra/main.bicepparam` with defaults: location=swedencentral, modelDeploymentName=gpt-4.1-mini, modelName=gpt-4.1-mini, modelVersion=2025-04-14, modelSkuName=GlobalStandard per data-model.md FoundryDeploymentConfig
- [x] T011 [US1] Implement deployment script `infra/deploy.sh` — parse CLI flags (--subscription, --resource-group, --location, --account-name, --model), validate prerequisites (az CLI installed, user logged in, subscription accessible), run `az deployment sub create`, query Bicep outputs (projectEndpoint, modelDeploymentName), print env var export instructions per contracts/web-search-tool.md deploy.sh contract
- [x] T012 [US1] Make `infra/deploy.sh` executable (chmod +x) and add shebang `#!/usr/bin/env bash`, set error handling (`set -euo pipefail`), add clear error messages with exit codes (0=success, 1=prereq fail, 2=deploy fail) per FR-006 and contracts

**Checkpoint**: User Story 1 complete — `./infra/deploy.sh -s <sub> -g <rg>` provisions all resources and prints working env var values. Tests in T007/T008 pass.

---

## Phase 4: User Story 2 — Infrastructure-as-Code Reproducibility (Priority: P2)

**Goal**: Every Bicep parameter has a description and sensible default. Users can customize region, model, and naming without modifying the template. Template is self-documenting.

**Independent Test**: Open `infra/main.bicep`, verify every `@description()` decorator is present. Deploy with `--location eastus --model gpt-4o-mini` and verify it succeeds with those overrides.

**FR Coverage**: FR-004, FR-011

### Tests for User Story 2 (REQUIRED) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T013 [P] [US2] Unit test verifying all Bicep parameters have `@description()` decorators in tests/unit/infraBicep.spec.ts — parse main.bicep and confirm every `param` has a preceding `@description` annotation
- [ ] T014 [P] [US2] Unit test verifying Bicep parameters have defaults where specified in data-model.md FoundryDeploymentConfig — location defaults to swedencentral, model to gpt-4.1-mini

### Implementation for User Story 2

- [ ] T015 [US2] Add `@description()` decorators to all Bicep parameters in infra/main.bicep — location, accountName, projectName, modelDeploymentName, modelName, modelVersion, modelSkuName, modelSkuCapacity, resourceGroupName per FR-011
- [ ] T016 [US2] Add inline comments to each Bicep resource in infra/main.bicep explaining its purpose (Foundry account, model deployment, project, account capability host, project capability host) per FR-011 and SC-005
- [ ] T017 [US2] Ensure deploy.sh passes parameter overrides through to Bicep deployment — `--location`, `--account-name`, and `--model` flags map to Bicep parameter overrides via `az deployment sub create --parameters` per FR-004

**Checkpoint**: User Story 2 complete — template is self-documenting (SC-005), customizable region/model/naming (FR-004) works via CLI flag overrides. Tests in T013/T014 pass.

---

## Phase 5: User Story 3 — Seamless Integration with sofIA CLI (Priority: P3)

**Goal**: The sofIA CLI's `web.search` tool uses `@azure/ai-projects` SDK with `DefaultAzureCredential` auth (no API key). Ephemeral agent created lazily on first search call, deleted on session end. Search responses include URL citations. Graceful degradation on failure.

**Independent Test**: Set `FOUNDRY_PROJECT_ENDPOINT` and `FOUNDRY_MODEL_DEPLOYMENT_NAME`, start a sofIA workshop, describe a company — web search returns grounded results with citations. Unset env vars — workshop proceeds without web search, no crash.

**FR Coverage**: FR-013, FR-014, FR-015, FR-016

### Tests for User Story 3 (REQUIRED) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T018 [P] [US3] Unit test for updated `WebSearchConfig` validation (projectEndpoint format, modelDeploymentName non-empty) in tests/unit/webSearch.spec.ts per data-model.md validation rules
- [ ] T019 [P] [US3] Unit test for legacy env var detection — `isWebSearchConfigured()` returns false when only old vars set, returns true when new vars set in tests/unit/webSearch.spec.ts
- [ ] T020 [P] [US3] Unit test for `createWebSearchTool()` graceful degradation — returns `{ results: [], degraded: true, error }` when credential fails, agent creation fails, or network error in tests/unit/webSearch.spec.ts per contracts/web-search-tool.md degradation scenarios
- [ ] T021 [P] [US3] Unit test for citation extraction — parses `url_citation` annotations from Foundry response into `WebSearchResultItem[]` with title, url, snippet and deduplicates sources in tests/unit/webSearch.spec.ts per contracts/web-search-tool.md output format
- [ ] T022 [P] [US3] Integration test for ephemeral agent lifecycle (create → query → cleanup) using faked `AIProjectClient` in tests/integration/webSearchAgent.spec.ts — verify agent created on first call, reused on second call, deleted on `destroyWebSearchSession()` per data-model.md AgentSession state transitions
- [ ] T023 [P] [US3] Unit test for preflight legacy env var check — verify preflight fails with clear migration message when `SOFIA_FOUNDRY_AGENT_ENDPOINT` or `SOFIA_FOUNDRY_AGENT_KEY` are set in tests/unit/preflight.spec.ts per data-model.md LegacyEnvVarError

### Implementation for User Story 3

- [ ] T024 [US3] Update `WebSearchConfig` interface in src/mcp/webSearch.ts — replace `endpoint`/`apiKey`/`fetchFn` with `projectEndpoint`/`modelDeploymentName` per data-model.md entity 3
- [ ] T025 [US3] Implement `AgentSession` class in src/mcp/webSearch.ts — lazy initialization with `AIProjectClient` + `DefaultAzureCredential`, `agents.createVersion()` for web_search_preview agent, conversation creation, state tracking (uninitialized → initialized → cleaned up) per data-model.md entity 4 and research.md R4/R8
- [ ] T026 [US3] Implement citation extraction in src/mcp/webSearch.ts — parse `response.output` for `url_citation` annotations, map to `WebSearchResultItem[]` (title, url, snippet), deduplicate into `sources[]` per contracts/web-search-tool.md output format and FR-014
- [ ] T027 [US3] Rewrite `createWebSearchTool()` in src/mcp/webSearch.ts — replace raw HTTP POST with `AgentSession.initialize()` on first call, `openAIClient.responses.create()` for queries, return structured `WebSearchResult` with citations. Handle all degradation scenarios per contracts/web-search-tool.md degradation table
- [ ] T028 [US3] Implement `destroyWebSearchSession()` in src/mcp/webSearch.ts — delete conversation and agent version, register `process.on('beforeExit', ...)` handler, log warnings on cleanup failure (no throw) per research.md R8 lifecycle contract
- [ ] T029 [US3] Update `isWebSearchConfigured()` in src/mcp/webSearch.ts — check `FOUNDRY_PROJECT_ENDPOINT` and `FOUNDRY_MODEL_DEPLOYMENT_NAME` (not legacy vars)
- [ ] T030 [US3] Wire `destroyWebSearchSession()` cleanup into workshop session teardown in src/cli/workshopCommand.ts — call on workshop exit/completion to ensure ephemeral agent is deleted per FR-015
- [ ] T031 [US3] Update src/develop/mcpContextEnricher.ts — ensure `isWebSearchConfigured()` import path is correct and behavior aligns with new env var check

**Checkpoint**: User Story 3 complete — sofIA CLI uses Foundry Agent Service SDK for web search, ephemeral agent lifecycle works, citations displayed, graceful degradation on failure. All tests in T018-T023 pass. `npm run typecheck` and `npm run lint` pass.

---

## Phase 6: User Story 4 — Teardown and Cost Management (Priority: P4)

**Goal**: User runs `./infra/teardown.sh --resource-group <name>` to delete all deployed resources. Clean exit when resource group doesn't exist.

**Independent Test**: Deploy infrastructure, run teardown, verify resource group deleted. Run teardown on non-existent group — clean informational message, exit 0.

**FR Coverage**: FR-007

### Tests for User Story 4 (REQUIRED) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T032 [P] [US4] Unit test for teardown script parameter validation — required --resource-group flag, exit code 0 when group not found, exit code 1 on prereq failure in tests/unit/infraTeardown.spec.ts per contracts/web-search-tool.md teardown.sh contract

### Implementation for User Story 4

- [ ] T033 [US4] Implement teardown script `infra/teardown.sh` — parse --resource-group flag, check az CLI prerequisites, verify resource group exists (informational exit 0 if not), prompt for confirmation (unless --yes), execute `az group delete --yes --no-wait`, print confirmation per contracts/web-search-tool.md teardown.sh contract
- [ ] T034 [US4] Make `infra/teardown.sh` executable (chmod +x) and add shebang, set `set -euo pipefail`, handle exit codes (0=success/not-found, 1=prereq fail, 2=deletion fail)

**Checkpoint**: User Story 4 complete — teardown script deletes resource group cleanly, handles non-existent groups gracefully. Test in T032 passes.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, cleanup across all stories

- [ ] T035 [P] Update README.md — add "Web Search Setup" section with link to quickstart.md and brief deployment instructions
- [ ] T036 [P] Verify quickstart.md end-to-end flow matches final implementation — deploy → configure → verify → teardown in specs/005-ai-search-deploy/quickstart.md
- [ ] T037 Run `npm run typecheck` and fix any remaining TypeScript errors across all modified files
- [ ] T038 Run `npm run lint` and fix any ESLint `import/order` warnings across all modified files
- [ ] T039 Run full test suite (`npm test`) and ensure no regressions in existing tests

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — creates Bicep + deploy script
- **US2 (Phase 4)**: Depends on US1 (enhances the same Bicep template + deploy script created in US1)
- **US3 (Phase 5)**: Depends on Foundational — independent of US1/US2 (uses fakes for testing; only needs real deployment for live validation)
- **US4 (Phase 6)**: Depends on Foundational — independent of US1-US3
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 (enhances the Bicep template and deploy script created in US1)
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) — Independent of US1/US2 (uses faked SDK clients for tests)
- **User Story 4 (P4)**: Can start after Foundational (Phase 2) — Independent of US1-US3

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models/interfaces before services
- Services before integration
- Core implementation before edge-case handling
- Story complete before moving to next priority

### Parallel Opportunities

- T002 and T003 can run in parallel (Phase 1 setup)
- T004, T005, T006 can run in parallel (Phase 2 foundational — different files)
- T007 and T008 can run in parallel (US1 tests — different test files)
- **US1 and US3 can run in parallel** after Foundational (different file sets: infra/ vs src/mcp/)
- **US1 and US4 can run in parallel** after Foundational (deploy.sh vs teardown.sh)
- **US3 and US4 can run in parallel** after Foundational (src/ vs infra/)
- All US3 tests (T018-T023) can run in parallel (different test files or independent test cases)
- T035 and T036 can run in parallel (different docs)

---

## Parallel Example: User Story 3

```bash
# Launch all tests for US3 together (6 parallel test tasks):
T018: Unit test for WebSearchConfig validation in tests/unit/webSearch.spec.ts
T019: Unit test for legacy env var detection in tests/unit/webSearch.spec.ts
T020: Unit test for graceful degradation in tests/unit/webSearch.spec.ts
T021: Unit test for citation extraction in tests/unit/webSearch.spec.ts
T022: Integration test for agent lifecycle in tests/integration/webSearchAgent.spec.ts
T023: Unit test for preflight legacy check in tests/unit/preflight.spec.ts

# After tests fail (Red), implement in order:
T024: Update WebSearchConfig interface
T025: Implement AgentSession class
T026: Implement citation extraction
T027: Rewrite createWebSearchTool()
T028: Implement destroyWebSearchSession()
T029: Update isWebSearchConfigured()
T030: Wire cleanup into workshop session
T031: Update mcpContextEnricher import
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T006)
3. Complete Phase 3: User Story 1 (T007-T012)
4. **STOP and VALIDATE**: Deploy to Azure, verify all 5 resources created, env var output correct
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready (new deps, env var migration)
2. Add US1 → Test deploy script → Deploy to Azure (MVP — infrastructure works!)
3. Add US2 → Verify template quality (parameterization, documentation)
4. Add US3 → Test CLI integration → Workshop uses web search with citations
5. Add US4 → Test teardown → Full lifecycle (deploy → use → teardown)
6. Polish → Docs, lint, typecheck, full suite

### Parallel Team Strategy

With multiple developers after Foundational phase:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (deploy) then US2 (template quality)
   - Developer B: US3 (CLI integration — largest story, 14 tasks)
   - Developer C: US4 (teardown — smallest, 3 tasks)
3. All merge and Polish together

---

## Notes

- Total tasks: **39**
- US1: 6 tasks (2 test + 4 impl)
- US2: 5 tasks (2 test + 3 impl)
- US3: 14 tasks (6 test + 8 impl) — largest story, core SDK migration
- US4: 3 tasks (1 test + 2 impl) — smallest story
- Setup: 3 tasks
- Foundational: 3 tasks
- Polish: 5 tasks
- Parallel opportunities: US1 ‖ US3 ‖ US4 after Foundational; numerous within-story [P] tasks
- MVP: US1 alone delivers deployable infrastructure (12 tasks through Phase 3)
- Each story is independently testable per spec acceptance scenarios
