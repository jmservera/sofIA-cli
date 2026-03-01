# Tasks: sofIA PoC Generation & Ralph Loop (Feature 002)

**Input**: Design documents from `/specs/002-poc-generation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for new behavior in this repository (Red → Green → Review). Write tests first for each user story and core infrastructure.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. This feature implements the Develop phase: scaffold → Ralph loop → PoC output. It consumes session state produced by Feature 001.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the `src/develop/` module directory, develop prompt, test fixture session, and any new dependencies.

- [x] T001 Create `src/develop/` directory structure with placeholder barrel file `src/develop/index.ts`
- [x] T002 [P] Create Develop phase system prompt in `src/prompts/develop.md` (code-generation instructions, fenced-code-block output format, iteration context template, conditional MCP tool-use instructions: use Context7 for up-to-date library docs when generating code with external dependencies, use web.search when stuck on implementation patterns, use Microsoft Docs/Azure MCP when plan references Azure services)
- [x] T003 [P] Create a fixture session JSON file in `tests/fixtures/completedSession.json` with populated `selection`, `plan`, and `businessContext` fields for use by all Develop tests
- [x] T004 [P] Add any new devDependencies needed for test runner child_process spawning (none expected — verify `child_process` and `fs/promises` available without extra packages)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend schemas and shared infrastructure required by ALL user stories in this feature.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Extend `pocIterationSchema` in `src/shared/schemas/session.ts` with new fields: `outcome` (enum: tests-passing | tests-failing | error | scaffold), `filesChanged` (string[]), `testResults` (optional TestResults), `errorMessage` (optional string), `llmPromptContext` (optional string); mark old `testsRun` field as deprecated (keep as `.optional()` for backward compatibility with existing session files)
- [x] T006 Extend `pocDevelopmentStateSchema` in `src/shared/schemas/session.ts` with new fields: `repoUrl` (optional string), `repoSource` (enum: local | github-mcp), `techStack` (optional TechStack), `terminationReason` (optional enum: tests-passing | max-iterations | user-stopped | error), `totalDurationMs` (optional number), `finalTestResults` (optional TestResults); extend `finalStatus` enum with `"partial"`
- [x] T007 [P] Add new Zod schemas for `TechStack`, `TestResults`, `TestFailure` in `src/shared/schemas/session.ts` per data-model.md entities
- [x] T008 [P] Add unit tests for the new/extended schemas (validation rules, enum constraints, total===passed+failed+skipped) in `tests/unit/schemas/pocSchemas.spec.ts`
- [x] T009 Update `generateDevelopMarkdown()` in `src/sessions/exportWriter.ts` to render: repo location (path or URL), repoSource, techStack summary, iteration timeline with outcomes, final test results, termination reason
- [x] T010 [P] Add unit tests for enriched `generateDevelopMarkdown()` in `tests/unit/sessions/exportWriter.spec.ts`

**Checkpoint**: Schemas extended, export writer enriched — user story implementation can now begin.

---

## Phase 3: User Story 1 — Generate a PoC repository from a completed plan (Priority: P1) 🎯 MVP

**Goal**: Allow a facilitator to run the Develop phase for a completed workshop session so that sofIA generates a local PoC repository with README, package.json, tsconfig.json, .gitignore, initial tests, and .sofia-metadata.json.

**Independent Test**: From a fixture session JSON produced by Feature 001, run the `sofia dev` command and verify that a PoC repo is created at `./poc/<sessionId>/` with all required files per the poc-output contract.

### Tests for User Story 1 (REQUIRED) ⚠️

- [x] T011 [P] [US1] Add unit tests for `PocScaffolder` in `tests/unit/develop/pocScaffolder.spec.ts`: verify scaffold creates all required files (.gitignore, README.md, package.json, tsconfig.json, src/index.ts, tests/*.test.ts, .sofia-metadata.json); verify skip-if-exists behavior; verify ScaffoldContext population from session
- [x] T012 [P] [US1] Add unit tests for `TestRunner` in `tests/unit/develop/testRunner.spec.ts`: verify spawns `npm test` with `--reporter=json`, parses JSON output into `TestResults` schema, handles timeout (60s), handles non-zero exit code, truncates `rawOutput` to 2000 chars
- [x] T013 [P] [US1] Add unit tests for `CodeGenerator` in `tests/unit/develop/codeGenerator.spec.ts`: verify parses fenced code blocks with `file=path` from LLM response, writes files to outputDir, handles empty response gracefully, builds iteration prompt with test failures context
- [x] T014 [P] [US1] Add unit tests for `developCommand` in `tests/unit/cli/developCommand.spec.ts`: verify session validation (rejects sessions without selection/plan), verify `--session`, `--max-iterations`, `--output` option parsing, verify error messages for invalid sessions
- [x] T015 [P] [US1] Add integration test for scaffold-only flow in `tests/integration/pocScaffold.spec.ts`: run scaffolder with fixture session → verify output directory structure matches poc-output contract → verify package.json has test script → verify .sofia-metadata.json links to session
- [x] T047 [P] [US1] Add unit tests for `McpContextEnricher` in `tests/unit/develop/mcpContextEnricher.spec.ts`: verify queries Context7 for library docs when dependencies listed in plan; verify queries Microsoft Docs/Azure MCP when plan mentions Azure services; verify calls web.search when `stuckIterations > 0`; verify falls back gracefully (returns empty context) when MCP services unavailable; verify returns structured context string suitable for prompt injection

### Implementation for User Story 1

- [x] T016 [US1] Implement `PocScaffolder` class in `src/develop/pocScaffolder.ts`: accepts `ScaffoldContext`, generates files from `node-ts-vitest` template, respects `skipIfExists`, creates directory structure, returns list of created files
- [x] T017 [US1] Implement `TestRunner` class in `src/develop/testRunner.ts`: spawns `npm test -- --reporter=json` via `child_process.spawn` in outputDir, parses Vitest JSON reporter output into `TestResults`, enforces 60s timeout, truncates rawOutput
- [x] T018 [US1] Implement `CodeGenerator` class in `src/develop/codeGenerator.ts`: builds iteration prompt per ralph-loop contract template, parses LLM response for fenced code blocks with `file=` paths, writes parsed files to outputDir, detects new dependencies in package.json
- [x] T048 [US1] Implement `McpContextEnricher` in `src/develop/mcpContextEnricher.ts`: accepts plan/techStack/iteration context; conditionally queries Context7 (library docs for PoC dependencies, gated by `McpManager.isAvailable('context7')`), Microsoft Docs/Azure MCP (when plan references Azure services, gated by `McpManager.isAvailable('azure')`), web.search (when stuck iterations detected, gated by `isWebSearchConfigured()`); returns enriched context strings for prompt injection; graceful degradation when services unavailable
- [x] T019 [US1] Implement `developCommand` handler in `src/cli/developCommand.ts`: parses `--session <id>`, `--max-iterations <n>`, `--output <dir>`, `--force` options; validates session has `selection` and `plan`; fails fast with guidance if missing; detects existing outputDir and warns (default: resume from last iteration; `--force`: overwrite and start fresh); wires to RalphLoop (Phase 4)
- [x] T020 [US1] Register `dev` command in `src/cli/index.ts` as a subcommand pointing to `developCommand` handler
- [x] T021 [US1] Prepare `createDevelopHandler()` in `src/phases/phaseHandlers.ts` as a stub that accepts RalphLoop integration (actual wiring completed in T029, Phase 4); keep `develop-boundary.md` prompt for backward compat

**Checkpoint**: User Story 1 scaffolding works — `sofia dev --session <id>` creates a valid PoC project structure locally.

---

## Phase 4: User Story 2 — Iterate via Ralph loop (Priority: P1)

**Goal**: Iteratively refine the PoC by running tests and applying LLM-suggested improvements until tests pass, max iterations reached, or user stops.

**Independent Test**: Starting from a scaffolded PoC, simulate test failures and verify that successive iterations apply targeted changes. At least one iteration should fix a failing test.

### Tests for User Story 2 (REQUIRED) ⚠️

- [x] T022 [P] [US2] Add unit tests for `RalphLoop` orchestrator in `tests/unit/develop/ralphLoop.spec.ts`: verify lifecycle (validate → scaffold → install → iterate); verify termination on tests-passing; verify termination on max-iterations; verify iteration count tracking; verify session persistence callback called after each iteration; verify Ctrl+C handling sets user-stopped
- [x] T023 [P] [US2] Add integration test for Ralph loop with fakes in `tests/integration/ralphLoopFlow.spec.ts`: use a fake CopilotClient and fake test runner; scaffold → fail tests → LLM generates fix → tests pass → loop terminates with `success`; verify at least one iteration where failing test guides a fix (SC-002-003)
- [x] T024 [P] [US2] Add integration test for partial/failed outcomes in `tests/integration/ralphLoopPartial.spec.ts`: test max-iterations with some tests passing (partial status); test max-iterations with no tests passing (failed status); test LLM error mid-loop (error outcome on iteration, loop continues)

### Implementation for User Story 2

- [x] T025 [US2] Implement `RalphLoop` orchestrator in `src/develop/ralphLoop.ts`: accepts `RalphLoopOptions` per contract; lifecycle: validate session → scaffold (iteration 1) → npm install → iterate (2..max: run tests → check pass → build prompt → LLM turn → apply code → persist); returns `RalphLoopResult` with finalStatus and terminationReason
- [x] T026 [US2] Implement auto-completing `LoopIO` adapter for Ralph loop LLM turns in `src/develop/ralphLoop.ts`: creates `ConversationLoop` per iteration with `readInput: async () => null` (single-turn, no user input); passes iteration prompt as `initialMessage`
- [x] T027 [US2] Implement npm install step in `RalphLoop`: run `npm install` after scaffold; detect package.json dependency changes between iterations and re-run `npm install` if needed; on install failure after scaffold, terminate with `terminationReason: "error"` and clear error message; on install failure during iteration, set iteration `outcome: "error"` with `errorMessage`, log the npm error, and continue to next iteration (LLM may fix the dependency issue)
- [x] T028 [US2] Implement Ctrl+C / SIGINT handling in `RalphLoop`: on signal, set `terminationReason: "user-stopped"`, persist current session state, exit loop gracefully
- [x] T029 [US2] Wire `RalphLoop` into `developCommand` in `src/cli/developCommand.ts`: create `RalphLoopOptions` from CLI args and session; create `ActivitySpinner` for visual feedback; call `ralphLoop.run()` and display results
- [x] T030 [US2] Implement iteration event logging via `onEvent` callback: emit `SofiaEvent` for each iteration start, test results, code generation, and loop termination (D-005 auditability)
- [x] T031 [US2] Add `llmPromptContext` summary generation (truncated context of what was sent to LLM) in `CodeGenerator` for auditability — not full prompt, just key context (iteration number, failure count, files listed)
- [x] T049 [US2] Integrate `McpContextEnricher` into `RalphLoop` iteration cycle in `src/develop/ralphLoop.ts`: call enricher before CodeGenerator on each iteration to fetch relevant library docs (Context7) and architecture guidance (Azure MCP); pass enriched context into the iteration prompt; invoke web.search enrichment when 2+ consecutive stuck iterations detected (same failures repeating)

**Checkpoint**: Full Ralph loop works end-to-end with fakes — scaffold, iterate, terminate. SC-002-003 validated.

---

## Phase 5: User Story 3 — Handle MCP and permissions constraints (Priority: P2)

**Goal**: When GitHub MCP is available, create a GitHub repository for the PoC. When unavailable, fall back gracefully to local output with clear logging.

**Independent Test**: Disable GitHub MCP, run Develop, verify local scaffold produced with `repoSource: "local"`. Enable GitHub MCP, run Develop, verify repo created with `repoSource: "github-mcp"`.

### Tests for User Story 3 (REQUIRED) ⚠️

- [x] T032 [P] [US3] Add unit tests for `GitHubMcpAdapter` in `tests/unit/develop/githubMcpAdapter.spec.ts`: verify `isAvailable()` checks `McpManager.isAvailable('github')`; verify `createRepository()` calls MCP tool; verify `pushFiles()` commits and pushes; verify graceful fallback returns `{ available: false }` when MCP unavailable
- [x] T033 [P] [US3] Add integration test for local fallback flow in `tests/integration/pocLocalFallback.spec.ts`: mock McpManager to report GitHub unavailable; run Ralph loop; verify `repoSource: "local"`, `repoPath` set, no `repoUrl`; verify log message explains fallback
- [x] T034 [P] [US3] Add integration test for GitHub MCP flow in `tests/integration/pocGithubMcp.spec.ts`: mock McpManager to report GitHub available; mock MCP tool calls; run Ralph loop; verify `repoSource: "github-mcp"`, `repoUrl` set; verify push after each iteration

### Implementation for User Story 3

- [x] T035 [US3] Implement `GitHubMcpAdapter` in `src/develop/githubMcpAdapter.ts`: `isAvailable()` checks McpManager; `createRepository(name, description)` creates repo via MCP tool call; `pushFiles(repoUrl, files, message)` commits and pushes; `getRepoUrl()` returns URL; all methods return typed results with error handling
- [x] T036 [US3] Integrate `GitHubMcpAdapter` into `RalphLoop` in `src/develop/ralphLoop.ts`: after scaffold, check adapter availability; if available, create repo and push scaffold; after each successful iteration, push updated files; on completion, final push; set `repoSource` and `repoUrl` in session
- [x] T037 [US3] Implement local fallback path in `RalphLoop`: when `GitHubMcpAdapter.isAvailable()` returns false, set `repoSource: "local"`, log clear fallback message via `io.writeActivity()`, continue with local-only output
- [x] T038 [US3] Update `developCommand` in `src/cli/developCommand.ts`: display repo URL or local path on completion; in `--json` mode, include `repoSource` and `repoUrl`/`repoPath` in output

**Checkpoint**: `sofia dev` works in both MCP-available and MCP-unavailable environments. SC-002-002 validated.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation, documentation updates, output validation, and hardening.

- [x] T039 [P] Implement PoC output validator in `src/develop/pocScaffolder.ts` (or separate `src/develop/outputValidator.ts`): check all required files exist per poc-output contract validation table; report missing files; return structured validation result
- [x] T040 [P] Add unit tests for output validator in `tests/unit/develop/outputValidator.spec.ts`: test all 8 validation checks from poc-output contract
- [x] T041 Add E2E happy-path test in `tests/e2e/developE2e.spec.ts`: run `sofia dev --session <fixtureId>` as subprocess; verify exit code 0; verify output directory has required files; verify session JSON updated with poc state
- [x] T050 Add E2E failure/recovery test in `tests/e2e/developFailureE2e.spec.ts`: run `sofia dev --session <fixtureId> --max-iterations 1` with a session whose plan produces deliberately failing tests; verify graceful termination; verify `finalStatus` is `"failed"` or `"partial"` in session JSON; verify `terminationReason: "max-iterations"`; verify user-facing output includes recovery guidance (Constitution VI compliance)
- [x] T042 [P] Update documentation in `docs/` to cover `sofia dev` command: usage, options, output structure, GitHub MCP integration, troubleshooting
- [x] T043 [P] Update `docs/export-format.md` to document enriched Develop section in exports
- [x] T044 Run `quickstart.md` validation: execute all commands from `specs/002-poc-generation/quickstart.md` and verify they work or update the quickstart
- [x] T045 Review logs for Develop phase: ensure no secrets/PII in iteration logs, verify `llmPromptContext` contains only summary data, verify `rawOutput` truncation works
- [x] T046 Run full test suite (`npx vitest run`) and lint/typecheck (`npm run lint && npm run typecheck`) to confirm no regressions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phases 3–5)**: All depend on Foundational phase completion.
  - US1 (P1) and US2 (P1) are both Priority 1 but US2 depends on US1 components (scaffolder, test runner, code generator).
  - US3 (P2) depends on US2 (RalphLoop must exist to integrate MCP adapter into it).
- **Polish (Phase 6)**: Depends on all user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2). No dependencies on other stories. Delivers scaffolding, test runner, code generator, MCP context enricher, and CLI command.
- **User Story 2 (P1)**: Depends on US1 (needs PocScaffolder, TestRunner, CodeGenerator, McpContextEnricher). Delivers the Ralph loop orchestrator that wires those components together.
- **User Story 3 (P2)**: Depends on US2 (needs RalphLoop to integrate GitHub MCP adapter). Delivers MCP integration and local fallback.

### Within Each User Story

- Tests MUST be written and FAIL before implementation.
- Components: schemas → individual modules → orchestration → CLI wiring.
- Each story complete before moving to next priority.

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel.
- All Foundational tasks marked [P] can run in parallel (T007, T008, T010 alongside T005/T006).
- Within US1: all test tasks (T011–T015, T047) can run in parallel; T016/T017/T018/T048 can run in parallel (different files).
- Within US2: all test tasks (T022–T024) can run in parallel.
- Within US3: all test tasks (T032–T034) can run in parallel.
- Polish tasks marked [P] can run in parallel.

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (all [P]):
T011: tests/unit/develop/pocScaffolder.spec.ts
T012: tests/unit/develop/testRunner.spec.ts
T013: tests/unit/develop/codeGenerator.spec.ts
T014: tests/unit/cli/developCommand.spec.ts
T015: tests/integration/pocScaffold.spec.ts
T047: tests/unit/develop/mcpContextEnricher.spec.ts

# Launch parallel implementation (different files):
T016: src/develop/pocScaffolder.ts        [P]
T017: src/develop/testRunner.ts           [P]
T018: src/develop/codeGenerator.ts        [P]
T048: src/develop/mcpContextEnricher.ts   [P]

# Then sequential (wiring):
T019: src/cli/developCommand.ts
T020: src/cli/index.ts
T021: src/phases/phaseHandlers.ts
```

## Parallel Example: User Story 2

```bash
# Launch all tests together (all [P]):
T022: tests/unit/develop/ralphLoop.spec.ts
T023: tests/integration/ralphLoopFlow.spec.ts
T024: tests/integration/ralphLoopPartial.spec.ts

# Sequential implementation (ralphLoop.ts is central):
T025: src/develop/ralphLoop.ts              (core orchestrator)
T026: src/develop/ralphLoop.ts              (auto-completing IO)
T027: src/develop/ralphLoop.ts              (npm install)
T028: src/develop/ralphLoop.ts              (Ctrl+C)
T029: src/cli/developCommand.ts             (wiring)
T030: src/develop/ralphLoop.ts              (events)
T031: src/develop/codeGenerator.ts          (auditability)
T049: src/develop/ralphLoop.ts              (MCP context enrichment)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories).
3. Complete Phase 3: User Story 1 (scaffolding, test runner, code generator, CLI command).
4. **STOP and VALIDATE**: `sofia dev --session <id>` creates a valid PoC directory with all required files.
5. Demo the scaffold output.

### Incremental Delivery

1. Deliver MVP (User Story 1) — scaffolding works, files created.
2. Add User Story 2 (Ralph loop) — iterative refinement works with fakes. SC-002-001 and SC-002-003 validated.
3. Add User Story 3 (GitHub MCP) — MCP integration and local fallback. SC-002-002 validated.
4. Apply Phase 6 polish — E2E tests, docs, output validation, full regression.

### Relation to Feature 001

- This feature consumes `WorkshopSession` with populated `selection`, `plan`, and `businessContext` from Feature 001.
- The `createDevelopHandler()` in `src/phases/phaseHandlers.ts` (currently boundary-only) is replaced with a real handler that invokes the Ralph loop.
- The `generateDevelopMarkdown()` in `src/sessions/exportWriter.ts` is enriched with iteration details.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- v1 targets TypeScript + Vitest PoCs only (template: `node-ts-vitest`); other templates deferred
