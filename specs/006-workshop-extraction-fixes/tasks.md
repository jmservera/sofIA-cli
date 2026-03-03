# Tasks: Workshop Phase Extraction & Tool Wiring Fixes

**Input**: Design documents from `/specs/006-workshop-extraction-fixes/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for new behavior (Red → Green → Review). Test tasks are included for each user story and MUST be written first.

**Organization**: Tasks are grouped by user story (from spec.md) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story (US1–US5) this task belongs to

---

## Phase 1: Setup

**Purpose**: Project structure for new modules; no behavior changes yet

- [ ] T001 Create empty module file src/loop/phaseSummarizer.ts with JSDoc header and type-only imports
- [ ] T002 [P] Create empty module file src/phases/contextSummarizer.ts with JSDoc header and type-only imports
- [ ] T003 [P] Create prompt directory src/prompts/summarize/ with placeholder README
- [ ] T004 [P] Update src/prompts/promptLoader.ts to support loading summarization prompts from `summarize/` subdirectory
- [ ] T005 Verify `npm run typecheck` and `npm run lint` pass with empty modules

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Multi-JSON-block extraction and phase boundary enforcement — used by multiple user stories

**⚠️ CRITICAL**: US1 (extraction) and US4 (context) depend on these foundational changes

### Tests (REQUIRED — write first, must FAIL) ⚠️

- [ ] T006 [P] Add failing tests for `extractAllJsonBlocks()` in tests/unit/phases/phaseExtractors.spec.ts — test with 0, 1, 2, and 3 JSON blocks in a single response
- [ ] T007 [P] Add failing tests for `extractJsonBlockForSchema()` in tests/unit/phases/phaseExtractors.spec.ts — test with multiple blocks where only the second matches the schema
- [ ] T008 [P] Add failing test for phase boundary injection in tests/unit/phases/phaseHandlers.spec.ts — verify system prompt contains "Do NOT introduce or begin the next phase"

### Implementation

- [ ] T009 Implement `extractAllJsonBlocks()` in src/phases/phaseExtractors.ts — use `/g` flag for fenced blocks, bracket-depth counter for raw JSON (FR-007)
- [ ] T010 Implement `extractJsonBlockForSchema<T>()` in src/phases/phaseExtractors.ts — try each block with `safeParse()`, return first valid match (FR-007)
- [ ] T011 [P] Inject phase-boundary instruction in ConversationLoop system prompt builder in src/loop/conversationLoop.ts (FR-007b, FR-007c)
- [ ] T012 Run `npm run test:unit` — T006, T007, T008 must now PASS; all existing 709 tests must still PASS

**Checkpoint**: Foundational extraction + boundary enforcement ready. User story work can begin.

---

## Phase 3: User Story 2 — Lazy Web Search Config (Priority: P1) 🎯 MVP-1

**Goal**: `isWebSearchConfigured()` returns correct value regardless of `.env` loading order (BUG-001)

**Independent Test**: Set Foundry vars in `.env` only, import `webSearch.ts`, then call `isWebSearchConfigured()` and expect `true`.

### Tests for US2 (REQUIRED — write first, must FAIL) ⚠️

- [ ] T013 [P] [US2] Add failing test in tests/unit/mcp/webSearch.spec.ts — set env vars AFTER module import, verify `isWebSearchConfigured()` returns true
- [ ] T014 [P] [US2] Add failing test in tests/unit/mcp/webSearch.spec.ts — verify returns false when vars absent
- [ ] T015 [P] [US2] Add failing test in tests/unit/cli/workshopCommand.spec.ts — verify `loadEnvFile()` is called before workshop logic starts

### Implementation for US2

- [ ] T016 [US2] Verify `isWebSearchConfigured()` in src/mcp/webSearch.ts reads `process.env` at call time with no caching (FR-008, FR-009)
- [ ] T017 [US2] Add `loadEnvFile()` call at top of `workshopCommand()` in src/cli/workshopCommand.ts (FR-010)
- [ ] T018 [P] [US2] Add `loadEnvFile()` call at top of `developCommand()` in src/cli/developCommand.ts (FR-010)
- [ ] T019 [US2] Run `npm run test:unit` — T013, T014, T015 must now PASS

**Checkpoint**: Web search configuration works reliably. Can be verified in isolation.

---

## Phase 4: User Story 1 — Phase Data Extraction (Priority: P1) 🎯 MVP-2

**Goal**: Structured artifacts (ideas, evaluation, selection, plan, poc) reliably extracted from every workshop phase via post-phase summarization call (BUG-002)

**Independent Test**: Feed recorded Zava assessment conversations into the summarization pipeline, verify all session fields populated.

### Tests for US1 (REQUIRED — write first, must FAIL) ⚠️

- [ ] T020 [P] [US1] Add failing test for `phaseSummarize()` in tests/unit/loop/phaseSummarizer.spec.ts — with fake client returning JSON block, verify session field populated
- [ ] T021 [P] [US1] Add failing test for `phaseSummarize()` in tests/unit/loop/phaseSummarizer.spec.ts — with fake client returning invalid response, verify session unchanged (no crash)
- [ ] T022 [P] [US1] Add failing test for `phaseSummarize()` in tests/unit/loop/phaseSummarizer.spec.ts — field already populated, verify summarization skipped (no-op)
- [ ] T023 [P] [US1] Add failing test for Ideate summarization prompt in tests/unit/loop/phaseSummarizer.spec.ts — verify IdeaCard[] extracted from LLM summary response
- [ ] T024 [P] [US1] Add failing test for Design summarization + Mermaid diagram extraction in tests/unit/loop/phaseSummarizer.spec.ts (FR-007a)
- [ ] T025 [P] [US1] Add failing integration test in tests/integration/summarizationFlow.spec.ts — full pipeline: ConversationLoop → phaseSummarize → session updated

### Implementation for US1

- [ ] T026 [US1] Create summarization prompt src/prompts/summarize/ideate-summary.md — IdeaCard[] schema shape + extraction instructions (FR-002)
- [ ] T027 [P] [US1] Create summarization prompt src/prompts/summarize/design-summary.md — IdeaEvaluation schema + Mermaid diagram request (FR-002, FR-007a)
- [ ] T028 [P] [US1] Create summarization prompt src/prompts/summarize/select-summary.md — SelectedIdea schema shape (FR-002)
- [ ] T029 [P] [US1] Create summarization prompt src/prompts/summarize/plan-summary.md — ImplementationPlan schema shape (FR-002)
- [ ] T030 [P] [US1] Create summarization prompt src/prompts/summarize/develop-summary.md — PocDevelopmentState schema shape (FR-002)
- [ ] T031 [US1] Implement `phaseSummarize()` in src/loop/phaseSummarizer.ts — create new session, send transcript, extract with handler (FR-001, FR-003, FR-004, FR-005, FR-006)
- [ ] T032 [US1] Implement `needsSummarization()` in src/loop/phaseSummarizer.ts — check if phase's session field is null
- [ ] T033 [US1] Implement `buildPhaseTranscript()` in src/loop/phaseSummarizer.ts — concatenate user+assistant turns for the phase
- [ ] T034 [US1] Hook `phaseSummarize()` into ConversationLoop.run() after while loop exits, before return, in src/loop/conversationLoop.ts (FR-006)
- [ ] T035 [US1] Run `npm run test:unit && npm run test:integration` — T020–T025 must PASS; all existing tests must still PASS

**Checkpoint**: All phases extract structured data via summarization fallback. Session fields populated.

---

## Phase 5: User Story 4 — Context Window Management (Priority: P2)

**Goal**: Later phases (Select, Plan, Develop) don't time out due to accumulated conversation history (BUG-003)

**Independent Test**: Build a session with 40+ turns, start Select phase, verify no timeout and summarized context in prompt.

### Tests for US4 (REQUIRED — write first, must FAIL) ⚠️

- [ ] T036 [P] [US4] Add failing test for `buildSummarizedContext()` in tests/unit/phases/contextSummarizer.spec.ts — with full session, verify all fields projected
- [ ] T037 [P] [US4] Add failing test for `buildSummarizedContext()` in tests/unit/phases/contextSummarizer.spec.ts — with null fields, verify graceful omission
- [ ] T038 [P] [US4] Add failing test for `renderSummarizedContext()` in tests/unit/phases/contextSummarizer.spec.ts — verify markdown output format
- [ ] T039 [P] [US4] Add failing test in tests/unit/phases/phaseHandlers.spec.ts — verify Ideate handler uses renderSummarizedContext (not ad-hoc context)
- [ ] T040 [P] [US4] Add failing test for ConversationLoop infiniteSessions forwarding in tests/unit/loop/conversationLoop.spec.ts
- [ ] T041 [P] [US4] Add failing test for timeout-retry fallback (FR-019a) in tests/unit/loop/conversationLoop.spec.ts — on timeout, retry with minimal context

### Implementation for US4

- [ ] T042 [US4] Implement `buildSummarizedContext()` in src/phases/contextSummarizer.ts — project all structured session fields including discoveryEnrichment (FR-016, FR-017)
- [ ] T043 [US4] Implement `renderSummarizedContext()` in src/phases/contextSummarizer.ts — render as compact markdown section (FR-017)
- [ ] T044 [US4] Replace ad-hoc context blocks in Ideate handler's `buildSystemPrompt()` with `renderSummarizedContext()` in src/phases/phaseHandlers.ts (FR-016)
- [ ] T045 [P] [US4] Replace ad-hoc context blocks in Design handler's `buildSystemPrompt()` with `renderSummarizedContext()` in src/phases/phaseHandlers.ts (FR-016)
- [ ] T046 [P] [US4] Replace ad-hoc context blocks in Select handler's `buildSystemPrompt()` with `renderSummarizedContext()` in src/phases/phaseHandlers.ts (FR-016)
- [ ] T047 [P] [US4] Replace ad-hoc context blocks in Plan handler's `buildSystemPrompt()` with `renderSummarizedContext()` in src/phases/phaseHandlers.ts (FR-016)
- [ ] T048 [P] [US4] Replace ad-hoc context blocks in Develop handler's `buildSystemPrompt()` with `renderSummarizedContext()` in src/phases/phaseHandlers.ts (FR-016)
- [ ] T049 [US4] Verify ConversationLoop.run() only injects current-phase turns (not prior phases) in system prompt history block in src/loop/conversationLoop.ts (FR-018 — already implemented, add regression test)
- [ ] T050 [US4] Add `infiniteSessions` option to `ConversationLoopOptions` and forward to `createSession()` in src/loop/conversationLoop.ts (FR-019)
- [ ] T050 [US4] Implement timeout-retry fallback in ConversationLoop — on `sendAndWait` timeout, retry with minimal context; on second failure, ask user for manual input (FR-019a)
- [ ] T051 [US4] Pass `infiniteSessions: { backgroundCompactionThreshold: 0.7, bufferExhaustionThreshold: 0.9 }` from workshopCommand.ts to ConversationLoop (FR-019)
- [ ] T052 [US4] Run `npm run test:unit` — T036–T041 must PASS; all existing tests must still PASS

**Checkpoint**: Select/Plan phases complete without timeout. Context is compact and accurate.

---

## Phase 6: User Story 3 — MCP Tool Wiring (Priority: P2)

**Goal**: Workshop phases use web search, WorkIQ, Context7, and Azure MCP for enrichment (BUG-005)

**Independent Test**: With MCP configured, run Discover and verify web search results stored; run Design and verify Context7 queried.

### Tests for US3 (REQUIRED — write first, must FAIL) ⚠️

- [ ] T053 [P] [US3] Add failing test in tests/unit/cli/workshopCommand.spec.ts — verify McpManager created from .vscode/mcp.json
- [ ] T054 [P] [US3] Add failing test in tests/unit/cli/workshopCommand.spec.ts — verify WebSearchClient created when configured and passed to Discover handler
- [ ] T055 [P] [US3] Add failing test in tests/unit/cli/workshopCommand.spec.ts — verify McpManager passed to Discover handler for WorkIQ consent flow (FR-012a)
- [ ] T056 [P] [US3] Add failing test in tests/unit/phases/phaseHandlers.spec.ts — verify Design handler queries Context7 via McpManager in postExtract (FR-013)
- [ ] T057 [P] [US3] Add failing test in tests/unit/phases/phaseHandlers.spec.ts — verify Plan handler queries Azure MCP via McpManager in postExtract (FR-014)
- [ ] T058 [P] [US3] Add failing test in tests/unit/phases/phaseHandlers.spec.ts — verify Design handler degrades gracefully when Context7 unavailable (FR-015)

### Implementation for US3

- [ ] T059 [US3] Extend `PhaseHandlerConfig` with `mcpManager?: McpManager` and `webSearchClient?: WebSearchClient` in src/phases/phaseHandlers.ts (FR-011)
- [ ] T060 [US3] Create `McpManager` in `workshopCommandInner()` from `.vscode/mcp.json` via `loadMcpConfig()` in src/cli/workshopCommand.ts (FR-011)
- [ ] T061 [US3] Create `WebSearchClient` in `workshopCommandInner()` when `isWebSearchConfigured()` returns true in src/cli/workshopCommand.ts (FR-012)
- [ ] T062 [US3] Pass `mcpManager` + `webSearchClient` to Discover handler via `PhaseHandlerConfig.discover` in src/cli/workshopCommand.ts (FR-012, FR-012a)
- [ ] T063 [US3] Pass `mcpManager` to all phase handler calls via `PhaseHandlerConfig` in src/cli/workshopCommand.ts
- [ ] T064 [US3] Add `postExtract` hook to Design handler — query Context7 for technologies in `session.ideas` in src/phases/phaseHandlers.ts (FR-013)
- [ ] T065 [US3] Add `postExtract` hook to Plan handler — query Azure MCP for services in `session.plan.architectureNotes` in src/phases/phaseHandlers.ts (FR-014)
- [ ] T066 [US3] Wrap all MCP calls in try/catch for graceful degradation in src/phases/phaseHandlers.ts (FR-015)
- [ ] T067 [US3] Run `npm run test:unit` — T053–T058 must PASS; all existing tests must still PASS

**Checkpoint**: MCP tools wired and operational. Enrichment flows working with graceful degradation.

---

## Phase 7: User Story 5 — Export Completeness (Priority: P2)

**Goal**: `sofia export` produces markdown files for all phases with conversation data, even without structured artifacts (BUG-004)

**Independent Test**: Export a session with null structured fields but 48 conversation turns — verify 6 markdown files generated.

### Tests for US5 (REQUIRED — write first, must FAIL) ⚠️

- [ ] T068 [P] [US5] Add failing test in tests/unit/sessions/exportWriter.spec.ts — Ideate export with null `session.ideas` but conversation turns produces ideate.md
- [ ] T069 [P] [US5] Add failing test in tests/unit/sessions/exportWriter.spec.ts — Design export with null `session.evaluation` but turns produces design.md
- [ ] T070 [P] [US5] Add failing test in tests/unit/sessions/exportWriter.spec.ts — export with both structured data + turns renders structured first then conversation
- [ ] T071 [P] [US5] Add failing test in tests/unit/sessions/exportWriter.spec.ts — summary.json lists all 6 phase files when all phases have turns
- [ ] T072 [P] [US5] Add failing test in tests/unit/sessions/exportWriter.spec.ts — summary.json highlights include one entry per phase with turns
- [ ] T073 [P] [US5] Add failing integration test in tests/integration/exportFallbackFlow.spec.ts — full export pipeline with null structured data

### Implementation for US5

- [ ] T074 [US5] Refactor `generateIdeateMarkdown()` in src/sessions/exportWriter.ts — remove early return null; add conversation turn fallback (FR-020, FR-021, FR-022)
- [ ] T075 [P] [US5] Refactor `generateDesignMarkdown()` in src/sessions/exportWriter.ts — same pattern (FR-020, FR-021, FR-022)
- [ ] T076 [P] [US5] Refactor `generateSelectMarkdown()` in src/sessions/exportWriter.ts — same pattern (FR-020, FR-021, FR-022)
- [ ] T077 [P] [US5] Refactor `generatePlanMarkdown()` in src/sessions/exportWriter.ts — same pattern (FR-020, FR-021, FR-022)
- [ ] T078 [P] [US5] Refactor `generateDevelopMarkdown()` in src/sessions/exportWriter.ts — same pattern (FR-020, FR-021, FR-022)
- [ ] T079 [US5] Update `exportSession()` in src/sessions/exportWriter.ts — summary.json lists all generated files (FR-023)
- [ ] T080 [US5] Update highlight generation in src/sessions/exportWriter.ts — include one highlight per phase with turns, fallback to first assistant turn opening (FR-024)
- [ ] T081 [US5] Run `npm run test:unit && npm run test:integration` — T068–T073 must PASS; all existing tests must still PASS

**Checkpoint**: Export produces complete artifacts for all 6 phases. summary.json includes all files and highlights.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, regression testing, cleanup

- [ ] T082 [P] Update build assets script in package.json to copy `src/prompts/summarize/*.md` to `dist/src/prompts/summarize/`
- [ ] T083 [P] Run `npm run typecheck` — zero errors
- [ ] T084 [P] Run `npm run lint` — zero errors (fix any import ordering issues)
- [ ] T085 Run full test suite: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] T086 Update Zava assessment test in tests/live/zavaFullWorkshop.spec.ts — relax assertion on `session.ideas` (now expected to pass), add assertions for extraction, export completeness
- [ ] T087 Run quickstart.md validation — verify all file paths and commands in quickstart.md are accurate

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US2 — Web Search)**: Depends on Phase 2 — independent of other stories
- **Phase 4 (US1 — Extraction)**: Depends on Phase 2 — independent of other stories
- **Phase 5 (US4 — Context)**: Depends on Phase 2 — independent of other stories
- **Phase 6 (US3 — MCP Wiring)**: Depends on Phase 3 (needs lazy web search) — can parallel with US1/US4
- **Phase 7 (US5 — Export)**: Depends on Phase 2 — independent of other stories (benefits from US1 but works without)
- **Phase 8 (Polish)**: Depends on all user stories being complete

### User Story Dependencies

| Story                 | Can Start After | Parallel With      | Notes                                                    |
| --------------------- | --------------- | ------------------ | -------------------------------------------------------- |
| US2 (P1 — Web Search) | Phase 2         | US1, US4, US5      | Quick win — 3 FRs, ~4 tasks                              |
| US1 (P1 — Extraction) | Phase 2         | US2, US4, US5      | Largest story — 7 FRs, ~16 tasks                         |
| US4 (P2 — Context)    | Phase 2         | US1, US2, US5      | Modifies phaseHandlers shared with US3                   |
| US3 (P2 — MCP)        | Phase 3 (US2)   | US1, US4, US5      | Needs web search from US2; shares phaseHandlers with US4 |
| US5 (P2 — Export)     | Phase 2         | US1, US2, US3, US4 | Standalone module; benefits from US1 but works without   |

### Within Each User Story

1. Tests written first — MUST FAIL before implementation
2. Implementation tasks in dependency order
3. Green checkpoint: all tests pass
4. Full suite verification before moving to next story

### Parallel Opportunities

```text
After Phase 2 completes:

  ┌──── US2 (Web Search) ─────┐
  │                            │
  │  ┌──── US1 (Extraction) ──┼──── US3 (MCP Wiring) ────┐
  │  │                        │                            │
  │  │  ┌── US4 (Context) ───┘                            │
  │  │  │                                                  │
  │  │  │  ┌── US5 (Export) ──────────────────────────────┘
  │  │  │  │
  ▼  ▼  ▼  ▼
  Phase 8: Polish
```

---

## Implementation Strategy

### MVP First (US2 + US1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (multi-block extraction + phase boundaries)
3. Complete Phase 3: US2 — Lazy Web Search Config (quick win, ~30 min)
4. Complete Phase 4: US1 — Phase Data Extraction (summarization pipeline, ~2 hours)
5. **STOP and VALIDATE**: Run Zava assessment test — extraction should now populate all fields

### Incremental Delivery

1. Setup + Foundational → Base ready
2. US2 (Web Search) → Config bug fixed → Deploy
3. US1 (Extraction) → Structured data flows → Deploy (major milestone)
4. US4 (Context) → Timeout prevention → Deploy
5. US3 (MCP Wiring) → Enrichment active → Deploy
6. US5 (Export) → Complete exports → Deploy
7. Polish → Full regression pass → Release

### Suggested MVP Scope

**US2 + US1** cover the two P1 stories and directly address:

- BUG-001 (web search config)
- BUG-002 (extraction failures)
- Indirectly improves BUG-004 (export now has structured data to render)

This combination targets the biggest score improvement in the Zava assessment.

---

## Summary

| Metric                     | Value                                                 |
| -------------------------- | ----------------------------------------------------- |
| **Total tasks**            | 87                                                    |
| **US1 (Extraction)**       | 16 tasks                                              |
| **US2 (Web Search)**       | 7 tasks                                               |
| **US3 (MCP Wiring)**       | 15 tasks                                              |
| **US4 (Context)**          | 17 tasks                                              |
| **US5 (Export)**           | 14 tasks                                              |
| **Setup + Foundational**   | 12 tasks                                              |
| **Polish**                 | 6 tasks                                               |
| **Parallel opportunities** | US2/US1/US4/US5 can all start after Phase 2 completes |
| **MVP scope**              | US2 + US1 (23 tasks, addresses P1 stories)            |
