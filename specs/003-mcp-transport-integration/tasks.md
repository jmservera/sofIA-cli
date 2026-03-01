# Tasks: MCP Transport Integration

**Input**: Design documents from `/specs/003-mcp-transport-integration/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅
**Branch**: `003-mcp-transport-integration`

**Tests**: Tests are REQUIRED for new behavior (Red → Green → Review). Write tests FIRST, ensure they fail, then implement.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Include exact file paths in every task description

## Already Fulfilled by Existing Code (No Tasks Created)

The following items are already implemented and do not require new tasks:

| Component                  | File                                                                         | Status                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Project setup              | `package.json`, `tsconfig.json`, `eslint.config.js`                          | ✅ Complete                                                                                                                     |
| MCP config loader          | `src/mcp/mcpManager.ts` (`loadMcpConfig`, `McpManager` struct)               | ✅ Complete                                                                                                                     |
| Web search bridge          | `src/mcp/webSearch.ts`                                                       | ✅ Complete (no changes needed)                                                                                                 |
| GitHub adapter structure   | `src/develop/githubMcpAdapter.ts` (calls `callTool()` correctly)             | ✅ Complete (minor contract updates needed)                                                                                     |
| Context enricher structure | `src/develop/mcpContextEnricher.ts` (calls `callTool()` correctly)           | ✅ Complete (minor contract updates needed)                                                                                     |
| Ralph Loop core            | `src/develop/ralphLoop.ts` (per-iteration push reads file content correctly) | ✅ Complete (post-scaffold push is missing)                                                                                     |
| Adapter unit tests (basic) | `tests/unit/develop/githubMcpAdapter.spec.ts`, `mcpContextEnricher.spec.ts`  | ✅ Complete (new contract cases needed)                                                                                         |
| Ralph Loop unit tests      | `tests/unit/develop/ralphLoop.spec.ts`                                       | ✅ Complete (post-scaffold push test missing)                                                                                   |
| McpManager basic tests     | `tests/unit/mcp/mcpManager.spec.ts`                                          | ✅ Complete (`callTool()` real dispatch tests missing)                                                                          |
| FR-020 SDK Alignment       | `specs/003-mcp-transport-integration/research.md` (Topics 7–9)               | ✅ Agent architecture verified aligned; SDK hooks, `infiniteSessions`, `customAgents`, `skillDirectories` evaluated (T049–T055) |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the Feature 002 baseline before making any changes.

- [x] T001 Run `npm test` to confirm all Feature 002 tests pass before starting any work

**Checkpoint**: Baseline verified — all Feature 002 tests green before any Feature 003 code is written.

---

## Phase 2: Foundational (Transport Abstractions — Blocking Prerequisites)

**Purpose**: Define the transport interface and retry policy types that all User Story 1 implementation depends on. These must be created before any US1 code can be written.

**⚠️ CRITICAL**: No US1 implementation can begin until this phase is complete.

- [x] T002 Create `src/mcp/mcpTransport.ts` with the complete type foundation per `contracts/mcp-transport.md`: `McpTransport` interface, `ToolCallResponse` type, `McpTransportError` class, and empty class stubs for `StdioMcpTransport`, `HttpMcpTransport`, and `createTransport()` factory
- [x] T003 [P] Create `src/mcp/retryPolicy.ts` with `withRetry<T>()` function signature, `RetryOptions` interface, and `classifyMcpError` re-export (parallel with T002 — different file, no dependency)

**Checkpoint**: Transport abstractions defined — US1 implementation can begin.

---

## Phase 3: User Story 1 — MCP Tool Calls Work in Production (Priority: P1) 🎯 MVP

**Goal**: Implement the real MCP transport layer so `McpManager.callTool()` dispatches real requests to configured MCP servers, replacing the current stub that throws `"not yet wired to transport"`.

**Independent Test**: Configure a test environment with a mock MCP server implementing the JSON-RPC 2.0 protocol, run `sofia dev` on a session with a plan, and verify that real tool calls are dispatched and real responses are used.

### Tests for User Story 1 (REQUIRED — write FIRST, verify they FAIL before implementing)

- [x] T004 [P] [US1] Create `tests/unit/mcp/mcpTransport.spec.ts` with failing tests for `HttpMcpTransport`: JSON-RPC `tools/call` framing, `Authorization: Bearer` header from `GITHUB_TOKEN`, `AbortController` timeout, HTTP 401/403 → `auth-failure` error class, HTTP 5xx → `unknown` error class, non-JSON body → `McpTransportError`
- [x] T005 [P] [US1] Add failing tests for `StdioMcpTransport` to `tests/unit/mcp/mcpTransport.spec.ts`: subprocess spawn with correct command/args, `initialize` handshake sends correct JSON-RPC request, pending request resolved on matching response id, subprocess exit rejects all pending requests with `connection-refused`, 5-second startup timeout on failed handshake
- [x] T006 [P] [US1] Create `tests/unit/mcp/retryPolicy.spec.ts` with failing tests for `withRetry()`: retries once on `connection-refused`, retries once on `timeout`, does NOT retry on `auth-failure`, does NOT retry on `unknown` error, applies ±20% jitter to initial delay, logs `warn` on retry attempt
- [x] T007 [P] [US1] Add failing tests for `McpManager.callTool()` real dispatch to `tests/unit/mcp/mcpManager.spec.ts`: returns unwrapped content from `ToolCallResponse`, throws when server not in config, dispatches to correct transport based on server config type, passes `timeoutMs` option to transport, calls `withRetry` for transient errors
- [x] T008 [P] [US1] Add new failing tests to `tests/unit/develop/githubMcpAdapter.spec.ts` per `contracts/github-adapter.md`: `createRepository` passes `{ timeoutMs: 60_000 }` as 4th arg to `callTool`, `createRepository` falls back to `response.url` then `response.clone_url` when `html_url` missing, `pushFiles` passes `{ timeoutMs: 60_000 }` as 4th arg, `pushFiles` extracts `owner` and `repo` from `repoUrl` and passes them separately (not `repoUrl`), `pushFiles` extracts `commitSha` from `response.commit.sha` as fallback
- [x] T009 [P] [US1] Add new failing tests to `tests/unit/develop/mcpContextEnricher.spec.ts` per `contracts/context-enricher.md`: `queryContext7` uses `response.id` as fallback when `response.libraryId` missing, `queryContext7` uses `response.text` as fallback content when `response.content` missing, `queryContext7` processes max 5 non-skipped dependencies, `queryAzureMcp` uses `response.text` as fallback when `response.content` missing, `queryWebSearch` tries MCP `callTool('websearch', 'search', ...)` before Azure AI Foundry bridge, `enrich` runs `queryContext7` and `queryAzureMcp` concurrently via `Promise.allSettled()`
- [x] T010 [P] [US1] Add new failing tests to `tests/unit/develop/mcpContextEnricher.spec.ts` for web search gating per `contracts/context-enricher.md`: `enrich` MUST NOT invoke `queryWebSearch()` when `stuckIterations < 2`, and MUST invoke it when `stuckIterations >= 2` (when configured and failingTests non-empty)
- [x] T011 [US1] Create `tests/integration/mcpTransportFlow.spec.ts`: spawn a minimal JSON-RPC echo server as a child process, verify `StdioMcpTransport` can connect and round-trip a `tools/call` request, verify retry fires once on first-call failure then succeeds, verify `McpManager.callTool()` dispatches through `StdioMcpTransport` for a stdio-type config
- [x] T042 [US1] Create `tests/integration/mcpDegradationFlow.spec.ts`: configure `McpManager` with servers marked unavailable (or stub transports that throw), run `GitHubMcpAdapter` + `McpContextEnricher` calls, and assert graceful degradation (no throws; adapters return `{ available: false, reason }` or fallback context) per US1 Acceptance Scenario 4 and FR-013

### Implementation for User Story 1

- [x] T012 [US1] Implement `HttpMcpTransport` in `src/mcp/mcpTransport.ts`: `callTool()` uses native `fetch()` with `POST`, JSON-RPC `tools/call` method, `AbortController` for `timeoutMs`, `Authorization: Bearer ${process.env.GITHUB_TOKEN}` when set, parse `result.content[0].text` or `result` directly; `isConnected()` always returns `true`; `disconnect()` is a no-op (depends on T002)
- [x] T013 [US1] Implement `StdioMcpTransport` in `src/mcp/mcpTransport.ts`: `connect()` spawns subprocess via `child_process.spawn` with `stdio: ['pipe','pipe','pipe']` and `env: process.env`, sends `initialize` JSON-RPC request, waits for `initialized` notification within 5 seconds; `callTool()` writes newline-delimited JSON-RPC request to stdin, resolves on matching response id from stdout, rejects on timeout; `disconnect()` kills subprocess (depends on T012 — same file, implement sequentially)
- [x] T014 [US1] Implement `createTransport()` factory in `src/mcp/mcpTransport.ts`: returns `HttpMcpTransport` for `type: 'http'` configs and `StdioMcpTransport` for `type: 'stdio'` configs (depends on T012, T013)
- [x] T015 [US1] Implement `withRetry<T>()` in `src/mcp/retryPolicy.ts`: wraps any async function, retries once after `initialDelayMs * (0.8–1.2 jitter)` on `connection-refused`, `timeout`, or `dns-failure` error classes; does not retry on `auth-failure` or `unknown`; logs `warn` with server name, tool name, attempt number, and delay (depends on T003)
- [x] T016 [US1] Implement `McpManager.callTool()` real dispatch in `src/mcp/mcpManager.ts`: add `options?: { timeoutMs?: number; retryOnTransient?: boolean }` parameter; lazily create and cache `McpTransport` per server via `createTransport()`; call `connect()` for stdio transports on first use; wrap transport call with `withRetry()` when `retryOnTransient !== false`; unwrap `ToolCallResponse.content` (parse JSON string if string, return as-is if object); throw `Error` for unknown server names (depends on T014, T015)
- [x] T017 [US1] Implement `McpManager.disconnectAll()` in `src/mcp/mcpManager.ts`: iterate all cached transports and call `transport.disconnect()`, then clear the transport registry (depends on T016)
- [x] T018 [US1] Update `GitHubMcpAdapter.createRepository()` in `src/develop/githubMcpAdapter.ts`: add `{ timeoutMs: 60_000 }` as 4th arg to `callTool`; extend `repoUrl` extraction to try `response.html_url`, `response.url`, `response.clone_url` in order; extend `repoName` extraction to try `response.name`, `response.full_name` before falling back to `options.name`
- [x] T019 [US1] Update `GitHubMcpAdapter.pushFiles()` in `src/develop/githubMcpAdapter.ts`: add helper to extract `owner` and `repo` from `repoUrl` (parse `github.com/{owner}/{repo}` pattern); pass `owner`, `repo` separately (not `repoUrl`); add `{ timeoutMs: 60_000 }` as 4th arg; extend `commitSha` extraction to try `response.sha` then `response.commit?.sha`
- [x] T020 [US1] Update `McpContextEnricher.queryContext7()` in `src/develop/mcpContextEnricher.ts`: add `{ timeoutMs: 30_000 }` to both `callTool` calls; add `response.id` fallback when `response.libraryId` missing; add `response.text` fallback when `response.content` missing for doc text; enforce 5-dependency limit on non-skipped packages
- [x] T021 [US1] Update `McpContextEnricher.queryAzureMcp()` in `src/develop/mcpContextEnricher.ts`: add `{ timeoutMs: 30_000 }` to `callTool`; add `response.text` fallback when `response.content` missing
- [x] T022 [US1] Update `McpContextEnricher.queryWebSearch()` in `src/develop/mcpContextEnricher.ts`: add MCP-based search as primary path — `callTool('websearch', 'search', { query }, { timeoutMs: 30_000 })` when `mcpManager.isAvailable('websearch')`; retain Azure AI Foundry bridge as fallback; add `response.text` fallback for content
- [x] T023 [US1] Update `McpContextEnricher.enrich()` in `src/develop/mcpContextEnricher.ts`: run `queryContext7()` and `queryAzureMcp()` concurrently using `Promise.allSettled()`; web search (`queryWebSearch()`) runs sequentially after both complete; ensure web search is gated by `stuckIterations >= 2` per `contracts/context-enricher.md` (depends on T020–T022)

**Checkpoint**: US1 complete — `McpManager.callTool()` dispatches real tool calls; all four adapters (GitHub, Context7, Azure, WebSearch) use real transport; all unit and integration tests pass.

---

## Phase 4: User Story 2 — GitHub MCP Pushes Real File Content (Priority: P1)

**Goal**: Fix the Ralph Loop to push the initial scaffold files to GitHub immediately after `npm install` completes, so the remote repository always reflects the full PoC state from iteration 1 onward.

**Independent Test**: Run a Ralph Loop iteration in a test with a mock GitHub adapter; verify `pushFiles` is called after scaffold with non-empty file content read from disk for each `scaffoldResult.createdFiles` entry.

### Tests for User Story 2 (REQUIRED — write FIRST, verify they FAIL before implementing)

- [x] T024 [US2] Add failing test to `tests/unit/develop/ralphLoop.spec.ts`: after scaffold and npm install complete, `mockGithubAdapter.pushFiles` is called once with all `scaffoldResult.createdFiles` paths and each file's actual disk content (non-empty strings); verify this push happens before the first test-run iteration begins

### Implementation for User Story 2

- [x] T025 [US2] Add post-scaffold push to `src/develop/ralphLoop.ts`: immediately after npm install succeeds (before the iteration loop begins), if `githubAdapter?.isAvailable()` and `githubAdapter.getRepoUrl()` is set, read all `scaffoldResult.createdFiles` from disk using the existing `readFile(resolve(outputDir, f), 'utf-8')` pattern, filter out unreadable files with a `warn` log, then call `githubAdapter.pushFiles({ repoUrl, files, commitMessage: 'chore: initial scaffold', branch: 'main' })`; on pushFiles failure, log `warn` and continue (non-fatal)

**Checkpoint**: US2 complete — scaffold files are pushed to GitHub with real content immediately after `npm install`; per-iteration pushes remain correct.

---

## Phase 5: User Story 3 — Discovery Phase Uses Web Search (Priority: P2)

**Goal**: After the user provides company and team information in Step 1 of the discovery workshop, sofIA optionally searches the web for recent company news, competitor activity, and industry trends, storing results in the session for downstream phases.

**Independent Test**: Start a workshop session, provide company info, verify that sofIA offers to search the web, and confirm that results are stored in `session.discovery.enrichment` and persisted to the session JSON.

### Tests for User Story 3 (REQUIRED — write FIRST, verify they FAIL before implementing)

- [x] T026 [P] [US3] Create `tests/unit/phases/discoveryEnricher.spec.ts` with failing tests for `DiscoveryEnricher.enrichFromWebSearch()`: calls `webSearchClient.search()` with queries for company news, competitor activity, and industry trends; populates `companyNews`, `competitorInfo`, `industryTrends` from results; returns gracefully with empty arrays when `webSearchClient.search()` throws; sets `sourcesUsed: ['websearch']` and `enrichedAt` timestamp
- [x] T027 [P] [US3] Add failing tests to `tests/unit/phases/discoveryEnricher.spec.ts` that the discovery phase offers enrichment per FR-014: when web search is configured + interactive, `io.prompt()` is used to ask permission before running web search; declining skips web search and stores empty enrichment
- [x] T028 [P] [US3] Add failing tests to `tests/unit/phases/discoveryEnricher.spec.ts` for session schema integration: `DiscoveryEnrichmentSchema` parses valid enrichment; validates that `enrichedAt` is ISO 8601 when present; validates `sourcesUsed` entries are lowercase; session with `discovery.enrichment` round-trips through `workshopSessionSchema.parse()`
- [x] T029 [US3] Create `tests/integration/discoveryEnrichmentFlow.spec.ts`: simulate Step 1 completion in `phaseHandlers.ts` discover handler, verify the user is offered web search enrichment (FR-014), verify `DiscoveryEnricher.enrichFromWebSearch()` is called only when consented, verify session is updated with `discovery.enrichment` containing web search data, and verify enrichment is included in the Ideate phase system prompt context

### Implementation for User Story 3

- [x] T030 [US3] Add `DiscoveryEnrichmentSchema` and `DiscoveryEnrichment` type to `src/shared/schemas/session.ts` — exact schema per `specs/003-mcp-transport-integration/data-model.md` Entity 4; all fields optional; enforce max 10 items per array field via `.max(10)` on each array
- [x] T031 [US3] Add `DiscoveryStateSchema` to `src/shared/schemas/session.ts` with `enrichment: DiscoveryEnrichmentSchema.optional()` field, and add `discovery: DiscoveryStateSchema.optional()` to `workshopSessionSchema` (depends on T030)
- [x] T032 [US3] Create `src/phases/discoveryEnricher.ts` with `DiscoveryEnricher` class and `enrichFromWebSearch()` method: accepts `companySummary` and a `webSearchClient`; builds 3 search queries (company news, competitor activity, industry trends); calls `webSearchClient.search()` for each; populates `companyNews`, `competitorInfo`, `industryTrends` from results; sets `sourcesUsed` and `enrichedAt`; degrades gracefully on errors (depends on T030)
- [x] T033 [US3] Update `src/phases/phaseHandlers.ts` discover handler `extractResult()`: after extracting `businessContext`, if web search is configured and IO is interactive, offer web search enrichment per FR-014 (prompt default No); when consented, call `DiscoveryEnricher.enrichFromWebSearch()` and store the result in `session.discovery.enrichment`; when declined or unavailable, store empty enrichment and continue (depends on T031, T032)

**Checkpoint**: US3 complete — discovery phase offers and executes web search enrichment; results stored in `session.discovery.enrichment`; graceful degradation when web search unavailable.

---

## Phase 6: User Story 4 — WorkIQ Integration for Internal Context (Priority: P3)

**Goal**: After Step 1, sofIA optionally queries WorkIQ (with explicit user consent) to retrieve team collaboration patterns, expertise areas, and documentation gaps, storing them alongside web search results in the session.

**Independent Test**: With a mock WorkIQ MCP server available, verify that sofIA asks for permission before querying, stores insights in `session.discovery.enrichment.workiqInsights` when consented, and skips WorkIQ entirely when the user declines or server is unavailable.

### Tests for User Story 4 (REQUIRED — write FIRST, verify they FAIL before implementing)

- [x] T034 [P] [US4] Add failing tests for `DiscoveryEnricher.enrichFromWorkIQ()` to `tests/unit/phases/discoveryEnricher.spec.ts`: prompts user for consent via `io` before any `callTool` call; when user consents, calls `mcpManager.callTool('workiq', 'analyze_team', ...)` and extracts `teamExpertise`, `collaborationPatterns`, `documentationGaps`; adds `'workiq'` to `sourcesUsed`; returns empty `workiqInsights` when user declines (no callTool call); returns empty `workiqInsights` gracefully when `callTool` throws
- [x] T035 [P] [US4] Add failing tests for `DiscoveryEnricher.enrich()` orchestrator to `tests/unit/phases/discoveryEnricher.spec.ts`: calls `enrichFromWorkIQ()` if WorkIQ is available; merges WorkIQ results into a `DiscoveryEnrichment` object; returns valid `DiscoveryEnrichment` with all empty fields when WorkIQ fails

### Implementation for User Story 4

- [x] T036 [US4] Implement `DiscoveryEnricher.enrichFromWorkIQ()` in `src/phases/discoveryEnricher.ts`: display consent prompt via `io.prompt()` or `@inquirer/prompts` confirm; if declined, return empty `Partial<DiscoveryEnrichment>`; if consented and `mcpManager.isAvailable('workiq')`, call `mcpManager.callTool('workiq', 'analyze_team', { summary: companySummary, focus: ['expertise', 'collaboration', 'documentation'] }, { timeoutMs: 30_000 })`; extract `teamExpertise`, `collaborationPatterns`, `documentationGaps` from response (fallback: `response.insights` split by newline); handle auth case with a clear message; add `'workiq'` to `sourcesUsed` on success (depends on T032)
- [x] T037 [US4] Extend discovery enrichment to store WorkIQ insights in `session.discovery.enrichment.workiqInsights` when consented, and to proceed normally (no errors) when declined/unavailable per FR-016–FR-018 (wire-up lives in `phaseHandlers.ts` alongside the web-search offer)

**Checkpoint**: US4 complete — WorkIQ integration functional with permission gate; all discovery enrichment sources merged; graceful degradation confirmed.

---

## Phase 7: User Story 5 — Copilot SDK Agent Architecture Alignment (Priority: P2)

**Status: PARTIALLY FULFILLED** — `research.md` Topic 7 documents that the current `src/` agent definitions are already aligned with Copilot SDK v0.1.28 conventions. **However**, the SDK compliance review identified three gaps: (1) native `mcpServers` support requires wiring `.vscode/mcp.json` config through `createSession()` (Topics 1, 7); (2) SDK hooks (`onPreToolUse`/`onPostToolUse`) must be wired for CLI tool-call visibility per Constitution Principle VIII (Topic 8); (3) `infiniteSessions` should be configured for Ralph Loop sessions to prevent context window exhaustion (Topic 9).

### Tests for SDK mcpServers wiring (REQUIRED — write FIRST)

- [x] T049 [P] [US5] Add failing tests to `tests/unit/mcp/mcpManager.spec.ts` for `toSdkMcpServers()`: verify it converts `StdioServerConfig` to `{ type: 'stdio', command, args, env?, cwd?, tools?, timeout? }` format; verify it converts `HttpServerConfig` to `{ type: 'http', url, headers?, tools?, timeout? }` format; verify it returns empty object for empty `McpConfig.servers`
- [x] T050 [P] [US5] Add failing tests to `tests/unit/shared/copilotClient.spec.ts` for `SessionOptions.mcpServers`: verify that when `mcpServers` is provided, it is forwarded to the SDK's `createSession()` call; verify that when `mcpServers` is omitted or empty, it is NOT passed to the SDK

### Implementation for SDK mcpServers wiring

- [x] T051 [US5] Wire `loadMcpConfig()` → `toSdkMcpServers()` → `createSession({ mcpServers })` in the application entry point: load `.vscode/mcp.json` via `loadMcpConfig()`, convert via `toSdkMcpServers()`, and pass the result through `SessionOptions.mcpServers` so the Copilot SDK manages MCP server lifecycle for LLM-initiated tool calls (depends on T049, T050)

### Tests for SDK hooks and transparency (REQUIRED — write FIRST)

- [x] T052 [P] [US5] Add failing tests to `tests/unit/shared/copilotClient.spec.ts` for SDK hooks integration: verify that `SessionOptions` accepts a `hooks` object with `onPreToolUse` and `onPostToolUse` callbacks; verify that when `hooks` is provided, it is forwarded to the SDK's `createSession()` call; verify that when `hooks` is omitted, no hooks are passed to the SDK

### Implementation for SDK hooks, infiniteSessions, and events

- [x] T053 [US5] Wire SDK `onPreToolUse`/`onPostToolUse` hooks in `src/shared/copilotClient.ts`: add `hooks?: { onPreToolUse?: (toolName: string, toolArgs: Record<string, unknown>) => void; onPostToolUse?: (toolName: string, result: unknown, durationMs: number) => void; onErrorOccurred?: (error: Error) => void }` to `SessionOptions`; forward hooks to SDK `createSession({ hooks })` so tool-call activity (tool name, start/end, duration) is emitted to the CLI spinner via the existing activity event system in `src/shared/events.ts`; wire `onErrorOccurred` to log SDK-path errors at `warn` level (FR-021, FR-022) (depends on T052)
- [x] T054 [P] [US5] Wire `infiniteSessions` config to Ralph Loop `createSession()` calls in `src/develop/ralphLoop.ts`: pass `infiniteSessions: { backgroundCompactionThreshold: 0.7, bufferExhaustionThreshold: 0.9 }` to prevent context window exhaustion during extended multi-iteration conversations (FR-023); add unit test in `tests/unit/develop/ralphLoop.spec.ts` verifying the config is forwarded
- [x] T055 [P] [US5] Subscribe to SDK `assistant.usage` event in the conversation loop (`src/loop/conversationLoop.ts`): log token usage (input/output tokens) at `debug` level via pino logger; optionally emit cumulative usage as an activity event for the CLI spinner (FR-024); add unit test in `tests/unit/loop/conversationLoop.spec.ts` verifying event subscription

- [x] T038 Confirm no regressions from US1 and US5 changes by running `npm run test:unit` and verifying all existing `tests/unit/` specs remain green after the McpManager, copilotClient, hooks, and adapter updates

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Live smoke tests, linting, and typecheck pass — feature is production-ready.

- [x] T039 [P] Create `tests/e2e/mcpLive.spec.ts` with live MCP smoke tests gated behind `SOFIA_LIVE_MCP_TESTS=true`: GitHub MCP creates and deletes a test repository; Context7 resolves `express` library ID; Azure MCP returns documentation for a simple query; web search returns results for a test query — each test uses `describe.skipIf(!LIVE)` pattern per quickstart.md Section 8
- [x] T040 Validation task: satisfy SC-003-004 by running one controlled Ralph Loop scenario twice (same plan + failing tests), once with enrichment disabled and once with enrichment enabled, and compare iteration counts to green; record the comparison in test output or quickstart notes
- [x] T041 Validation task: satisfy SC-003-005 by running discovery web-search enrichment for 5 test company descriptions and confirming at least 3/5 have keyword-relevant results; record outcomes in quickstart notes
- [x] T043 [P] Live validation task: satisfy SC-003-006 by running WorkIQ enrichment in a configured environment and asserting the tool call completes within 10 seconds and persists `session.discovery.enrichment.workiqInsights` (gate behind `SOFIA_LIVE_MCP_TESTS=true`)
- [x] T044 [P] Add a timeout validation test for SC-003-007: force a short `timeoutMs` on an MCP call (HTTP and stdio) and assert a classified `timeout` error is returned/thrown and handled gracefully by adapters
- [x] T045 Run `npm run lint` and fix any `import/order` warnings introduced in Feature 003 files (blank line between external and internal import groups)
- [x] T046 Run `npm run typecheck` (`tsc --noEmit`) and fix all type errors — ensure `DiscoveryEnrichment` Zod schema types are correctly inferred and used throughout `discoveryEnricher.ts` and `phaseHandlers.ts`
- [x] T047 Run full `npm test` suite and confirm all unit, integration tests pass; e2e tests skipped in CI (not gated by `SOFIA_LIVE_MCP_TESTS=true`)
- [x] T048 Run `npm run test` with `SOFIA_LIVE_MCP_TESTS=true` in a configured environment to validate live MCP smoke tests (requires `GITHUB_TOKEN`, `AZURE_SUBSCRIPTION_ID`, and MCP servers accessible)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1 — T001)**: No dependencies — run immediately
- **Foundational (Phase 2 — T002–T003)**: Depends on T001 — **BLOCKS all US1 implementation**
- **US1 Tests (T004–T010)**: Depend on T002–T003 (types must exist to import); can be written before implementation (RED phase)
- **US1 Integration (T011, T042)**: Depends on T002–T003; can be written early but typically completes after US1 implementation exists
- **US1 Implementation (T012–T023)**: Depend on T002–T003; each implementation task may depend on prior transport tasks
- **US2 (T024–T025)**: Depends only on T001 — independent of US1 transport layer (different module)
- **US3 (T026–T033)**: Depends on T001 — independent of US1 and US2
- **US4 (T034–T037)**: Depends on T032 (DiscoveryEnricher class must exist from US3)
- **US5 (T049–T055, T038)**: T049–T052 tests can start after T001; T051 depends on T049, T050; T053 depends on T052; T054 and T055 are independent (can start after T001); T038 depends on US1 and US5 implementation being complete (verifies no regressions)
- **Polish (T039–T048)**: Depends on all US phases being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 (Foundational) — no other story dependency
- **US2 (P1)**: Independent — can start immediately after T001 in parallel with US1
- **US3 (P2)**: Independent — can start after T001 in parallel with US1 and US2
- **US4 (P3)**: Depends on US3 (T032 — DiscoveryEnricher class must exist)
- **US5 (P2)**: T049–T050 tests can start after T001 (types exist in mcpManager.ts); T051 wiring depends on T049, T050; T052 test can start after T001; T053 depends on T052; T054 and T055 are independent, parallelizable after T001; T038 verification after US1 and US5 implementation

### Within Each User Story

1. Tests MUST be written and confirmed FAILING before implementation
2. In US1: transport core + retry (T012–T015) before McpManager (T016–T017) before adapter/enricher updates (T018–T023)
3. In US3: schema (T030–T031) before enricher class (T032) before phase handler wiring (T033)
4. In US4: enricher class must exist (T032) before WorkIQ method (T036) before wiring/storage (T037)
5. In US5: mcpServers tests (T049–T050) before wiring (T051); hooks test (T052) before hooks impl (T053); T054 and T055 are independent

### Parallel Opportunities

**Phase 2**:

- T002 and T003 can run in parallel (different files)

**US1 Tests**:

- T004, T005, T006, T007, T008, T009, T010 can all run in parallel (different test files or additive to existing files with no conflicts)

**US2 and US1**:

- US2 (T024–T025) can be worked on in parallel with US1 (different modules: `ralphLoop.ts` vs `mcpTransport.ts`)

**US3 and US1/US2**:

- US3 (T026–T033) can be worked on in parallel with US1 and US2 (different modules: `session.ts`, `discoveryEnricher.ts`, `phaseHandlers.ts`)

**US5 Internal**:

- T049, T050, T052 (test tasks) can all run in parallel (different test files)
- T054 and T055 are independent of each other and of T051/T053 (different modules: `ralphLoop.ts`, `conversationLoop.ts`)

---

## Parallel Example: US1 Tests (all can run concurrently)

```bash
# Launch all US1 test files simultaneously:
Task: "Write HttpMcpTransport tests in tests/unit/mcp/mcpTransport.spec.ts" (T004)
Task: "Write StdioMcpTransport tests in tests/unit/mcp/mcpTransport.spec.ts" (T005)
Task: "Write withRetry tests in tests/unit/mcp/retryPolicy.spec.ts" (T006)
Task: "Add McpManager.callTool() tests to tests/unit/mcp/mcpManager.spec.ts" (T007)
Task: "Add contract test cases to tests/unit/develop/githubMcpAdapter.spec.ts" (T008)
Task: "Add contract test cases to tests/unit/develop/mcpContextEnricher.spec.ts" (T009)
```

## Parallel Example: US1, US2, US3 (can be worked by different developers)

```bash
# Developer A: US1 transport layer
Task: "Implement HttpMcpTransport in src/mcp/mcpTransport.ts" (T012)

# Developer B: US2 post-scaffold push (independent module)
Task: "Add post-scaffold push test to tests/unit/develop/ralphLoop.spec.ts" (T024)

# Developer C: US3 discovery enrichment schema (independent module)
Task: "Add DiscoveryEnrichmentSchema to src/shared/schemas/session.ts" (T030)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Verify baseline
2. Complete Phase 2: Transport abstractions (T002–T003)
3. Complete US1: Transport layer + real MCP dispatch (T004–T023) and integration/degradation (T011, T042)
4. Complete US2: Post-scaffold push fix (T024–T025)
5. **STOP and VALIDATE**: Run `SOFIA_LIVE_MCP_TESTS=true npm test` in configured environment
6. Deploy/demo with working GitHub adapter, Context7 enricher, Azure enricher, and web search

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready
2. US1 → Working transport layer → Test with real MCP servers (MVP!)
3. US2 → Scaffold push fixed → Demo complete PoC round-trip
4. US3 → Discovery enrichment → Richer ideation phase
5. US4 → WorkIQ integration → Internal context available
6. US5 → SDK hooks for tool visibility, `infiniteSessions` for context management, usage tracking → CLI transparency complete
7. Polish → Live smoke tests + CI green

### Parallel Team Strategy

With three developers after Phase 2 completes:

- **Developer A**: US1 (transport layer — T004–T023)
- **Developer B**: US2 (post-scaffold push — T024–T025)
- **Developer C**: US3 (discovery enrichment — T026–T033)

US4 begins when US3's T032 is merged. US5 (verification) runs after US1 merges.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks — safe to parallelize
- Follow the "Dependencies & Execution Order" section to sequence work; task IDs are unique but may not strictly encode dependency order after updates
- Adapter unit tests (githubMcpAdapter.spec.ts, mcpContextEnricher.spec.ts) already cover basic `callTool()` integration via mocks — Tasks T008/T009 ADD new contract-specific test cases, not replace existing ones
- Live smoke tests (T039, T048) require real credentials; they are gated by `SOFIA_LIVE_MCP_TESTS=true` and are NOT run in CI
- US5 (SDK alignment) now includes SDK `mcpServers` wiring (T049–T051), hooks integration for CLI transparency (T052–T053), `infiniteSessions` for Ralph Loop context management (T054), and SDK event subscriptions (T055) — per SDK compliance review (research.md Topics 7–9)
- The `DiscoveryState` entity described in data-model.md does not exist yet in `session.ts` — T031 creates it; existing sessions remain valid because the field is `optional()`
