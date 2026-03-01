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
- [x] T021 [P] [US1] Add PTY-based E2E test in tests/e2e/newSession.e2e.spec.ts to validate streaming output and interactive prompts

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

## Phase 7: New Capabilities — Session Naming, Default Command, Auto-Start (FR-004, FR-015a, FR-023a)

**Purpose**: Implement three new requirements from Session 2026-02-27 clarifications: auto-generated session names, workshop as default command, and auto-start conversations.

**Prerequisites**: All Phase 1–6 tasks complete (T001–T058 except T021 optional).

### 7a. Session Naming (FR-023a)

**Goal**: Auto-generate a short session name after the first Discover exchange that yields `businessContext`. The LLM includes `sessionName` in its structured JSON block. The name is extracted, persisted, and displayed in status output.

**Independent Test**: Unit tests verify schema accepts `name`, extractor parses `sessionName` from JSON, Discover handler sets `session.name`, and status command displays it.

#### Tests for 7a (REQUIRED — write first, verify they fail) ⚠️

- [x] T061 [P] [US1] Add unit test for `name` field in `workshopSessionSchema` (accepts string, omits gracefully) in tests/unit/schemas/session.spec.ts
- [x] T062 [P] [US1] Add unit test for `extractSessionName()` (parses `sessionName` from JSON block, returns null when missing) in tests/unit/phases/phaseExtractors.spec.ts
- [x] T063 [P] [US1] Add unit test for Discover handler `extractResult()` setting `session.name` when `sessionName` is present in LLM response, **and** a negative case verifying `extractResult()` does not set `session.name` when the LLM response lacks `sessionName`, in tests/unit/phases/phaseHandlers.spec.ts
- [x] T064 [P] [US1] Add unit test for `statusCommand` displaying session name in table and JSON output in tests/unit/cli/statusCommand.spec.ts
- [x] T064b [P] [US1] Add unit test for `workshopCommand` displaying session name in creation, resume, and pause messages in tests/unit/cli/workshopCommand.spec.ts

#### Implementation for 7a

- [x] T065 [US1] Add `name?: string` field to `workshopSessionSchema` in src/shared/schemas/session.ts
- [x] T066 [P] [US1] Add `extractSessionName()` extractor function in src/phases/phaseExtractors.ts (parse `sessionName` from JSON block via `extractJsonBlock`)
- [x] T067 [US1] Update Discover handler in src/phases/phaseHandlers.ts: update `extractResult()` to call `extractSessionName()` and set `session.name` **only if `session.name` is currently undefined** (first-write-wins semantics — FR-023a says "after the first Discover exchange"); update Discover system prompt to instruct LLM to include `sessionName` in JSON output
- [x] T068 [P] [US1] Update src/cli/statusCommand.ts to display session name in TTY table row and JSON output
- [x] T069 [P] [US1] Update src/cli/workshopCommand.ts to display session name when showing session info (creation, resume, pause messages)

**Checkpoint**: Sessions receive auto-generated names after the first business context exchange; names appear in status and workshop output.

---

### 7b. Default Workshop Command (FR-004 updated)

**Goal**: Running `sofia` with no subcommand starts the workshop flow (main menu). Workshop options (`--new-session`, `--phase`, `--retry`) promoted to top level. `sofia workshop` kept as alias. `status`/`export` remain explicit subcommands. `--help` shows all options at the top level.

**Independent Test**: Integration tests verify that `sofia` (no subcommand) enters the workshop flow, `sofia workshop` still works as alias, `sofia status` and `sofia export` still work, and `--help` shows workshop options at top level.

#### Tests for 7b (REQUIRED — write first, verify they fail) ⚠️

- [x] T070 [P] [US1/US2/US3] Add integration tests for default command behavior: `sofia` with no subcommand enters workshop, `sofia workshop` works as alias, `--help` shows workshop options at top level, **and** `sofia status` and `sofia export` subcommands continue to work after restructure, in tests/integration/defaultCommand.spec.ts

#### Implementation for 7b

- [x] T071 [US1/US2/US3] Restructure src/cli/index.ts: promote `--new-session`, `--phase`, `--retry` options to top-level `program`; add default action on `program` that invokes `workshopCommand()`; keep `program.command('workshop')` as alias pointing to same handler; keep `status` and `export` as explicit subcommands
- [x] T072 [US1/US2/US3] Update src/cli/workshopCommand.ts `WorkshopCommandOptions` interface to accept `retry` at top level (if not already) and ensure direct command mode (`--session` + `--phase`) works from top level

**Checkpoint**: `sofia` and `sofia workshop` both enter the same workshop flow; `--help` shows all options; status/export subcommands unchanged.

---

### 7c. Auto-Start Conversation (FR-015a)

**Goal**: When a conversation phase starts (new or resumed), the ConversationLoop sends an initial message to the LLM before waiting for user input. The LLM introduces the phase and asks the first question. On resume, it summarizes progress and asks the next question. 10-second timeout for first token.

**Independent Test**: Unit tests verify ConversationLoop sends initial message before `readInput()`, streams the greeting, records it in turns, and handles 10s timeout. Integration tests verify end-to-end auto-start in workshop flow.

#### Tests for 7c (REQUIRED — write first, verify they fail) ⚠️

- [x] T073 [P] [US1] Add unit tests for `ConversationLoop` auto-start behavior in tests/unit/loop/conversationLoop.spec.ts: sends `initialMessage` to LLM before `readInput()`, streams greeting response, records initial exchange in turn history, handles timeout
- [x] T074 [P] [US1] Add unit tests for `getInitialMessage()` method on `PhaseHandler` interface in tests/unit/phases/phaseHandlers.spec.ts: generates phase introduction for new sessions, generates progress summary for resumed sessions, works for all 6 phase handlers
- [x] T075 [P] [US1] Add integration test for auto-start wiring in tests/integration/autoStartConversation.spec.ts: verifying workshop flow sends initial message at phase start and LLM speaks first

> **Note (E3)**: Constitution VI requires PTY-based E2E tests for interactive UX changes. Auto-start changes who speaks first, which is an interactive UX change. A PTY E2E test is deferred here (same gap as T021) — the integration test in T075 covers the logic. If PTY tests become reliable, add `tests/e2e/autoStart.e2e.spec.ts`.

#### Implementation for 7c

- [x] T076 [US1] Add `initialMessage?: string` to `ConversationLoopOptions` interface and implement auto-start in `ConversationLoop.run()` in src/loop/conversationLoop.ts: if `initialMessage` is provided, send it to LLM via `streamResponse()` before entering `readInput()` loop; record initial exchange in turn history; apply 10-second timeout for first token
- [x] T077 [US1] Add `getInitialMessage(session: WorkshopSession): string` method to `PhaseHandler` interface and implement for all 6 phase handler factories in src/phases/phaseHandlers.ts: for new sessions (no turns), generate "Introduce [phase] and ask first question" prompt; for resumed sessions (existing turns), generate "Summarize progress and ask next question" prompt
- [x] T078 [US1] Wire auto-start into src/cli/workshopCommand.ts `runWorkshop()`: call `handler.getInitialMessage(session)` and pass result as `initialMessage` to `ConversationLoop` constructor at each phase start

**Checkpoint**: Workshop phases start with LLM greeting; user never has to speak first; resumed sessions get progress summary before next question.

---

### Phase 7 Validation

- [x] T079 Run full test suite (`npx vitest run`) and CLI smoke tests (`npm run start -- --help`, `npm run start -- status`, `npm run start -- --new-session --non-interactive`) to confirm no regressions

---

## Phase 8: Visual Feedback & Streaming Markdown (FR-009a, FR-043a/b/c)

**Purpose**: Implement incremental markdown rendering during streaming, activity spinners (Thinking... + tool-specific), tool call summaries, and `--debug` verbose tool output.

**Prerequisites**: Phase 7 complete (T079 passed). Depends on existing `ConversationLoop`, `markdownRenderer`, `LoopIO`, and `events.ts`.

### 8a. Incremental Streaming Markdown Rendering (FR-009a)

**Goal**: Render LLM streaming text through `marked` + `marked-terminal` incrementally so users see formatted markdown (headings, bold, code, lists) in real time instead of raw syntax.

**Independent Test**: Unit tests verify that `TextDelta` chunks are rendered through `renderMarkdown()` before being written in TTY mode, and that raw markdown is preserved for session persistence.

#### Tests for 8a (REQUIRED — write first, verify they fail) ⚠️

- [X] T080 [P] [US1] Add unit tests for incremental markdown rendering in streaming in tests/unit/loop/conversationLoop.spec.ts: verify `TextDelta` chunks are passed through `renderMarkdown()` in TTY mode, raw markdown in non-TTY/JSON mode, and turn history stores raw markdown (not ANSI)
- [X] T081 [P] [US1] Add unit tests for `renderMarkdown()` handling of partial/incremental chunks in tests/unit/shared/markdownRenderer.spec.ts: verify partial markdown (split heading, incomplete bold) renders without crashing

#### Implementation for 8a

- [X] T082 [US1] Update `ConversationLoop.streamResponse()` in src/loop/conversationLoop.ts to pass `TextDelta` chunks through `renderMarkdown()` before `io.write()` in TTY mode; ensure raw markdown is accumulated separately for turn history persistence
- [X] T083 [US1] Update `renderMarkdown()` in src/shared/markdownRenderer.ts if needed to handle incremental chunk rendering gracefully (ensure `marked.parse()` doesn't throw on partial markdown)

**Checkpoint**: LLM streaming output appears as formatted markdown (colored headings, bold, code blocks) in the terminal during streaming.

---

### 8b. Activity Spinner Module (FR-043a, FR-043c)

**Goal**: Create a unified spinner module wrapping `ora` that manages "Thinking..." and tool-specific spinners with proper lifecycle.

**Independent Test**: Unit tests verify spinner methods (`startThinking`, `startToolCall`, `completeToolCall`, `stop`) produce expected outputs and respect TTY/JSON mode suppression.

#### Tests for 8b (REQUIRED — write first, verify they fail) ⚠️

- [X] T084 [P] [US1] Add unit tests for `ActivitySpinner` in tests/unit/shared/activitySpinner.spec.ts: verify `startThinking()` starts a spinner with "Thinking..." text, `startToolCall(name)` updates spinner text, `completeToolCall(name, summary)` stops spinner and prints summary, `stop()` clears spinner, and all methods are no-ops when non-TTY or JSON mode

#### Implementation for 8b

- [X] T085 [US1] Create `src/shared/activitySpinner.ts` with `ActivitySpinner` class wrapping `ora`: constructor accepts `{ isTTY, isJsonMode, debugMode }`; methods: `startThinking()`, `startToolCall(toolName)`, `completeToolCall(toolName, summary)`, `stop()`, `isActive()`; writes to stderr; all operations no-op when non-TTY or JSON mode

**Checkpoint**: `ActivitySpinner` module exists with full test coverage; can be instantiated and used independently.

---

### 8c. Tool Call Summaries & Debug Verbose Output (FR-043b)

**Goal**: After each tool call completes, display a one-line summary. In `--debug` mode, show full arguments and result details.

**Independent Test**: Unit tests verify `writeToolSummary()` outputs correct format in default and `--debug` modes, and is suppressed in JSON/non-TTY mode.

#### Tests for 8c (REQUIRED — write first, verify they fail) ⚠️

- [X] T086 [P] [US1] Add unit tests for `writeToolSummary()` in tests/unit/cli/ioContext.spec.ts: verify default mode prints "✓ <toolName>: <summary>" to stderr, `--debug` mode additionally prints args and result, and JSON/non-TTY mode omits tool summaries from stdout

#### Implementation for 8c

- [X] T087 [US1] Add `writeToolSummary(toolName, summary, debug?)` method to `LoopIO` interface in src/loop/conversationLoop.ts and implement in `createLoopIO()` in src/cli/ioContext.ts: default prints one-line summary to stderr; `--debug` expands with formatted JSON of args and result; non-TTY/JSON omits from stdout
- [X] T088 [US1] Update `IoContextOptions` in src/cli/ioContext.ts to accept `debug?: boolean` option so `createLoopIO()` can control verbose tool output behavior

**Checkpoint**: Tool call completions produce visible one-line summaries; `--debug` shows full details.

---

### 8d. ConversationLoop Spinner Integration (FR-043a/b/c combined)

**Goal**: Wire `ActivitySpinner` into `ConversationLoop.streamResponse()` to manage the full spinner lifecycle across thinking → tool calls → text streaming.

**Independent Test**: Integration tests verify the full spinner lifecycle: "Thinking..." appears after user input, transitions to tool-specific spinner on ToolCall, prints summary on ToolResult, clears on TextDelta.

#### Tests for 8d (REQUIRED — write first, verify they fail) ⚠️

- [X] T089 [P] [US1] Add integration tests for spinner lifecycle in ConversationLoop in tests/integration/spinnerLifecycle.spec.ts: verify spinner starts with "Thinking..." after user input, transitions on ToolCall events, prints tool summary on ToolResult, stops on first TextDelta, and handles multi-tool sequences correctly
- [X] T090 [P] [US1] Add unit tests for ConversationLoop spinner injection in tests/unit/loop/conversationLoop.spec.ts: verify spinner option is accepted, no-op spinner works for non-TTY, spinner.stop() is called on response complete

#### Implementation for 8d

- [X] T091 [US1] Add `spinner?: ActivitySpinner` to `ConversationLoopOptions` in src/loop/conversationLoop.ts; update `streamResponse()` to manage spinner lifecycle: `startThinking()` before send, `startToolCall()` on ToolCall event, `completeToolCall()` + `io.writeToolSummary()` on ToolResult event, `stop()` on first TextDelta event, `stop()` on response complete
- [X] T092 [US1] Wire spinner creation into src/cli/workshopCommand.ts `runWorkshop()`: create `ActivitySpinner` from IO context options and pass to `ConversationLoop` constructor; pass `debug` option through to `createLoopIO()`

**Checkpoint**: Full visual feedback lifecycle works end-to-end: users see "Thinking...", tool-specific spinners, tool summaries, and formatted markdown streaming.

---

### Phase 8 Validation

- [X] T093 Run full test suite (`npx vitest run`) and manual smoke test with a live Copilot session to verify: (1) "Thinking..." spinner appears during LLM processing, (2) tool-specific spinners appear during tool calls, (3) tool summaries display after completion, (4) LLM text streams as formatted markdown, (5) `--debug` shows verbose tool output, (6) `--json` mode suppresses all spinners and ANSI

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies – can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion – BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational phase completion.
  - User stories can then proceed in parallel (if staffed) but are ordered by priority: US1 (P1) → US2 (P2) → US3 (P3).
- **Polish (Phase 6)**: Depends on all desired user stories being complete.
- **New Capabilities (Phase 7)**: Depends on Phase 6 completion (all existing behavior stable).
  - **7a (Session Naming)**, **7b (Default Command)**, and **7c (Auto-Start)** can proceed in parallel — they touch different files.
  - Within each sub-phase: test tasks run first (must fail), then implementation tasks.
  - **T079** (validation) runs last after all Phase 7 tasks complete.
- **Visual Feedback & Streaming Markdown (Phase 8)**: Depends on Phase 7 completion.
  - **8a (Streaming Markdown)** and **8b (Activity Spinner)** can proceed in parallel — they touch different files.
  - **8c (Tool Summaries)** depends on 8b (uses ActivitySpinner types).
  - **8d (Spinner Integration)** depends on 8a, 8b, and 8c (wires everything together).
  - **T093** (validation) runs last after all Phase 8 tasks complete.

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

### Phase 7 Parallel Opportunities

Within Phase 7, the three sub-phases touch different files and can be parallelized:

```bash
# 7a tests (all [P] — different test files):
T061: tests/unit/schemas/session.spec.ts
T062: tests/unit/phases/phaseExtractors.spec.ts
T063: tests/unit/phases/phaseHandlers.spec.ts
T064: tests/unit/cli/statusCommand.spec.ts

# 7b tests:
T070: tests/integration/defaultCommand.spec.ts

# 7c tests (all [P] — different test files):
T073: tests/unit/loop/conversationLoop.spec.ts
T074: tests/unit/phases/phaseHandlers.spec.ts  (same file as T063 — cannot parallel with T063)
T075: tests/integration/autoStartConversation.spec.ts

# 7a implementation — after 7a tests fail:
T065: src/shared/schemas/session.ts           (schema change — do first)
T066: src/phases/phaseExtractors.ts           [P] (different file)
T068: src/cli/statusCommand.ts                [P] (different file)
T069: src/cli/workshopCommand.ts              (display only — SHARED with T072, T078)
T064b: tests/unit/cli/workshopCommand.spec.ts [P] (test for T069)
T067: src/phases/phaseHandlers.ts             (depends on T065, T066 — SHARED with T077)

# 7b implementation — after 7b tests fail:
T071: src/cli/index.ts                        (main restructure)
T072: src/cli/workshopCommand.ts              (depends on T071 — SHARED with T069, T078)

# 7c implementation — after 7c tests fail:
T076: src/loop/conversationLoop.ts            (core auto-start)
T077: src/phases/phaseHandlers.ts             (depends on T076 interface — SHARED with T067)
T078: src/cli/workshopCommand.ts              (depends on T076, T077 — SHARED with T069, T072)

# ⚠ Cross-sub-phase file conflicts (serialize edits to these files):
#   src/phases/phaseHandlers.ts  → T067 (7a) and T077 (7c)
#   src/cli/workshopCommand.ts   → T069 (7a), T072 (7b), and T078 (7c)
```

**Recommended serial order** (single developer):
1. 7a tests → 7a implementation → verify tests pass
2. 7b tests → 7b implementation → verify tests pass
3. 7c tests → 7c implementation → verify tests pass
4. T079 full validation

### Phase 8 Parallel Opportunities

Within Phase 8, sub-phases have the following parallelization profile:

```bash
# 8a tests (parallel — different files):
T080: tests/unit/loop/conversationLoop.spec.ts
T081: tests/unit/shared/markdownRenderer.spec.ts

# 8b tests (parallel with 8a — different file):
T084: tests/unit/shared/activitySpinner.spec.ts

# 8c tests (parallel with 8a, 8b — different file):
T086: tests/unit/cli/ioContext.spec.ts

# 8a implementation — after 8a tests fail:
T082: src/loop/conversationLoop.ts       (streaming markdown rendering)
T083: src/shared/markdownRenderer.ts     [P] (incremental chunk handling)

# 8b implementation — after 8b tests fail (parallel with 8a impl):
T085: src/shared/activitySpinner.ts      (new file — no conflicts)

# 8c implementation — after 8c tests fail:
T087: src/loop/conversationLoop.ts       (LoopIO interface — SHARED with T082)
T088: src/cli/ioContext.ts               [P] (IoContextOptions update)

# 8d tests — after 8a+8b+8c implementation:
T089: tests/integration/spinnerLifecycle.spec.ts  [P]
T090: tests/unit/loop/conversationLoop.spec.ts

# 8d implementation — after 8d tests fail:
T091: src/loop/conversationLoop.ts       (spinner integration — SHARED with T082, T087)
T092: src/cli/workshopCommand.ts         (spinner wiring)

# ⚠ Cross-sub-phase file conflicts (serialize edits):
#   src/loop/conversationLoop.ts → T082 (8a), T087 (8c), T091 (8d)
#   src/cli/ioContext.ts → T088 (8c)
#   src/cli/workshopCommand.ts → T092 (8d)
```

**Recommended serial order** (single developer):
1. 8a tests + 8b tests (parallel) → 8a implementation + 8b implementation (parallel) → verify
2. 8c tests → 8c implementation → verify
3. 8d tests → 8d implementation → verify
4. T093 full validation

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
5. Add Phase 7 new capabilities (session naming → default command → auto-start) and validate with full regression suite.
6. Add Phase 8 visual feedback and streaming markdown (activity spinners → tool summaries → streaming markdown → spinner integration) and validate with live session smoke test.

### Relation to Feature 002 (PoC Generation & Ralph Loop)

- This feature ensures that session JSON and exports contain all necessary PoC intent and plan information.
- Feature 002 will consume these artifacts to generate and iteratively refine a PoC repository using GitHub MCP and/or local scaffolding.
