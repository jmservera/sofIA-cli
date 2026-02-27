# Tasks: sofIA Unified Build-From-Scratch CLI (Feature 001)

**Input**: Design documents from `/specs/001-cli-workshop-rebuild/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for new behavior in this repository (Red → Green → Review). Write tests first for each user story and core infrastructure.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. This feature covers Discover → Ideate → Design → Select → Plan and PoC intent capture only; concrete PoC repo generation and the Ralph loop are implemented in feature `002-poc-generation`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, TypeScript/Node toolchain, and base repository wiring.

- [x] T001 Initialize Node.js + TypeScript project structure at repo root (package.json, tsconfig.json, src/, tests/)
- [x] T002 Add core dependencies (`@github/copilot-sdk`, `commander`, `@inquirer/prompts`, `zod`, `pino`, `ora`, `marked`, `marked-terminal`, `chalk`, `cli-table3`) in package.json
- [x] T003 Configure TypeScript build scripts and Node 20 target in package.json
- [x] T004 [P] Configure linting/formatting (ESLint + Prettier) for src/ and tests/
- [x] T005 [P] Setup basic Vitest configuration file for unit/integration tests in tests/
- [x] T006 [P] Add npm scripts for `test`, `test:unit`, `test:integration`, and `test:e2e` in package.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T007 Define shared type schemas for WorkshopSession and related entities in src/shared/schemas/session.ts
- [x] T008 Implement session persistence adapter (read/write) in src/sessions/sessionStore.ts using `./.sofia/sessions/<sessionId>.json`
- [x] T009 Implement export directory helper in src/sessions/exportPaths.ts for `./exports/<sessionId>/`
- [x] T010 Implement logging setup with `pino` in src/logging/logger.ts (includes redaction of secrets/PII)
- [x] T011 Implement activity/telemetry event model in src/shared/events.ts (TextDelta, Activity, ToolCall, ToolResult, PhaseChanged, Error)
- [x] T012 Implement ConversationLoop abstraction in src/loop/conversationLoop.ts (streaming renderer, event handling, Ctrl+C handling)
- [x] T013 [P] Implement Markdown rendering helper with `marked` + `marked-terminal` in src/shared/markdownRenderer.ts (TTY vs non-TTY, --json safe)
- [x] T014 [P] Implement CLI table helper using `cli-table3` in src/shared/tableRenderer.ts
- [x] T015 Implement MCP manager in src/mcp/mcpManager.ts (load .vscode/mcp.json, connect clients, list tools, error classification)
- [x] T016 Implement Copilot client wrapper in src/shared/copilotClient.ts to abstract Copilot SDK interactions for tests
- [x] T017 [P] Create initial CLI entrypoint in src/cli/index.ts wired to commander (no workshop commands implemented yet)
- [x] T018 [P] Add node-pty based E2E harness skeleton in tests/e2e/harness.spec.ts for driving the CLI interactively
- [x] T019 Add foundational unit tests for sessionStore, logger, markdownRenderer, and ConversationLoop in tests/unit/
 - [x] T059 [P] Implement `web.search` tool backed by the Azure AI Foundry Bing Search agent in src/mcp/webSearch.ts, wired through McpManager and exposed to the Copilot SDK
 - [x] T060 [P] Add unit/integration tests for `web.search` behavior and degradation paths (Foundry misconfigured/unavailable) in tests/unit/mcp/webSearch.spec.ts and/or tests/integration/webSearch.spec.ts

**Checkpoint**: Foundation ready – user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - Run a new governed workshop session (Priority: P1) 🎯 MVP

**Goal**: Allow a facilitator to start a new workshop session, drive phases Discover → Ideate → Design → Select → Plan with explicit decision gates, and capture artifacts and PoC intent without losing progress.

**Independent Test**: Using the PTY harness, simulate a full `New Session` run that completes all phases, verifies phase summaries and decision gates, and confirms session persistence and artifacts are written.

### Tests for User Story 1 (REQUIRED) ⚠️

- [x] T020 [P] [US1] Add integration test in tests/integration/newSessionFlow.spec.ts to cover happy-path New Session through Plan with decision gates
- [ ] T021 [P] [US1] Add PTY-based E2E test in tests/e2e/newSession.e2e.spec.ts to validate streaming output and interactive prompts

### Implementation for User Story 1

- [x] T022 [US1] Implement `sofia workshop` command and main menu (New Session, Resume Session, Status, Export) in src/cli/workshopCommand.ts
- [x] T023 [US1] Implement New Session flow wiring in src/cli/workshopCommand.ts to create a new WorkshopSession and persist it via sessionStore
- [x] T024 [US1] Implement Discover phase module in src/phases/discoverPhase.ts using WorkIQ (when available), web.search, and prompts from src/prompts/
- [x] T025 [US1] Implement Ideate phase module in src/phases/ideatePhase.ts using Discovery Cards dataset via src/shared/data/cardsLoader.ts
- [x] T026 [US1] Implement Design phase module in src/phases/designPhase.ts, including Idea Cards and Mermaid architecture sketch generation
- [x] T027 [US1] Implement Select phase module in src/phases/selectPhase.ts with BXT evaluation and scoring
- [x] T028 [US1] Implement Plan phase module in src/phases/planPhase.ts producing implementation roadmap and PoC intent fields
- [x] T029 [US1] Implement Develop boundary module in src/phases/developBoundary.ts to capture PoC requirements into PocDevelopmentState without generating a repo
- [x] T030 [US1] Implement governed phase progression and decision gates in src/loop/conversationLoop.ts (no auto-advance; explicit decisions only)
- [x] T031 [US1] Wire ConversationLoop into workshop command so that each phase uses streaming renderer and activity events
- [x] T032 [US1] Integrate rationale summaries and activity stream rendering into interactive output in src/cli/workshopCommand.ts
- [x] T033 [US1] Ensure session is persisted after every user input/turn in all phase modules via sessionStore
- [x] T034 [US1] Implement status command handler in src/cli/statusCommand.ts that reads session JSON and emits minimal status (TTY and --json)
- [x] T035 [US1] Add unit tests for individual phase modules (Discover/Ideate/Design/Select/Plan/Develop boundary) in tests/unit/phases/

**Checkpoint**: User Story 1 fully functional and testable independently via integration and E2E tests.

---

## Phase 4: User Story 2 - Resume, backtrack, and export a session (Priority: P2)

**Goal**: Allow a facilitator to resume an existing session, step back to earlier phases with deterministic invalidation of downstream artifacts, and export customer-ready artifacts and summary JSON.

**Independent Test**: Using integration and PTY harness tests, create a session, stop mid-way, resume it, backtrack to an earlier phase, and export artifacts, verifying that downstream artifacts are regenerated correctly.

### Tests for User Story 2 (REQUIRED) ⚠️

- [x] T036 [P] [US2] Add integration test in tests/integration/resumeAndBacktrack.spec.ts covering resume, backtrack, and artifact invalidation
- [x] T037 [P] [US2] Add integration test in tests/integration/exportArtifacts.spec.ts to validate export bundle contents and summary.json

### Implementation for User Story 2

- [x] T038 [US2] Implement Resume Session menu option in src/cli/workshopCommand.ts that loads an existing session via sessionStore
- [x] T039 [US2] Implement backtrack capability in src/sessions/sessionManager.ts to move to an earlier phase and mark downstream artifacts invalid
- [x] T040 [US2] Ensure phase modules honor invalidated state and recompute artifacts deterministically when rerun
- [x] T041 [US2] Implement export command handler in src/cli/exportCommand.ts to generate Markdown artifacts per phase and summary.json under ./exports/<sessionId>/
- [x] T042 [US2] Implement ArtifactIndex writing in src/sessions/exportWriter.ts to track generated files and timestamps
- [x] T043 [US2] Add unit tests for sessionManager backtracking and artifact invalidation behavior in tests/unit/sessions/sessionManager.spec.ts
- [x] T044 [US2] Add unit tests for exportWriter and exportCommand in tests/unit/cli/exportCommand.spec.ts

**Checkpoint**: User Stories 1 and 2 both work independently; sessions can be resumed, backtracked, and exported safely.

---

## Phase 5: User Story 3 - Continue a session via direct command mode (Priority: P3)

**Goal**: Support non-interactive and automation-friendly continuation of sessions with clear JSON-only output and correct behavior in TTY vs non-TTY environments.

**Independent Test**: Using CLI invocations under non-TTY and --json flags, verify that required inputs are enforced, failures are non-zero exits with actionable errors, and stdout remains machine-readable.

### Tests for User Story 3 (REQUIRED) ⚠️

- [x] T045 [P] [US3] Add integration test in tests/integration/directCommandTty.spec.ts for direct command mode with TTY (prompts for missing inputs)
- [x] T046 [P] [US3] Add integration test in tests/integration/directCommandNonTty.spec.ts for non-TTY mode (fails fast when inputs missing, JSON-only output)

### Implementation for User Story 3

- [x] T047 [US3] Implement direct command entrypoints (e.g., `sofia workshop --session <id> --phase <phase>` and `sofia status --session <id> --json`) in src/cli/directCommands.ts
- [x] T048 [US3] Implement detection of TTY vs non-TTY and JSON mode in src/cli/ioContext.ts
- [x] T049 [US3] Enforce required input validation in non-TTY mode with non-zero exit codes and actionable error messages
- [x] T050 [US3] Ensure stdout remains JSON-only when --json is specified, sending telemetry/activity to stderr instead
- [x] T051 [US3] Implement retry flag handling (e.g., `--retry <N>`) for transient failures in direct command flows in src/cli/directCommands.ts
- [x] T052 [US3] Add unit tests for ioContext, JSON output separation, and retry behavior in tests/unit/cli/directCommands.spec.ts

**Checkpoint**: All three user stories are independently functional and testable; automation scenarios are supported safely.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and overall robustness.

- [x] T053 [P] Add documentation for CLI usage, session model, and exports in a new docs/ directory (linking back to specs/001-cli-workshop-rebuild)
- [x] T054 Implement centralized error classification and mapping to user-facing messages in src/shared/errorClassifier.ts
- [x] T055 [P] Add additional unit tests for errorClassifier and edge cases (MCP down, WorkIQ unavailable, web.search failures) in tests/unit/shared/errorClassifier.spec.ts
- [x] T056 Implement pre-flight checks for Copilot connectivity and MCP readiness in src/cli/preflight.ts and integrate into workshop command startup
- [x] T057 [P] Validate quickstart.md by running commands and updating any mismatched flags or script names
- [x] T058 Review logs to ensure no secrets/PII are written; adjust logger redaction rules as needed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies – can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion – BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational phase completion.
  - User stories can then proceed in parallel (if staffed) but are ordered by priority: US1 (P1) → US2 (P2) → US3 (P3).
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2); no dependencies on other stories; defines the main workshop flow and is the MVP.
- **User Story 2 (P2)**: Can start after Foundational (Phase 2); depends on core session model from US1 but remains independently testable.
- **User Story 3 (P3)**: Can start after Foundational (Phase 2); depends on session model and commands from US1 but is independently testable in direct-command contexts.

### Within Each User Story

- Tests MUST be written and FAIL before implementation.
- Shared entities and helpers (src/shared/, src/sessions/) should be reused, not duplicated.
- For each story: models/schemas → services/managers → CLI commands/endpoints → integration wiring → E2E validation.

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel.
- All Foundational tasks marked [P] can run in parallel once their dependencies are met.
- After Foundational completion, different user stories (US1, US2, US3) can be worked on by different developers in parallel.
- Within each story, test tasks marked [P] and helper implementations in different files can proceed in parallel.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL – blocks all stories).
3. Complete Phase 3: User Story 1 (New Session, phases Discover→Plan, PoC intent capture, status output).
4. STOP and VALIDATE via integration and PTY E2E tests.
5. Demo the end-to-end workshop flow using the quickstart commands.

### Incremental Delivery

1. Deliver MVP (User Story 1).
2. Add User Story 2 (resume, backtrack, export) and validate independently.
3. Add User Story 3 (direct command/automation) and validate independently.
4. Apply Phase 6 polish and cross-cutting improvements.

### Relation to Feature 002 (PoC Generation & Ralph Loop)

- This feature ensures that session JSON and exports contain all necessary PoC intent and plan information.
- Feature 002 will consume these artifacts to generate and iteratively refine a PoC repository using GitHub MCP and/or local scaffolding.
