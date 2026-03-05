# Tasks: Workshop Phase Extraction & Tool Wiring Fixes

**Input**: Design documents from `/specs/006-workshop-extraction-fixes/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for new behavior (Red → Green → Review). Test tasks are included for each user story and MUST be written first.

**Organization**: Tasks are grouped by user story (from spec.md) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story (US1–US5) this task belongs to

> **Note**: Implementation phases are ordered for efficiency (US2 before US1 because it's a quick fix).
> This differs from spec story numbering where US1=Extraction, US2=WebSearch.

---

## Phase 1: Setup

**Purpose**: Project structure for new modules; no behavior changes yet

- [x] T001 Create empty module file src/loop/phaseSummarizer.ts with JSDoc header and type-only imports
- [x] T002 [P] Create empty module file src/phases/contextSummarizer.ts with JSDoc header and type-only imports
- [x] T003 [P] Create prompt directory src/prompts/summarize/ with placeholder README
- [x] T004 [P] Update src/prompts/promptLoader.ts to support loading summarization prompts from `summarize/` subdirectory
- [x] T005 Verify `npm run typecheck` and `npm run lint` pass with empty modules

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Multi-JSON-block extraction and phase boundary enforcement — used by multiple user stories

**⚠️ CRITICAL**: US1 (extraction) and US4 (context) depend on these foundational changes

### Tests (REQUIRED — write first, must FAIL) ⚠️

- [x] T006 [P] Add failing tests for `extractAllJsonBlocks()` in tests/unit/phases/phaseExtractors.spec.ts — test with 0, 1, 2, and 3 JSON blocks in a single response
- [x] T007 [P] Add failing tests for `extractJsonBlockForSchema()` in tests/unit/phases/phaseExtractors.spec.ts — test with multiple blocks where only the second matches the schema
- [x] T008 [P] Add failing test for phase boundary injection in tests/unit/phases/phaseHandlers.spec.ts — verify system prompt contains "Do NOT introduce or begin the next phase"

### Implementation

- [x] T009 Implement `extractAllJsonBlocks()` in src/phases/phaseExtractors.ts — use `/g` flag for fenced blocks, bracket-depth counter for raw JSON (FR-007)
- [x] T010 Implement `extractJsonBlockForSchema<T>()` in src/phases/phaseExtractors.ts — try each block with `safeParse()`, return first valid match (FR-007)
- [x] T011 [P] Inject phase-boundary instruction in ConversationLoop system prompt builder in src/loop/conversationLoop.ts (FR-007b, FR-007c)
- [x] T012 Run `npm run test:unit` — T006, T007, T008 must now PASS; all existing 709 tests must still PASS

**Checkpoint**: Foundational extraction + boundary enforcement ready. User story work can begin.

---

## Phase 3: User Story 2 — Lazy Web Search Config (Priority: P1) 🎯 MVP-1

**Goal**: `isWebSearchConfigured()` returns correct value regardless of `.env` loading order (BUG-001)

**Independent Test**: Set Foundry vars in `.env` only, import `webSearch.ts`, then call `isWebSearchConfigured()` and expect `true`.

### Tests for US2 (REQUIRED — write first, must FAIL) ⚠️

- [x] T013 [P] [US2] Add failing test in tests/unit/mcp/webSearch.spec.ts — set env vars AFTER module import, verify `isWebSearchConfigured()` returns true
- [x] T014 [P] [US2] Add failing test in tests/unit/mcp/webSearch.spec.ts — verify returns false when vars absent
- [x] T015 [P] [US2] Add failing test in tests/unit/cli/workshopCommand.spec.ts — verify `loadEnvFile()` is called before workshop logic starts

### Implementation for US2

- [x] T016 [US2] Verify `isWebSearchConfigured()` in src/mcp/webSearch.ts reads `process.env` at call time with no caching (FR-008, FR-009)
- [x] T017 [US2] Add `loadEnvFile()` call at top of `workshopCommand()` in src/cli/workshopCommand.ts (FR-010)
- [x] T018 [P] [US2] Add `loadEnvFile()` call at top of `developCommand()` in src/cli/developCommand.ts (FR-010)
- [x] T019 [US2] Run `npm run test:unit` — T013, T014, T015 must now PASS

**Checkpoint**: Web search configuration works reliably. Can be verified in isolation.

---

## Phase 4: User Story 1 — Phase Data Extraction (Priority: P1) 🎯 MVP-2

**Goal**: Structured artifacts (ideas, evaluation, selection, plan, poc) reliably extracted from every workshop phase via post-phase summarization call (BUG-002)

**Independent Test**: Feed recorded Zava assessment conversations into the summarization pipeline, verify all session fields populated.

### Tests for US1 (REQUIRED — write first, must FAIL) ⚠️

- [x] T020 [P] [US1] Add failing test for `phaseSummarize()` in tests/unit/loop/phaseSummarizer.spec.ts — with fake client returning JSON block, verify session field populated
- [x] T021 [P] [US1] Add failing test for `phaseSummarize()` in tests/unit/loop/phaseSummarizer.spec.ts — with fake client returning invalid response, verify session unchanged (no crash)
- [x] T022 [P] [US1] Add failing test for `phaseSummarize()` in tests/unit/loop/phaseSummarizer.spec.ts — field already populated, verify summarization skipped (no-op)
- [x] T023 [P] [US1] Add failing test for Ideate summarization prompt in tests/unit/loop/phaseSummarizer.spec.ts — verify IdeaCard[] extracted from LLM summary response
- [x] T024 [P] [US1] Add failing test for Design summarization + Mermaid diagram extraction in tests/unit/loop/phaseSummarizer.spec.ts (FR-007a)
- [x] T025 [P] [US1] Add failing integration test in tests/integration/summarizationFlow.spec.ts — full pipeline: ConversationLoop → phaseSummarize → session updated

### Implementation for US1

- [x] T026 [US1] Create summarization prompt src/prompts/summarize/ideate-summary.md — IdeaCard[] schema shape + extraction instructions (FR-002)
- [x] T027 [P] [US1] Create summarization prompt src/prompts/summarize/design-summary.md — IdeaEvaluation schema + Mermaid diagram request (FR-002, FR-007a)
- [x] T028 [P] [US1] Create summarization prompt src/prompts/summarize/select-summary.md — SelectedIdea schema shape (FR-002)
- [x] T029 [P] [US1] Create summarization prompt src/prompts/summarize/plan-summary.md — ImplementationPlan schema shape (FR-002)
- [x] T030 [P] [US1] Create summarization prompt src/prompts/summarize/develop-summary.md — PocDevelopmentState schema shape (FR-002)
- [x] T031 [US1] Implement `phaseSummarize()` in src/loop/phaseSummarizer.ts — create new session, send transcript, extract with handler (FR-001, FR-003, FR-004, FR-005, FR-006). The Discover phase MAY skip this call if `businessContext` is already populated.
- [x] T032 [US1] Implement `needsSummarization()` in src/loop/phaseSummarizer.ts — check if phase's session field is null
- [x] T033 [US1] Implement `buildPhaseTranscript()` in src/loop/phaseSummarizer.ts — concatenate user+assistant turns for the phase
- [x] T034 [US1] Implement Mermaid diagram extraction in Design summarization path in src/loop/phaseSummarizer.ts — extract `mermaid` block from summarization response and store in session `evaluation.architectureDiagram` (FR-007a)
- [x] T035 [US1] Hook `phaseSummarize()` into ConversationLoop.run() after while loop exits, before return, in src/loop/conversationLoop.ts (FR-006)
- [x] T036 [US1] Run `npm run test:unit && npm run test:integration` — T020–T025 must PASS; all existing tests must still PASS

**Checkpoint**: All phases extract structured data via summarization fallback. Session fields populated.

---

## Phase 5: User Story 4 — Context Window Management (Priority: P2)

**Goal**: Later phases (Select, Plan, Develop) don't time out due to accumulated conversation history (BUG-003)

**Independent Test**: Build a session with 40+ turns, start Select phase, verify no timeout and summarized context in prompt.

### Tests for US4 (REQUIRED — write first, must FAIL) ⚠️

- [x] T037 [P] [US4] Add failing test for `buildSummarizedContext()` in tests/unit/phases/contextSummarizer.spec.ts — with full session, verify all fields projected
- [x] T038 [P] [US4] Add failing test for `buildSummarizedContext()` in tests/unit/phases/contextSummarizer.spec.ts — with null fields, verify graceful omission
- [x] T039 [P] [US4] Add failing test for `renderSummarizedContext()` in tests/unit/phases/contextSummarizer.spec.ts — verify markdown output format
- [x] T040 [P] [US4] Add failing test in tests/unit/phases/phaseHandlers.spec.ts — verify Ideate handler uses renderSummarizedContext (not ad-hoc context)
- [x] T041 [P] [US4] Add failing test for ConversationLoop infiniteSessions forwarding in tests/unit/loop/conversationLoop.spec.ts
- [x] T042 [P] [US4] Add failing test for timeout-retry fallback (FR-019a) in tests/unit/loop/conversationLoop.spec.ts — on timeout, retry with minimal context
- [x] T043 [P] [US4] Add failing test for user-directed fallback (FR-019a) in tests/unit/loop/conversationLoop.spec.ts — on second timeout, ask user for manual input

### Implementation for US4

- [x] T044 [US4] Implement `buildSummarizedContext()` in src/phases/contextSummarizer.ts — project all structured session fields including discoveryEnrichment (FR-016, FR-017)
- [x] T045 [US4] Implement `renderSummarizedContext()` in src/phases/contextSummarizer.ts — render as compact markdown section (FR-017)
- [x] T046 [US4] Replace ad-hoc context blocks in Ideate handler's `buildSystemPrompt()` with `renderSummarizedContext()` in src/phases/phaseHandlers.ts (FR-016)
- [x] T047 [P] [US4] Replace ad-hoc context blocks in Design handler's `buildSystemPrompt()` with `renderSummarizedContext()` in src/phases/phaseHandlers.ts (FR-016)
- [x] T048 [P] [US4] Replace ad-hoc context blocks in Select handler's `buildSystemPrompt()` with `renderSummarizedContext()` in src/phases/phaseHandlers.ts (FR-016)
- [x] T049 [P] [US4] Replace ad-hoc context blocks in Plan handler's `buildSystemPrompt()` with `renderSummarizedContext()` in src/phases/phaseHandlers.ts (FR-016)
- [x] T050 [P] [US4] Replace ad-hoc context blocks in Develop handler's `buildSystemPrompt()` with `renderSummarizedContext()` in src/phases/phaseHandlers.ts (FR-016)
- [x] T051 [US4] Verify ConversationLoop.run() only injects current-phase turns (not prior phases) in system prompt history block in src/loop/conversationLoop.ts (FR-018 — already implemented, add regression test)
- [x] T052 [US4] Add `infiniteSessions` option to `ConversationLoopOptions` and forward to `createSession()` in src/loop/conversationLoop.ts (FR-019)
- [x] T053 [US4] Implement minimal-context retry on timeout in ConversationLoop — on `sendAndWait` timeout, retry with only structured session fields and no conversation turns (FR-019a)
- [x] T054 [US4] Implement user-directed fallback in ConversationLoop — on second timeout after retry, present the best available answer to user and ask for manual confirmation (FR-019a)
- [x] T055 [US4] Pass `infiniteSessions: { backgroundCompactionThreshold: 0.7, bufferExhaustionThreshold: 0.9 }` from workshopCommand.ts to ConversationLoop (FR-019)
- [x] T056 [US4] Run `npm run test:unit` — T037–T043 must PASS; all existing tests must still PASS

**Checkpoint**: Select/Plan phases complete without timeout. Context is compact and accurate.

---

## Phase 6: User Story 3 — MCP Tool Wiring (Priority: P2)

**Goal**: Workshop phases use web search, WorkIQ, Context7, and Azure MCP for enrichment (BUG-005)

**Independent Test**: With MCP configured, run Discover and verify web search results stored; run Design and verify Context7 queried.

### Tests for US3 (REQUIRED — write first, must FAIL) ⚠️

- [x] T057 [P] [US3] Add failing test in tests/unit/cli/workshopCommand.spec.ts — verify McpManager created from .vscode/mcp.json
- [x] T058 [P] [US3] Add failing test in tests/unit/cli/workshopCommand.spec.ts — verify WebSearchClient created when configured and passed to Discover handler
- [x] T059 [P] [US3] Add failing test in tests/unit/cli/workshopCommand.spec.ts — verify McpManager passed to Discover handler for WorkIQ consent flow (FR-012a)
- [x] T060 [P] [US3] Add failing test in tests/unit/phases/phaseHandlers.spec.ts — verify Design handler queries Context7 via McpManager in postExtract (FR-013)
- [x] T061 [P] [US3] Add failing test in tests/unit/phases/phaseHandlers.spec.ts — verify Plan handler queries Azure MCP via McpManager in postExtract (FR-014)
- [x] T062 [P] [US3] Add failing test in tests/unit/phases/phaseHandlers.spec.ts — verify Design handler degrades gracefully when Context7 unavailable (FR-015)

### Implementation for US3

- [x] T063 [US3] Extend `PhaseHandlerConfig` with `mcpManager?: McpManager` and `webSearchClient?: WebSearchClient` in src/phases/phaseHandlers.ts (FR-011)
- [x] T064 [US3] Create `McpManager` in `workshopCommandInner()` from `.vscode/mcp.json` via `loadMcpConfig()` in src/cli/workshopCommand.ts (FR-011)
- [x] T065 [US3] Create `WebSearchClient` in `workshopCommandInner()` when `isWebSearchConfigured()` returns true in src/cli/workshopCommand.ts (FR-012)
- [x] T066 [US3] Pass `mcpManager` + `webSearchClient` to Discover handler via `PhaseHandlerConfig.discover` in src/cli/workshopCommand.ts (FR-012, FR-012a — verify existing WorkIQ consent flow activates when McpManager is wired)
- [x] T067 [US3] Pass `mcpManager` to all phase handler calls via `PhaseHandlerConfig` in src/cli/workshopCommand.ts
- [x] T068 [US3] Add `postExtract` hook to Design handler — query Context7 for technologies in `session.ideas` in src/phases/phaseHandlers.ts (FR-013)
- [x] T069 [US3] Add `postExtract` hook to Plan handler — query Azure MCP for services in `session.plan.architectureNotes` in src/phases/phaseHandlers.ts (FR-014)
- [x] T070 [US3] Wrap all MCP calls in try/catch for graceful degradation in src/phases/phaseHandlers.ts (FR-015)
- [x] T071 [US3] Run `npm run test:unit` — T057–T062 must PASS; all existing tests must still PASS

**Checkpoint**: MCP tools wired and operational. Enrichment flows working with graceful degradation.

---

## Phase 7: User Story 5 — Export Completeness (Priority: P2)

**Goal**: `sofia export` produces markdown files for all phases with conversation data, even without structured artifacts (BUG-004)

**Independent Test**: Export a session with null structured fields but 48 conversation turns — verify 6 markdown files generated.

### Tests for US5 (REQUIRED — write first, must FAIL) ⚠️

- [x] T072 [P] [US5] Add failing test in tests/unit/sessions/exportWriter.spec.ts — Ideate export with null `session.ideas` but conversation turns produces ideate.md
- [x] T073 [P] [US5] Add failing test in tests/unit/sessions/exportWriter.spec.ts — Design export with null `session.evaluation` but turns produces design.md
- [x] T074 [P] [US5] Add failing test in tests/unit/sessions/exportWriter.spec.ts — export with both structured data + turns renders structured first then conversation
- [x] T075 [P] [US5] Add failing test in tests/unit/sessions/exportWriter.spec.ts — summary.json lists all 6 phase files when all phases have turns
- [x] T076 [P] [US5] Add failing test in tests/unit/sessions/exportWriter.spec.ts — summary.json highlights include one entry per phase with turns
- [x] T077 [P] [US5] Add failing integration test in tests/integration/exportFallbackFlow.spec.ts — full export pipeline with null structured data

### Implementation for US5

- [x] T078 [US5] Refactor `generateIdeateMarkdown()` in src/sessions/exportWriter.ts — remove early return null; add conversation turn fallback (FR-020, FR-021, FR-022)
- [x] T079 [P] [US5] Refactor `generateDesignMarkdown()` in src/sessions/exportWriter.ts — same pattern (FR-020, FR-021, FR-022)
- [x] T080 [P] [US5] Refactor `generateSelectMarkdown()` in src/sessions/exportWriter.ts — same pattern (FR-020, FR-021, FR-022)
- [x] T081 [P] [US5] Refactor `generatePlanMarkdown()` in src/sessions/exportWriter.ts — same pattern (FR-020, FR-021, FR-022)
- [x] T082 [P] [US5] Refactor `generateDevelopMarkdown()` in src/sessions/exportWriter.ts — same pattern (FR-020, FR-021, FR-022)
- [x] T083 [US5] Update `exportSession()` in src/sessions/exportWriter.ts — summary.json lists all generated files (FR-023)
- [x] T084 [US5] Update highlight generation in src/sessions/exportWriter.ts — include one highlight per phase with turns, fallback to first assistant turn opening (FR-024)
- [x] T085 [US5] Run `npm run test:unit && npm run test:integration` — T072–T077 must PASS; all existing tests must still PASS

**Checkpoint**: Export produces complete artifacts for all 6 phases. summary.json includes all files and highlights.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, regression testing, cleanup

- [x] T086 [P] Update build assets script in package.json to copy `src/prompts/summarize/*.md` to `dist/src/prompts/summarize/`
- [x] T087 [P] Run `npm run typecheck` — zero errors
- [x] T088 [P] Run `npm run lint` — zero errors (fix any import ordering issues)
- [x] T089 Run full test suite: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] T090 Update Zava assessment test in tests/live/zavaFullWorkshop.spec.ts — relax assertion on `session.ideas` (now expected to pass), add assertions for extraction, export completeness
- [x] T091 Add failure/recovery E2E scenario to Zava live test in tests/live/zavaFullWorkshop.spec.ts — simulate a phase timeout and verify recovery fallback activates (FR-019a, Constitution Principle VI)
- [x] T092 Run quickstart.md validation — verify all file paths and commands in quickstart.md are accurate

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
| **Total tasks**            | 92                                                    |
| **US1 (Extraction)**       | 17 tasks (incl. Mermaid extraction T034)              |
| **US2 (Web Search)**       | 7 tasks                                               |
| **US3 (MCP Wiring)**       | 15 tasks                                              |
| **US4 (Context)**          | 20 tasks (incl. split timeout retry/fallback)         |
| **US5 (Export)**           | 14 tasks                                              |
| **Setup + Foundational**   | 12 tasks                                              |
| **Polish**                 | 7 tasks (incl. failure/recovery E2E scenario)         |
| **Parallel opportunities** | US2/US1/US4/US5 can all start after Phase 2 completes |
| **MVP scope**              | US2 + US1 (24 tasks, addresses P1 stories)            |
