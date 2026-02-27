# Feature Specification: sofIA Unified Build-From-Scratch CLI

**Feature Branch**: `001-cli-workshop-rebuild`  
**Created**: 2026-02-26  
**Status**: Draft  
**Input**: Unified build-from-scratch specification (workshop orchestration + PoC intent capture; PoC generation in feature `002-poc-generation`)

## Clarifications

### Session 2026-02-26

- Q: Where should sessions be persisted by default? → A: Inside the repo/workspace (repo-local state).
- Q: What persistence format should the repo-local session store use by default? → A: Single JSON file per session.
- Q: If GitHub MCP is unavailable during Develop, what should happen in interactive mode? → A: The PoC generation feature (002-poc-generation) MUST fall back to local scaffolding that creates a PoC repository structure in the workspace and clearly marks the output as locally generated; this feature (001) is responsible for capturing PoC intent and surfacing status.
- Q: What is the default Export output format/location? → A: Write a folder to `./exports/<sessionId>/` containing Markdown artifacts + a `summary.json`.
- Q: When should the session be persisted? → A: After every user input (each turn).

### Session 2026-02-27

- Q: How should the session name be populated? → A: LLM auto-generates a short name after the first Discover exchange based on the business context, without requiring user confirmation.
- Q: How should the CLI behave when invoked with no subcommand? → A: Running `sofia` with no args starts the workshop flow (main menu: New/Resume/Status/Export). Workshop options (`--new-session`, `--phase`, `--retry`) promoted to top level. `sofia workshop` kept as alias. `status` and `export` remain explicit subcommands. `--help` shows all options at the top level.
- Q: What should the auto-start greeting include when starting a new session? → A: LLM briefly introduces the current phase purpose and immediately asks the first question (concise, action-oriented). On resume, provides a summary of progress so far and asks the next question.
- Q: What is the acceptable timeout for the initial auto-start LLM greeting? → A: 10 seconds. If no first token arrives within 10s, treat as a transient failure and apply retry logic.
- Q: How should the session name be extracted from the LLM response? → A: LLM includes `sessionName` in the structured JSON block (same extraction path as businessContext). Deterministic, testable, consistent with existing extractors.
- Q: How should streaming LLM markdown be rendered? → A: Render markdown incrementally during streaming using marked + marked-terminal, accepting minor rendering artifacts on partial chunks (headings, tables).
- Q: What visual feedback should users see during internal operations (LLM wait, tool calls)? → A: Spinner with contextual status text that updates in-place per operation (e.g., "⠋ Calling WorkIQ...", "⠋ Searching docs...") and clears when the operation completes.
- Q: What should users see about tool call results? → A: By default, a one-line summary after each tool completes (tool name + brief result, e.g., "✓ WorkIQ: Found 12 relevant processes"). With `--debug`, also show full tool arguments and result details inline.
- Q: Should the user see a "thinking" indicator during silent gaps? → A: Yes. Show a "Thinking..." spinner during all silent gaps: after user input before first token, and after tool results before next text output.
- Q: Should `--verbose` be a new flag or reuse `--debug`? → A: Reuse `--debug`. When `--debug` is set, also show verbose tool output inline (tool arguments and full result details). No new `--verbose` flag.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run a new governed workshop session (Priority: P1)

As a facilitator, I want to start a new session and complete the full workshop flow end-to-end with explicit decision gates, so that I can produce customer-ready artifacts and a PoC repository without losing progress.

**Why this priority**: This is the primary product outcome (end-to-end workshop completion).

**Independent Test**: Can be tested by running the CLI in a deterministic harness that simulates a full interactive session and verifies that each phase produces artifacts and requires an explicit decision before continuing.

**Acceptance Scenarios**:

1. **Given** a clean environment with required integrations available, **When** the user selects New Session and completes each phase, **Then** the CLI produces phase artifacts and requires an explicit post-phase decision each time.
2. **Given** the user completes a phase, **When** the user chooses Exit at the decision gate, **Then** the session is persisted and can be resumed later without data loss.

---

### User Story 2 - Resume, backtrack, and export a session (Priority: P2)

As a facilitator, I want to resume a prior session, step back to earlier phases, and export artifacts, so that I can recover from interruptions and iterate safely.

**Why this priority**: Resilience and recoverability are non-negotiable for real workshops.

**Independent Test**: Can be tested by creating a session, persisting it mid-way, resuming, backtracking to an earlier phase, and verifying deterministic invalidation/regeneration of downstream artifacts.

**Acceptance Scenarios**:

1. **Given** a persisted session, **When** the user selects Resume Session from the main menu, **Then** the CLI continues from the last committed state.
2. **Given** completed downstream phases exist, **When** the user backtracks to an earlier phase and confirms regeneration, **Then** downstream artifacts are invalidated and re-derived without corrupting the session.
3. **Given** a session with artifacts, **When** the user selects Export, **Then** the CLI produces a customer-ready artifact bundle for the workshop outputs.

---

### User Story 3 - Continue a session via direct command mode (Priority: P3)

As an operator or automation pipeline, I want to continue a session non-interactively where possible, so that the system can be scripted while remaining safe in non-TTY environments.

**Why this priority**: Supports automation and operational use; also forces clean separation of interactive vs machine-readable output.

**Independent Test**: Can be tested by running the CLI with a session id in a non-TTY harness and verifying non-zero exits and machine-readable JSON output behavior.

**Acceptance Scenarios**:

1. **Given** a valid session id, **When** the CLI is invoked with that session id in a TTY, **Then** it prompts for missing inputs interactively.
2. **Given** required inputs are missing, **When** invoked in non-TTY mode, **Then** it fails fast with an actionable error and non-zero exit code.
3. **Given** JSON/machine-readable mode is enabled, **When** running in any environment, **Then** stdout remains JSON-only and human telemetry is not mixed into stdout.

---

### Edge Cases

- WorkIQ is unavailable or not configured.
- Web research is blocked/unavailable.
- One or more MCP tools are unavailable, rate-limited, or return timeouts.
- Ctrl+C occurs during: streaming output, tool execution, user input prompt, or at the decision gate.
- Session persistence store is read-only, missing, or corrupted.
- Phase completes but user input indicates “done”, empty input, or Ctrl+D.
- Recoverable errors should route to a recovery decision flow instead of abrupt termination.
- Interactive output must never show raw SDK JSON events.

## Requirements *(mandatory)*

### Functional Requirements

**Scope & Outcomes**

- **FR-001**: System MUST support a full end-to-end workshop flow for Discover → Ideate → Design → Select → Plan, and MUST capture PoC requirements for a subsequent Develop feature.
- **FR-002**: System MUST produce customer-ready workshop artifacts as primary outputs, and MUST record sufficient PoC intent/requirements for an external PoC generator.
- **FR-003**: System MUST be resilient and recoverable: failures must not require restarting the app or losing session state.

**User Modes & CLI UX**

- **FR-004**: System MUST provide interactive mode with a main menu containing: New Session, Resume Session, Status, Export. Running `sofia` with no subcommand MUST start the workshop flow (default command). Workshop-specific options (`--new-session`, `--phase`, `--retry`) MUST be available at the top level. `sofia workshop` MUST be kept as an alias. `--help` MUST show all workshop options at the top level.
- **FR-005**: System MUST provide direct command mode that continues a session by id.
- **FR-006**: In direct command mode with TTY available, system MUST prompt for missing required inputs.
- **FR-007**: In direct command mode without TTY, system MUST fail fast with a non-zero exit and an actionable error when required inputs are missing.
- **FR-008**: System MUST support explicit completion inputs: `done`, empty input, and Ctrl+D.

**Conversation Model (Authoritative)**

- **FR-009**: System MUST stream responses incrementally (no full-buffer blocking output).
- **FR-009a**: In TTY mode, streamed LLM text MUST be rendered as formatted markdown incrementally (using `marked` + `marked-terminal`) rather than written as raw text. Minor rendering artifacts from partial markdown chunks are acceptable for responsiveness. In non-TTY/JSON mode, raw markdown is preserved without ANSI rendering.
- **FR-010**: System MUST preserve turn history for each phase and persist turns in session state.
- **FR-011**: System MUST support multi-turn conversations per phase.
- **FR-012**: System MUST support agent-driven prompts to the user (ask-user style prompts) via the SDK handler.
- **FR-013**: System MUST extract and render human-readable content from SDK events; raw event JSON MUST NOT be rendered to users.
- **FR-014**: System MUST gracefully handle Ctrl+C in all execution states.
- **FR-015**: System MUST implement a single conversation orchestration abstraction (ConversationLoop or equivalent) and MUST NOT introduce duplicate inline multi-turn loops.
- **FR-015a**: When a conversation phase starts (new or resumed), the ConversationLoop MUST send an initial auto-start message to the LLM before waiting for user input. For new sessions, the LLM MUST briefly introduce the current phase purpose and ask the first question. For resumed sessions, the LLM MUST summarize progress so far and ask the next question. The user MUST NOT be required to speak first. If no first token arrives within 10 seconds, the system MUST treat this as a transient failure and apply retry logic.

**Governed Progression & Decision Gates**

- **FR-016**: After each successful phase in interactive mode, system MUST show a phase summary and require an explicit decision.
- **FR-017**: Interactive post-phase decisions MUST include: continue to next phase, refine current phase, choose another phase, return to main menu, exit.
- **FR-018**: System MUST NOT auto-advance phases in interactive mode.

**Discover Phase**

- **FR-019**: Discover MUST collect business context conversationally.
- **FR-020**: Discover MUST use WorkIQ when available to enrich and validate business context.
- **FR-021**: Discover MUST use web research to better understand the company and context when possible.
- **FR-022**: Discover MUST degrade gracefully to conversational + web research when WorkIQ is unavailable.
- **FR-023**: Discover MUST enter interview mode when `businessContext` is empty.
- **FR-023a**: After the first Discover exchange that yields a `businessContext`, the system MUST auto-generate a short session `name` from the LLM response and persist it without requiring user confirmation. The LLM system prompt MUST instruct the model to include a `sessionName` field in the structured JSON output alongside `businessContext`. The extractor MUST parse it from the same JSON block.

**Ideate Phase**

- **FR-024**: Ideate MUST use the AI Discovery Cards dataset to support ideation.
- **FR-025**: Ideate MUST map cards to the customer journey/workflow.
- **FR-026**: Ideate MUST produce a ranked list of candidate ideas.
- **FR-027**: Ideate MUST ask clarifying questions when context quality is insufficient.
- **FR-028**: Cards selection MUST be presented to the user.

**Design Phase**

- **FR-029**: Design MUST generate Idea Cards for top ideas including: problem/solution framing, data requirements, architecture sketch, and Azure/Microsoft mapping.
- **FR-030**: Architecture sketch output MUST be represented as a Mermaid diagram.
- **FR-031**: Design MUST ground feasibility and recommendations via documentation retrieval tools (Context7 + Microsoft Learn) when available.

**Select Phase**

- **FR-032**: Select MUST evaluate ideas using the BXT Framework (Business, eXperience, Technical).
- **FR-033**: Select MUST assign scores, rationale, and a classification to each evaluated idea.
- **FR-034**: Select MUST recommend one primary idea with audit-ready justification.

**Plan Phase**

- **FR-035**: Plan MUST produce an implementation roadmap including milestones, dependencies, risks, success metrics, and a high-level timeline.

**Develop Phase (boundary in this feature)**

- **FR-036**: This feature MUST capture PoC-related requirements and intent (e.g., target stack, key scenarios, constraints) into session state, suitable for consumption by a separate PoC generation feature.
- **FR-036a**: Detailed behavior for generating a PoC repository (GitHub MCP vs local scaffolding), repo layout, and Ralph loop refinement is out of scope for this feature and is defined in feature 002-poc-generation.
- **FR-037**: This feature MUST expose enough structured data in the poc-related fields of the session model for downstream tools (including feature 002) to generate a PoC repository and report status back.
- **FR-038**: This feature MUST record user-visible summaries of any PoC discussions/decisions so that Develop-phase implementation details in feature 002 can be audited against the captured intent.

**Session, Persistence, Backtracking**

- **FR-039**: System MUST persist complete workshop state (phase artifacts + turn history) as a single JSON file per session in a repo-local state directory (default: `./.sofia/sessions/<sessionId>.json`).
- **FR-039a**: System MUST persist the session after every user input/turn (including empty input / explicit completion signals), without advancing phases on a failed persistence write.
- **FR-040**: System MUST resume from the last committed state safely.
- **FR-041**: System MUST support stepping back to an earlier phase and MUST invalidate downstream artifacts deterministically.
- **FR-042**: Failed phases MUST NOT corrupt or advance session state.

**Telemetry, Logs, and Output Separation**

- **FR-043**: System MUST show operational telemetry (tool/progress) in a dedicated activity stream during interactive execution.
- **FR-043a**: In TTY interactive mode, system MUST display a spinner (using `ora` or equivalent) with contextual status text during waiting periods: waiting for LLM first token, executing MCP tool calls, and processing internal operations. The spinner text MUST update in-place to reflect the current operation (e.g., "⠋ Calling WorkIQ...", "⠋ Searching documentation..."). The spinner MUST clear when the operation completes and output resumes. Spinners MUST NOT appear in non-TTY or JSON mode.
- **FR-043b**: After each tool call completes, system MUST display a one-line summary showing the tool name and a brief result description (e.g., "✓ WorkIQ: Found 12 relevant processes", "✓ Web search: 3 results for 'Contoso logistics'"). These summaries MUST remain visible in the output stream. When `--debug` is specified, system MUST additionally show the tool arguments and full result details (multi-line) inline. In non-TTY/JSON mode, tool summaries MUST be omitted from stdout (written to stderr or debug log only).
- **FR-043c**: In TTY interactive mode, system MUST display a "Thinking..." spinner during all silent gaps where the LLM is processing but no text or tool events are being emitted. This includes: (1) after user input is submitted and before the first text token arrives, (2) after tool results are returned and before the next text output begins, and (3) during any internal reasoning delay. The "Thinking..." spinner MUST be replaced by the tool-specific spinner (FR-043a) when a tool call begins, and MUST clear when text streaming starts. In non-TTY/JSON mode, no thinking indicator is shown.
- **FR-044**: In JSON/non-interactive scenarios, system MUST keep stdout machine-readable and MUST NOT interleave telemetry into stdout.
- **FR-045**: System MUST persist a detailed debug log to a separate file by default, and MUST allow disabling logs via parameter.

**Export**

- **FR-045a**: System MUST support exporting workshop artifacts from a session.
- **FR-045b**: Default export output MUST be a repo-local folder at `./exports/<sessionId>/`.
- **FR-045c**: Export output MUST include customer-readable Markdown artifacts for each phase and a machine-readable `summary.json` that references the exported files.

**Error Handling & Recovery**

- **FR-046**: System MUST preserve original underlying error messages end-to-end.
- **FR-047**: System MUST classify errors centrally (auth, connection, MCP, timeout, unknown) and include actionable suggestions.
- **FR-048**: Interactive failures MUST return the user to a recovery decision flow.
- **FR-049**: Non-interactive failures MUST exit non-zero with a clear message.
- **FR-050**: System MUST support a retry flag for direct commands (e.g., `--retry <N>`), applied to transient failures.
- **FR-051**: System MUST perform pre-flight checks for Copilot connectivity and phase-critical MCP readiness.

**MCP & External Dependencies**

- **FR-052**: System MUST use Copilot SDK as the primary orchestration runtime.
- **FR-053**: System MUST integrate with: WorkIQ (Discover), Context7 (Design), Microsoft Learn (Design/Plan), GitHub MCP (Develop).
- **FR-054**: System MUST prefer MCP-first calls when a tool exists and MUST justify each tool call by phase purpose.
- **FR-055**: System MUST respect least-privilege and tenant boundaries.
- **FR-056**: System MUST degrade gracefully when tools are unavailable.

**Warnings & Anti-Patterns (Prohibited Behaviors)**

- **FR-057**: System MUST NOT implement behavior before writing failing tests for that behavior.
- **FR-058**: System MUST NOT render raw SDK response JSON to end users.
- **FR-059**: System MUST NOT silently swallow actionable errors with generic messages.
- **FR-060**: System MUST NOT perform implicit phase transitions in interactive mode.
- **FR-061**: System MUST NOT run multiple competing follow-up loops in the same execution path.
- **FR-062**: System MUST NOT mix activity telemetry into JSON stdout payloads.

### Key Entities *(include if feature involves data)*

- **WorkshopSession**: id, name (auto-generated after first Discover exchange), currentPhase, completedPhases, businessContext, journeyMap, ideas, bxtEvaluations, selectedIdeaId, plan, poc (PocDevelopmentState), turns, timestamps.
- **ConversationTurn**: phase, sequence, role, content, timestamp, metadata.
- **IdeaCard**: title, summary, mappedJourneySteps, dataRequirements, architecture, services, risks.
- **BxtEvaluation**: businessScore, experienceScore, technicalScore, rationale, classification.
- **PocDevelopmentState**: repoPath, iterations, finalStatus (detailed behavior defined in feature `002-poc-generation`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete a guided workshop from Discover through Plan with explicit decision control after each phase, and PoC intent is captured for a subsequent Develop feature.
- **SC-002**: Interactive failures recover to a user decision flow without requiring restarting the application.
- **SC-003**: No raw SDK JSON appears in normal user output across interactive and JSON modes.
- **SC-004**: The system persists session state such that a session can be resumed after exit without losing phase artifacts or turn history.
- **SC-005**: First visible token for streamed phase output appears within 3 seconds in a properly configured environment.
- **SC-006**: PoC-related requirements (intent, target stack, key scenarios, constraints) are successfully captured in a high percentage of properly configured runs (target threshold defined in planning); concrete PoC repository generation success is measured in feature `002-poc-generation`.
- **SC-007**: The interactive harness validates at least one happy-path run and one failure/recovery run and catches regressions prior to release.

## Open Validation Items

- Confirm specific Copilot SDK streaming and multi-turn APIs used in runtime implementation.
- Confirm the ask-user path (SDK-native handler vs custom wrapper) in final architecture docs.
- Confirm MCP availability matrix per environment and defined fallback behavior.
