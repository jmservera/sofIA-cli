# Tasks: Fix Review Findings for Feature 002 (PoC Generation & Ralph Loop)

**Input**: Review of current implementation against `specs/002-poc-generation/spec.md`, `contracts/ralph-loop.md`, `contracts/poc-output.md`
**Prerequisites**: All original tasks (T001–T050) in `tasks.md` are marked complete. These fix tasks address deviations, stubs, and bugs found during cross-referencing.

**Tests**: Tests are REQUIRED (Red → Green → Review). Write a failing test first for each behavioral fix.

**Organization**: Tasks are grouped by functional area. Each fix is independently implementable and testable.

## Format: `[ID] [P?] [Fix] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Fix]**: Which review finding this task addresses (F1–F10)
- Include exact file paths in descriptions

---

## Phase 1: Critical — Ralph Loop Effectiveness (Finding 3)

**Purpose**: The LLM currently receives only a file tree listing, not actual file contents. Without code visibility, the Ralph loop cannot effectively fix failing tests. This is the single most impactful fix.

### Tests

- [x] F001 [P] [F3] Add unit test in `tests/unit/develop/codeGenerator.spec.ts` verifying `buildIterationPrompt` includes file contents (not just names) when `fileContents` option is provided
- [x] F002 [P] [F3] Add unit test in `tests/unit/develop/ralphLoop.spec.ts` verifying the Ralph loop reads file contents from disk and passes them to `buildIterationPrompt`

### Implementation

- [x] F003 [F3] Extend `IterationPromptOptions` in `src/develop/codeGenerator.ts` with `fileContents?: Array<{ path: string; content: string }>` and render a `## Current Code` section with fenced code blocks for each file
- [x] F004 [F3] Update `RalphLoop` in `src/develop/ralphLoop.ts` to read file contents from the PoC directory before building the iteration prompt, passing them as `fileContents` to `buildIterationPrompt`
- [x] F005 [F3] Add a size guard: if total file content exceeds 50KB, include only files referenced in test failures plus `src/index.ts` and `package.json`; log a warning when content is truncated

**Checkpoint**: Ralph loop now sends actual source code to the LLM. Verify by running an existing integration test and inspecting the `llmPromptContext` summary.

---

## Phase 2: Critical — Final Test Run After Last Iteration (Finding 4)

**Purpose**: When max iterations are reached, the loop applies the last code fix but never runs tests again, potentially misreporting `failed` when tests actually pass.

### Tests

- [x] F006 [P] [F4] Add unit test in `tests/unit/develop/ralphLoop.spec.ts` verifying that after the last LLM iteration at `maxIterations`, a final test run occurs and `finalStatus` reflects the actual result
- [x] F007 [P] [F4] Add integration test in `tests/integration/ralphLoopFlow.spec.ts` verifying that when the last iteration's code fix resolves all failures, `finalStatus` is `'success'` (not `'partial'` or `'failed'`)

### Implementation

- [x] F008 [F4] Add a final test run after the last LLM code application in `src/develop/ralphLoop.ts`: after the loop exits at `maxIterations`, run tests one more time, update the last iteration's outcome and `testResults`, and use those results for `finalStatus` determination

**Checkpoint**: `finalStatus` now accurately reflects the state of tests after the final code changes. Verify with `npx vitest run tests/unit/develop/ralphLoop.spec.ts`.

---

## Phase 3: SIGINT Handler Stale Session (Finding 5)

**Purpose**: The Ctrl+C handler captures the initial session object, so pressing Ctrl+C mid-loop persists stale data with no iteration history.

### Tests

- [x] F009 [P] [F5] Add unit test in `tests/unit/develop/ralphLoop.spec.ts` verifying that after at least one iteration completes, triggering SIGINT persists a session containing the completed iteration(s)

### Implementation

- [x] F010 [F5] Refactor `setupSigintHandler` in `src/develop/ralphLoop.ts` to close over a mutable reference (e.g., `{ current: session }` wrapper object or a class field `this.currentSession`) so the handler always persists the latest session state

**Checkpoint**: Verify by simulating SIGINT after one iteration in the unit test and asserting the persisted session has `poc.iterations.length >= 1`.

---

## Phase 4: User-Stopped Status (Finding 6)

**Purpose**: `user-stopped` hardcodes `finalStatus: 'failed'`. Spec says session should be preserved as-is — status should reflect actual test state.

### Tests

- [x] F011 [P] [F6] Add unit test in `tests/unit/develop/ralphLoop.spec.ts` verifying `finalStatus` is `'partial'` when user stops mid-loop and some tests were passing

### Implementation

- [x] F012 [F6] Update the user-stopped branch in `src/develop/ralphLoop.ts` to compute `finalStatus` based on the latest test results: `'partial'` if any tests were passing, `'failed'` if none were

**Checkpoint**: Verify with `npx vitest run tests/unit/develop/ralphLoop.spec.ts`.

---

## Phase 5: GitHub MCP Adapter — Real Tool Calls (Findings 1 & 2)

**Purpose**: `createRepository` and `pushFiles` are no-op stubs returning fake data. D-002 requires real MCP tool calls when GitHub MCP is available.

### Tests

- [x] F013 [P] [F1] Add unit test in `tests/unit/develop/githubMcpAdapter.spec.ts` verifying `createRepository` calls `mcpManager.callTool('github', 'create_repository', ...)` and returns the URL from the tool response
- [x] F014 [P] [F1] Add unit test in `tests/unit/develop/githubMcpAdapter.spec.ts` verifying `pushFiles` calls `mcpManager.callTool('github', 'push_files', ...)` with file paths and contents, and returns the commit SHA from the response
- [x] F015 [P] [F2] Add unit test verifying that when the MCP tool call fails, `createRepository` returns `{ available: false }` with the error message (not a fake URL)

### Implementation

- [x] F016 [F1] Implement real MCP tool calls in `GitHubMcpAdapter.createRepository()` in `src/develop/githubMcpAdapter.ts`: call `mcpManager.callTool('github', 'create_repository', { name, description, private: true })`, parse the response for `html_url`, return it
- [x] F017 [F1] Implement real MCP tool calls in `GitHubMcpAdapter.pushFiles()` in `src/develop/githubMcpAdapter.ts`: call `mcpManager.callTool('github', 'push_files', { repoUrl, files, message })`, return the commit SHA from the response
- [x] F018 [F2] Remove hardcoded `poc-owner` URL; derive repo owner from the MCP response or user configuration

**Checkpoint**: With a mocked McpManager, verify `createRepository` and `pushFiles` invoke the correct MCP tool names with expected arguments.

---

## Phase 6: MCP Context Enricher — Real Tool Calls (Finding 2/6)

**Purpose**: All three MCP query methods return simulated data instead of calling actual MCP tools.

### Tests

- [x] F019 [P] [F6] Update unit tests in `tests/unit/develop/mcpContextEnricher.spec.ts` to verify `queryContext7` calls `mcpManager.callTool('context7', ...)` with the dependency name
- [x] F020 [P] [F6] Update unit tests in `tests/unit/develop/mcpContextEnricher.spec.ts` to verify `queryAzureMcp` calls `mcpManager.callTool('azure', ...)` with the architecture keywords
- [x] F021 [P] [F6] Update unit tests in `tests/unit/develop/mcpContextEnricher.spec.ts` to verify `queryWebSearch` calls the web search tool with failing test context

### Implementation

- [x] F022 [F6] Implement real MCP calls in `McpContextEnricher.queryContext7()` in `src/develop/mcpContextEnricher.ts`: call `mcpManager.callTool('context7', 'resolve-library-id', { libraryName })` then `query-docs` with the resolved ID; return the documentation text
- [x] F023 [F6] Implement real MCP calls in `McpContextEnricher.queryAzureMcp()` in `src/develop/mcpContextEnricher.ts`: call `mcpManager.callTool('azure', 'documentation', { query })` with architecture keywords; return relevant guidance
- [x] F024 [F6] Implement real calls in `McpContextEnricher.queryWebSearch()` in `src/develop/mcpContextEnricher.ts`: use the Copilot SDK web search capability or `mcpManager.callTool` to search for the stuck error messages; return search result summaries

**Checkpoint**: With mocked McpManager, verify each method produces structured context from tool responses. Graceful degradation tests should still pass.

---

## Phase 7: --force Option & Output Validation (Findings 7 & 8)

**Purpose**: `--force` is declared but not implemented. `validatePocOutput` exists but is never called.

### Tests

- [x] F025 [P] [F7] Add unit test in `tests/unit/cli/developCommand.spec.ts` verifying that when `outputDir` already exists and `--force` is not set, the command resumes from the last iteration (skip scaffold)
- [x] F026 [P] [F7] Add unit test in `tests/unit/cli/developCommand.spec.ts` verifying that when `outputDir` already exists and `--force` is set, the directory is cleared and scaffold runs fresh
- [x] F027 [P] [F8] Add unit test in `tests/unit/develop/ralphLoop.spec.ts` verifying `validatePocOutput` is called before the loop returns `finalStatus: 'success'`, and a missing required file downgrades status to `'partial'`

### Implementation

- [x] F028 [F7] Implement `--force` handling in `src/cli/developCommand.ts`: check if `outputDir` exists; if so and `--force` is set, remove and recreate it; if not set, detect existing `.sofia-metadata.json` and resume from last iteration count
- [x] F029 [F8] Call `validatePocOutput(outputDir)` in `src/develop/ralphLoop.ts` after loop completion and before returning; if validation fails and `finalStatus` was `'success'`, downgrade to `'partial'` with a warning

**Checkpoint**: `--force` clears output, validation catches missing files. Verify with `npx vitest run tests/unit/cli/developCommand.spec.ts tests/unit/develop/ralphLoop.spec.ts`.

---

## Phase 8: Polish (Findings 9 & 10)

**Purpose**: Minor improvements — PoC highlights in export summary, schema cleanup.

- [x] F030 [P] [F9] Add PoC status highlights in `src/sessions/exportWriter.ts`: include `finalStatus`, iteration count, and termination reason in `summary.json` highlights when session has `poc` data
- [x] F031 [P] [F10] Simplify `filesChanged` schema in `src/shared/schemas/session.ts`: replace `.optional().default([])` with `.default([])` (`.optional()` is redundant when `.default()` is present)
- [x] F032 Run full test suite (`npx vitest run`) and lint/typecheck (`npm run lint && npm run typecheck`) to confirm no regressions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** (Finding 3 — file contents in prompt): No dependencies — can start immediately. Highest impact.
- **Phase 2** (Finding 4 — final test run): No dependencies — can start immediately.
- **Phase 3** (Finding 5 — SIGINT stale session): No dependencies — can start immediately.
- **Phase 4** (Finding 6 — user-stopped status): Depends on Phase 3 (same SIGINT code area).
- **Phase 5** (Findings 1&2 — GitHub MCP): No dependencies — can start immediately. Requires understanding of McpManager tool call API.
- **Phase 6** (Finding 6 — MCP enricher): No dependencies — can start immediately. Requires understanding of McpManager tool call API.
- **Phase 7** (Findings 7&8 — --force & validation): No dependencies — can start immediately.
- **Phase 8** (Findings 9&10 — polish): Depends on all other phases (runs final validation).

### Parallel Opportunities

- Phases 1, 2, 3, 5, 6, 7 are fully independent and can be worked in parallel.
- Phase 4 should follow Phase 3 (same code area).
- Phase 8 should be last (final regression check).

Within each phase, all tasks marked `[P]` (tests) can run in parallel.

---

## Implementation Strategy

### MVP First

1. **Phase 1** (Finding 3): File contents in prompt — makes the Ralph loop actually work
2. **Phase 2** (Finding 4): Final test run — correct status reporting
3. **Phase 3 + 4** (Findings 5 & 6): SIGINT + user-stopped — data safety
4. **Phase 8**: Run full test suite

### Full Fix

After MVP, add Phases 5–7 (MCP wiring, --force, validation) and re-run Phase 8.

---

## Notes

- All findings reference the original spec: `specs/002-poc-generation/spec.md`
- Contract references: `specs/002-poc-generation/contracts/ralph-loop.md`, `specs/002-poc-generation/contracts/poc-output.md`
- Finding numbers (F1–F10) map to the review report above
- MCP wiring tasks (Phases 5 & 6) depend on `McpManager.callTool()` API shape — verify available methods before implementation
