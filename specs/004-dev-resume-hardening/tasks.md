# Tasks: Dev Resume & Hardening

**Input**: Design documents from `/specs/004-dev-resume-hardening/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for new behavior in this repository (Red → Green → Review). Include test tasks for each user story and write them first.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, shared types, and test infrastructure used by multiple stories

- [ ] T001 Create `CheckpointState` interface and `deriveCheckpointState()` function in `src/develop/checkpointState.ts` per data-model.md derivation logic
- [ ] T002 [P] Create `TemplateEntry` interface and `TemplateRegistry` type in `src/develop/templateRegistry.ts` (types only — no template content yet)
- [ ] T003 [P] Create test fixture project in `tests/fixtures/test-fixture-project/` with `package.json`, `vitest.config.ts`, `src/add.ts`, `tests/passing.test.ts`, `tests/failing.test.ts`, and `tests/hanging.test.ts` per data-model.md TestFixtureProject spec
- [ ] T004 Run `npm install` in `tests/fixtures/test-fixture-project/` and add `tests/fixtures/test-fixture-project/node_modules` to `.gitignore`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core changes shared across multiple user stories — MUST complete before story work

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Make `extractJson()` and `buildErrorResult()` methods `protected` in `src/develop/testRunner.ts` (like `parseOutput` already is) to enable subclass testing
- [ ] T006 Add `testCommand` optional parameter to `TestRunnerOptions` interface in `src/develop/testRunner.ts` and use it in `spawnTests()` instead of hardcoded `npm test -- --reporter=json`
- [ ] T007 Extract `NODE_TS_VITEST_TEMPLATE` from `src/develop/pocScaffolder.ts` into `src/develop/templateRegistry.ts` as the first `TemplateEntry`, including `techStack`, `installCommand`, `testCommand`, and `matchPatterns`
- [ ] T008 Add `selectTemplate()` function to `src/develop/templateRegistry.ts` implementing first-match-wins logic per contracts/cli.md Template Selection rules
- [ ] T009 Add `PYTHON_PYTEST_TEMPLATE` entry to `src/develop/templateRegistry.ts` with files (`.gitignore`, `requirements.txt`, `pytest.ini`, `README.md`, `src/__init__.py`, `src/main.py`, `tests/test_main.py`, `.sofia-metadata.json`), `techStack`, `installCommand`, `testCommand`, and `matchPatterns` per data-model.md TemplateEntry table
- [ ] T010 Update `PocScaffolder.buildContext()` in `src/develop/pocScaffolder.ts` to accept an optional `TemplateEntry` parameter and use its `techStack` instead of the hardcoded default
- [ ] T011 Update `PocScaffolder` constructor in `src/develop/pocScaffolder.ts` to accept `TemplateEntry` (using `entry.files`) instead of raw `TemplateFile[]`, preserving backward compatibility

**Checkpoint**: Foundation ready — shared types, test fixtures, and registry exist. User story implementation can begin.

---

## Phase 3: User Story 1 — Resume an Interrupted PoC Session (Priority: P1) 🎯 MVP

**Goal**: Running `sofia dev --session X` on an interrupted session resumes from the last completed iteration, skipping scaffold and re-running npm install.

**Independent Test**: Interrupt after 2 iterations, re-run, verify iteration 3 starts without re-scaffolding.

**FRs covered**: FR-001, FR-001a, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-007a

### Tests for User Story 1 (REQUIRED) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T012 [P] [US1] Unit test: `deriveCheckpointState` returns correct state for no-poc, completed, partial, interrupted sessions in `tests/unit/develop/checkpointState.spec.ts`
- [ ] T013 [P] [US1] Unit test: `RalphLoop.run()` seeds `iterations` from `session.poc.iterations` and starts from correct `iterNum` in `tests/unit/develop/ralphLoop.spec.ts` (add describe block "resume iteration seeding")
- [ ] T014 [P] [US1] Unit test: `RalphLoop.run()` skips scaffold when checkpoint says `canSkipScaffold=true` in `tests/unit/develop/ralphLoop.spec.ts`
- [ ] T015 [P] [US1] Unit test: `RalphLoop.run()` pops incomplete last iteration (no testResults) and re-runs it per FR-001a in `tests/unit/develop/ralphLoop.spec.ts`
- [ ] T016 [P] [US1] Unit test: `developCommand` exits with completion message when `poc.finalStatus === 'success'` per FR-005 in `tests/unit/cli/developCommand.spec.ts`
- [ ] T017 [P] [US1] Unit test: `developCommand` defaults to resume when `poc.finalStatus === 'failed'|'partial'` per FR-006 in `tests/unit/cli/developCommand.spec.ts`
- [ ] T018 [P] [US1] Unit test: resume re-scaffolds when output directory is missing but iterations exist per FR-007 in `tests/unit/develop/ralphLoop.spec.ts`
- [ ] T019 [US1] Integration test: full resume flow — create session with 2 completed iterations, run `RalphLoop`, verify starts at iteration 3 in `tests/integration/ralphLoopPartial.spec.ts` (add describe block "resume from interrupted session")

### Implementation for User Story 1

- [ ] T020 [US1] Implement `deriveCheckpointState()` logic in `src/develop/checkpointState.ts` per data-model.md derivation rules
- [ ] T021 [US1] Update `developCommand()` in `src/cli/developCommand.ts` to call `deriveCheckpointState()` before creating RalphLoop and handle FR-005 (success exit) and FR-006 (failed/partial default resume)
- [ ] T022 [US1] Modify `RalphLoop.run()` in `src/develop/ralphLoop.ts` to seed `iterations` from `session.poc.iterations`, derive `iterNum = iterations.length + 1`, and pop incomplete last iteration per FR-001/FR-001a
- [ ] T023 [US1] Modify `RalphLoop.run()` in `src/develop/ralphLoop.ts` to skip scaffold when output dir + `.sofia-metadata.json` exist per FR-002, and always re-run install per FR-003
- [ ] T024 [US1] Modify `RalphLoop.run()` in `src/develop/ralphLoop.ts` to include prior iteration history in LLM prompt context per FR-004 (seed `prevFailingTests` from last iteration's `testResults.failures`)
- [ ] T025 [US1] Modify `RalphLoop.run()` in `src/develop/ralphLoop.ts` to re-scaffold when output dir is missing but iterations exist per FR-007
- [ ] T026 [US1] Add info-level resume decision logging in `src/develop/ralphLoop.ts` and `src/cli/developCommand.ts` per FR-007a (iteration number, skip scaffold, re-run install, incomplete iteration re-run)

**Checkpoint**: Resume works end-to-end. `sofia dev --session X` resumes from correct iteration after interruption. All resume decisions are logged at info level.

---

## Phase 4: User Story 2 — Force-Restart a PoC Session (Priority: P1)

**Goal**: `sofia dev --session X --force` deletes output directory AND resets `session.poc` state, starting completely fresh.

**Independent Test**: Create output via `sofia dev`, then `--force`, verify both directory and `poc.iterations` reset.

**FRs covered**: FR-008, FR-009, FR-010

### Tests for User Story 2 (REQUIRED) ⚠️

- [ ] T027 [P] [US2] Unit test: `developCommand` with `--force` clears `session.poc` and calls `store.save()` before creating RalphLoop per FR-008 in `tests/unit/cli/developCommand.spec.ts`
- [ ] T028 [P] [US2] Unit test: `developCommand` with `--force` on a `poc.finalStatus === 'success'` session clears status and starts fresh per FR-010 in `tests/unit/cli/developCommand.spec.ts`
- [ ] T029 [P] [US2] Unit test: `developCommand` with `--force` on a session with no prior poc state behaves identically to first run in `tests/unit/cli/developCommand.spec.ts`
- [ ] T030 [US2] Integration test: force-restart flow — create session with iterations, run with `--force`, verify empty iterations and fresh scaffold in `tests/integration/ralphLoopFlow.spec.ts` (add describe block "force restart")

### Implementation for User Story 2

- [ ] T031 [US2] Update `developCommand()` in `src/cli/developCommand.ts` to clear `session.poc = undefined` and call `store.save(session)` when `--force` is set per FR-008, before creating RalphLoop
- [ ] T032 [US2] Ensure `--force` path logs info-level message "Cleared existing output directory and session state (--force)" in `src/cli/developCommand.ts`

**Checkpoint**: `--force` resets both output directory and session state. Works on any `finalStatus` value including `'success'`.

---

## Phase 5: User Story 3 — PoC Template Selection Based on Plan (Priority: P2)

**Goal**: Scaffolder auto-selects template based on plan's `architectureNotes` — Python plan gets `python-pytest`, TypeScript plan gets `node-ts-vitest`.

**Independent Test**: Session with Python/FastAPI plan generates Python project structure.

**FRs covered**: FR-011, FR-012, FR-013, FR-014, FR-015

### Tests for User Story 3 (REQUIRED) ⚠️

- [ ] T033 [P] [US3] Unit test: `selectTemplate()` returns `python-pytest` for plans mentioning "Python" or "FastAPI" in `tests/unit/develop/templateRegistry.spec.ts`
- [ ] T034 [P] [US3] Unit test: `selectTemplate()` returns `node-ts-vitest` for plans mentioning "TypeScript" or with no architecture notes in `tests/unit/develop/templateRegistry.spec.ts`
- [ ] T035 [P] [US3] Unit test: `selectTemplate()` returns default `node-ts-vitest` for ambiguous plans in `tests/unit/develop/templateRegistry.spec.ts`
- [ ] T036 [P] [US3] Unit test: `PocScaffolder` uses `TemplateEntry.files` when constructed with a template entry in `tests/unit/develop/pocScaffolder.spec.ts`
- [ ] T037 [US3] Integration test: scaffold with `python-pytest` template generates expected file structure (`requirements.txt`, `src/main.py`, `tests/test_main.py`) in `tests/integration/pocScaffold.spec.ts` (add describe block "python-pytest template")

### Implementation for User Story 3

- [ ] T038 [US3] Wire template selection into `developCommand.ts`: call `selectTemplate(registry, plan.architectureNotes, plan.dependencies)` and pass result to `PocScaffolder` and `RalphLoop`
- [ ] T039 [US3] Update `RalphLoop` to use `TemplateEntry.installCommand` for dependency installation instead of hardcoded `npm install` in `src/develop/ralphLoop.ts`
- [ ] T040 [US3] Update `RalphLoop` to pass `TemplateEntry.testCommand` to `TestRunner` constructor in `src/develop/ralphLoop.ts`
- [ ] T041 [US3] Add info-level log "Selected template: {id} (matched '{pattern}' in architecture notes)" in `src/cli/developCommand.ts`

**Checkpoint**: Python plans produce Python scaffold. TypeScript plans preserve current behavior. Adding a new template requires only a registry entry.

---

## Phase 6: User Story 4 — TestRunner Coverage Hardening (Priority: P2)

**Goal**: `testRunner.ts` test coverage increases from 45% to 80%+ via real fixture-based integration tests.

**Independent Test**: Run fixture-based tests covering spawn, parse, timeout, and malformed output.

**FRs covered**: FR-016, FR-017, FR-018, FR-019

### Tests for User Story 4 (REQUIRED) ⚠️

> **NOTE**: These are the deliverable for this story — the tests themselves ARE the feature

- [ ] T042 [P] [US4] Integration test: `testRunner.run()` against fixture project with passing tests, verify correct pass/fail/skip counts in `tests/integration/testRunnerReal.spec.ts`
- [ ] T043 [P] [US4] Integration test: `testRunner.run()` against fixture project with failing tests, verify failure details parsed correctly in `tests/integration/testRunnerReal.spec.ts`
- [ ] T044 [US4] Integration test: `testRunner.run()` with short timeout against hanging test fixture, verify SIGTERM→SIGKILL and timeout error result per FR-016/FR-018 in `tests/integration/testRunnerReal.spec.ts`
- [ ] T045 [US4] Unit test: `extractJson()` fallback path (first-`{`-to-last-`}`) with mixed console+JSON output per FR-017 in `tests/unit/develop/testRunner.spec.ts` (use `TestableTestRunner` subclass)
- [ ] T046 [US4] Unit test: `extractJson()` returns null for output with no valid JSON per FR-017 in `tests/unit/develop/testRunner.spec.ts`
- [ ] T047 [US4] Unit test: `buildErrorResult()` produces correct zero-count result with error message per FR-018 in `tests/unit/develop/testRunner.spec.ts`

### Implementation for User Story 4

- [ ] T048 [US4] If any coverage gaps remain after writing the above tests, add targeted unit tests to reach 80%+ coverage for `src/develop/testRunner.ts` (run `npm test -- --coverage` to verify)

**Checkpoint**: `testRunner.ts` coverage is at or above 80%. All critical code paths (spawn, parse, timeout, fallback) have automated tests using real fixtures.

---

## Phase 7: User Story 5 — PTY-Based Interactive E2E Tests (Priority: P3)

**Goal**: PTY-based E2E tests validate Ctrl+C handling, progress output, and clean exit behavior for `sofia dev`.

**Independent Test**: Spawn `sofia dev` in PTY, send Ctrl+C, verify recovery message and exit code.

**FRs covered**: (implicit quality requirement from spec)

### Tests for User Story 5 (REQUIRED) ⚠️

> **NOTE**: The tests ARE the deliverable — this story is test-only

- [ ] T049 [P] [US5] E2E test: PTY-spawn `sofia dev`, send Ctrl+C during iteration, verify exit code 0 and recovery message in `tests/e2e/developPty.spec.ts`
- [ ] T050 [P] [US5] E2E test: PTY-spawn `sofia dev`, verify iteration progress lines ("Iteration N/M") appear in PTY output buffer in `tests/e2e/developPty.spec.ts`
- [ ] T051 [US5] Add PTY availability guard to `tests/e2e/developPty.spec.ts` — skip gracefully if `node-pty` allocation fails (e.g., CI without TTY)

**Checkpoint**: Interactive behaviors (Ctrl+C, progress output) are validated in CI via PTY simulation.

---

## Phase 8: User Story 6 — Workshop-to-Dev Transition Clarity (Priority: P3)

**Goal**: Workshop displays actionable `sofia dev --session <id>` command after Plan phase completes.

**Independent Test**: Complete Plan phase, verify output contains exact `sofia dev` command with session ID.

**FRs covered**: FR-020, FR-021

### Tests for User Story 6 (REQUIRED) ⚠️

- [ ] T052 [P] [US6] Unit test: workshop command displays "sofia dev --session {id}" after Plan phase completes per FR-020 in `tests/unit/cli/workshopCommand.spec.ts`
- [ ] T053 [P] [US6] Unit test: workshop command offers auto-transition prompt in interactive mode per FR-021 in `tests/unit/cli/workshopCommand.spec.ts`

### Implementation for User Story 6

- [ ] T054 [US6] Add transition guidance message in `src/cli/workshopCommand.ts` when `getNextPhase(phase) === 'Develop'` — display exact `sofia dev --session ${session.sessionId}` command per contracts/cli.md
- [ ] T055 [US6] Add interactive mode offer ("Would you like to start PoC development now?") in `src/cli/workshopCommand.ts` per FR-021 (SHOULD — use `@inquirer/prompts` confirm)

**Checkpoint**: Workshop users see clear next-step guidance including the exact command to run after Plan phase.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T056 [P] Extend `.sofia-metadata.json` schema in `src/develop/pocScaffolder.ts` to include `templateId` and `todos` fields per FR-022 and contracts/cli.md extended schema
- [ ] T057 [P] Add TODO marker scanning logic to `src/develop/pocScaffolder.ts` — scan scaffold files at scaffold time for `TODO:` markers, record in `.sofia-metadata.json`
- [ ] T058 Add TODO marker rescan after each iteration in `src/develop/ralphLoop.ts` — update `.sofia-metadata.json` with remaining TODO count per FR-022
- [ ] T059 [P] Update `src/develop/index.ts` barrel export to include `checkpointState.ts` and `templateRegistry.ts`
- [ ] T060 Run `npm run typecheck` and fix any type errors across all modified files
- [ ] T061 Run `npm run lint` and fix any lint warnings (especially `import/order`) across all modified files
- [ ] T062 Run full test suite `npm test` and verify all tests pass (no regressions)
- [ ] T063 Run `npm test -- --coverage` on `src/develop/testRunner.ts` and verify coverage ≥ 80% per SC-004-004
- [ ] T064 Run quickstart.md validation — execute the quick verification steps from `specs/004-dev-resume-hardening/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) — P1, MVP
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2) — P1, can parallel with US1 (different files: `developCommand.ts` vs `ralphLoop.ts`)
- **User Story 3 (Phase 5)**: Depends on Foundational (Phase 2) — P2, uses `templateRegistry.ts` from Phase 2
- **User Story 4 (Phase 6)**: Depends on Phase 2 T005 only (protected methods + test fixture) — P2, independent of all other stories
- **User Story 5 (Phase 7)**: Depends on US1 completion (resume behavior must work for Ctrl+C test) — P3
- **User Story 6 (Phase 8)**: Depends on Foundational only — P3, independent of other stories
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2. No dependencies on other stories. 🎯 **MVP target**
- **User Story 2 (P1)**: Can start after Phase 2. Shares `developCommand.ts` with US1 — coordinate edits but independently testable
- **User Story 3 (P2)**: Can start after Phase 2. Uses registry from Phase 2. Independent of US1/US2
- **User Story 4 (P2)**: Can start after T005 (protected methods). Fully independent — test-only story
- **User Story 5 (P3)**: Needs US1 resume working. Tests resume+Ctrl+C interaction
- **User Story 6 (P3)**: After Phase 2 only. Fully independent — workshop command changes

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation follows test order (entity → service → endpoint)
- Story complete before moving to next priority

### Parallel Opportunities

- T001, T002, T003 can run in parallel (different files)
- T005, T006, T007, T008, T009, T010, T011 — some can parallel (T005 different file from T007-T011)
- T012-T018 (US1 tests) can all run in parallel (test file additions)
- T027-T029 (US2 tests) can run in parallel
- T033-T036 (US3 tests) can run in parallel
- T042-T047 (US4 tests) can run in parallel (different test files)
- US4 (Phase 6) and US6 (Phase 8) can run in parallel with US1/US2/US3 after Phase 2

---

## Parallel Example: User Story 1

```bash
# Launch all tests for US1 together (different test files/blocks):
T012: "Unit test: deriveCheckpointState in tests/unit/develop/checkpointState.spec.ts"
T013: "Unit test: RalphLoop resume seeding in tests/unit/develop/ralphLoop.spec.ts"
T014: "Unit test: RalphLoop skip scaffold in tests/unit/develop/ralphLoop.spec.ts"
T015: "Unit test: RalphLoop pop incomplete in tests/unit/develop/ralphLoop.spec.ts"
T016: "Unit test: developCommand success exit in tests/unit/cli/developCommand.spec.ts"
T017: "Unit test: developCommand resume default in tests/unit/cli/developCommand.spec.ts"
T018: "Unit test: resuming re-scaffolds on missing dir in tests/unit/develop/ralphLoop.spec.ts"

# Then sequential implementation (shared files):
T020 → T021 → T022 → T023 → T024 → T025 → T026
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T011)
3. Complete Phase 3: User Story 1 — Resume (T012-T026)
4. **STOP and VALIDATE**: Test resume independently
5. All 583+ existing tests still pass + new resume tests green

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. ✅ User Story 1 (Resume) → Test independently → **MVP!** (core usability fix)
3. ✅ User Story 2 (Force) → Test independently → Resume + Force both work
4. ✅ User Story 3 (Templates) → Test independently → Multi-language scaffold
5. ✅ User Story 4 (TestRunner) → Coverage verified → Quality gate met
6. ✅ User Story 5 (PTY E2E) → Interactive validation in CI
7. ✅ User Story 6 (Transition) → Full workshop→dev UX
8. Polish → Ship

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (Resume) + US2 (Force) — related, same area
   - Developer B: US3 (Templates) — independent area
   - Developer C: US4 (TestRunner coverage) — fully independent
   - Developer D: US6 (Workshop transition) — independent area
3. After US1: Developer A picks up US5 (PTY E2E, needs resume)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- `maxIterations` counts total iterations (not additional from resume) — e.g., 10 max with 3 done → runs 4-10
- Existing session schema supports resume as-is — no migration needed
