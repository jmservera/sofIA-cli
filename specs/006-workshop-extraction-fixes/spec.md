# Feature Specification: Workshop Phase Extraction & Tool Wiring Fixes

**Feature Branch**: `006-workshop-extraction-fixes`  
**Created**: 2026-03-04  
**Status**: Draft  
**Upstream Dependency**: specs/001-cli-workshop-rebuild/spec.md, specs/003-mcp-transport-integration/spec.md, specs/005-ai-search-deploy/spec.md  
**Input**: User description: "Fix workshop phase extraction failures, lazy web search config, MCP tool wiring, context window management, and export completeness identified in the Zava Industries full-session assessment"

## Overview

A full end-to-end workshop session (the Zava Industries assessment — 6 phases, 48 turns, ~13 minutes) revealed five systemic bugs that prevent sofIA from extracting structured data from LLM responses and from using MCP tools during the workshop flow. The assessment scored **53%** (59/126 testable checks passed). The core conversational quality is excellent (rated 4–5/5 across phases), but the pipeline between LLM output and structured session state is broken for all phases except Discover's `businessContext`.

This feature addresses all five bugs discovered in that assessment, plus related gaps in export completeness and context management.

### Bugs Addressed

| Bug ID  | Severity | Summary                                                                                                                                                                                                                                                                                                                                                          |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-001 | High     | `isWebSearchConfigured()` checks `process.env` at function call time, but `.env` may not be loaded yet if the module was imported before `envLoader.ts` ran — making web search appear unconfigured                                                                                                                                                              |
| BUG-002 | High     | Phase extractors (`extractIdeas`, `extractEvaluation`, `extractSelection`, `extractPlan`, `extractPocState`) only find data inside JSON code blocks; the LLM often produces structured information in prose/tables/markdown without a JSON block, leaving `session.ideas`, `session.evaluation`, `session.selection`, `session.plan`, and `session.poc` all null |
| BUG-003 | Medium   | Select phase hit a 120-second SDK `sendAndWait()` timeout when prior phases accumulated ~38 turns of context — likely a context window or processing overload issue                                                                                                                                                                                              |
| BUG-004 | Medium   | Export only produces `discover.md` because the export writer requires populated structured fields (e.g., `session.ideas`) to generate phase files, and those fields are empty due to BUG-002                                                                                                                                                                     |
| BUG-005 | Medium   | MCP tools (web search, WorkIQ, Context7, Azure MCP) are not wired into the workshop flow — `workshopCommand.ts` does not create an `McpManager` or pass `webSearchClient`/MCP config to phase handlers beyond Discover                                                                                                                                           |

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Phase data is reliably extracted from LLM responses (Priority: P1)

As a facilitator completing a multi-phase workshop, I want sofIA to reliably capture structured artifacts (ideas, evaluation, selection, plan, PoC intent) from each phase's conversation, so that the session JSON contains actionable data for export, `sofia dev`, and progress tracking — regardless of whether the LLM uses JSON blocks, markdown tables, or prose.

**Why this priority**: This is the root cause of BUG-002 and BUG-004. Without reliable extraction, the entire downstream pipeline (export, dev, status) is broken. The LLM produces high-quality content, but it's lost because the extractors are too rigid.

**Independent Test**: Run a workshop session through all phases with real LLM output, then verify that `session.ideas`, `session.evaluation`, `session.selection`, `session.plan`, and `session.poc` are all populated in the session JSON. Alternatively, feed recorded LLM outputs from the Zava assessment into the extractors and verify structured data is produced.

**Acceptance Scenarios**:

1. **Given** the Ideate phase produces ideas in markdown format (titles, descriptions, bullet points) without a JSON code block, **When** the phase completes, **Then** `session.ideas` contains at least 3 extracted `IdeaCard` entries with title and description populated.
2. **Given** the Design phase produces a feasibility-value scoring table in markdown, **When** the phase completes, **Then** `session.evaluation` contains scored ideas matching the LLM's output.
3. **Given** the Select phase produces a recommendation with rationale in prose, **When** the user confirms the selection, **Then** `session.selection` contains the selected idea ID, rationale, and `confirmedByUser: true`.
4. **Given** the Plan phase produces milestones in a numbered list or markdown structure, **When** the phase completes, **Then** `session.plan` contains milestone entries with titles and descriptions.
5. **Given** the Develop boundary phase captures PoC intent in prose, **When** the phase completes, **Then** `session.poc` contains target stack, key scenarios, and constraints.
6. **Given** the LLM response includes a valid JSON code block (current behavior), **When** the extractor runs, **Then** the JSON block extraction still works (backward compatibility preserved).

---

### User Story 2 — Web search is available when `.env` is loaded (Priority: P1)

As a facilitator starting a workshop session, I want sofIA's web search to work when my `.env` file contains the correct Foundry credentials, regardless of module import ordering, so that the Discover phase can search the web for my company and industry context.

**Why this priority**: BUG-001 means web search silently fails in any execution path where `envLoader.ts` hasn't run before `webSearch.ts` is first evaluated. This affects both the CLI and programmatic test paths.

**Independent Test**: Set `FOUNDRY_PROJECT_ENDPOINT` and `FOUNDRY_MODEL_DEPLOYMENT_NAME` in `.env` only (not in shell env), start sofIA, and verify `isWebSearchConfigured()` returns true and the Discover phase offers web search.

**Acceptance Scenarios**:

1. **Given** `.env` contains valid Foundry credentials and `process.env` does not have them pre-set, **When** the CLI starts and calls `isWebSearchConfigured()`, **Then** it returns `true`.
2. **Given** `.env` is absent and Foundry env vars are not set, **When** the CLI starts and calls `isWebSearchConfigured()`, **Then** it returns `false` (no error, no crash).
3. **Given** Foundry env vars are set in the shell environment (not in `.env`), **When** the CLI starts, **Then** `isWebSearchConfigured()` returns `true` regardless of `.env` loading order.

---

### User Story 3 — Workshop phases use MCP tools for enrichment (Priority: P2)

As a facilitator running a workshop, I want sofIA to use web search during Discover, and Context7/Azure MCP during Design and Plan, so that the workshop output is grounded in real-world data and current documentation rather than relying solely on the LLM's training data.

**Why this priority**: BUG-005 prevents all MCP-driven enrichment in the workshop flow. While the workshop works without tools (graceful degradation is solid), the quality gap is significant — enriched sessions produce more relevant ideas and better-grounded architecture recommendations.

**Independent Test**: Run a workshop session with MCP servers configured, verify that: (a) Discover phase calls `web.search` and stores results, (b) Design phase queries Context7 for library docs when ideas reference specific technologies, (c) Plan phase queries Azure MCP when the plan references Azure services.

**Acceptance Scenarios**:

1. **Given** web search is configured and the Discover phase has collected business context, **When** the enrichment hook runs, **Then** web search is called with company and industry queries and results are stored in `session.discovery.enrichment`.
2. **Given** Context7 is available and the Design phase discusses ideas referencing npm packages, **When** the Design phase handler retrieves references, **Then** Context7 is queried for relevant library documentation.
3. **Given** Azure MCP is available and the Plan phase references Azure services (e.g., Azure Functions, Cosmos DB), **When** the Plan phase handler builds the system prompt or post-processes, **Then** Azure architecture guidance is fetched and included in the LLM's context.
4. **Given** all MCP tools are unavailable, **When** the workshop runs, **Then** every phase still completes successfully (existing graceful degradation preserved).

---

### User Story 4 — Long sessions don't cause timeouts (Priority: P2)

As a facilitator completing a multi-phase workshop with rich conversations, I want sofIA to manage its context window so that later phases (Select, Plan, Develop) don't time out due to accumulated conversation history from earlier phases.

**Why this priority**: BUG-003 caused the Select phase to time out completely, losing all user progress for that phase. In a real workshop, this would be frustrating and would undermine trust in the tool.

**Independent Test**: Run a 6-phase workshop session with at least 10 turns per phase. Verify that the Select and Plan phases complete successfully without SDK timeouts, and that prior phase context is available to the LLM in summarized form.

**Acceptance Scenarios**:

1. **Given** a session with 30+ turns across Discover, Ideate, and Design phases, **When** the Select phase starts, **Then** it completes within 120 seconds without a timeout error.
2. **Given** a session starting a new phase after multiple completed phases, **When** the ConversationLoop builds the context, **Then** prior phase turns are summarized (not included verbatim) in the system prompt to reduce context size.
3. **Given** the summarized context from prior phases, **When** the LLM generates phase output, **Then** it can reference key decisions from earlier phases (business context, selected ideas) accurately despite summarization.

---

### User Story 5 — Export includes all phases with conversation fallback (Priority: P2)

As a facilitator exporting workshop results, I want `sofia export` to produce markdown files for every phase that had conversations — even if structured artifacts weren't extracted — so that the full workshop output is preserved for review.

**Why this priority**: BUG-004 means that only the Discover phase (which has `businessContext` populated) generates an export file. The other 5 phases' conversations are lost from the export despite containing rich, useful content. A workshop facilitator needs all phases represented.

**Independent Test**: Run `sofia export` on a session that completed all phases but has null structured fields for Ideate through Develop. Verify that export files are generated for all phases using conversation turn fallback.

**Acceptance Scenarios**:

1. **Given** a session with Ideate conversation turns but no extracted `session.ideas`, **When** `sofia export` runs, **Then** an `ideate.md` file is generated containing the conversation turns for the Ideate phase.
2. **Given** a session with all 6 phases completed and conversation data, **When** `sofia export` runs, **Then** the export directory contains `discover.md`, `ideate.md`, `design.md`, `select.md`, `plan.md`, and `develop.md`.
3. **Given** a session with both structured data and conversation turns for a phase, **When** `sofia export` runs, **Then** the structured data is rendered first, followed by the conversation.
4. **Given** `summary.json`, **When** generated, **Then** it lists all exported phase files and includes highlights from every populated phase.

---

### Edge Cases

- What if the LLM produces a JSON block that partially matches the schema (e.g., missing one required field)? The summarization call should still produce a valid extraction; the original partial JSON should be logged for debugging.
- What if the summarization LLM call itself fails? Fall back to the current extraction behavior (JSON block parsing) and log a warning. The phase should not be blocked by a failed summarization attempt.
- What if context summarization loses critical details (e.g., a specific technology choice from the Plan)? The system should preserve key fields (business context, selected idea, plan milestones) verbatim, and only summarize conversation turns.
- What if the user's session has 0 turns for a phase (e.g., the Select timeout scenario)? The export phase file should still be generated with a note that the phase had no conversation content.
- What if multiple JSON blocks exist in a single LLM response? The extractor should try all blocks against the expected schema, not just the first one.
- What if the LLM drifts into the next phase's content before the decision gate? The system prompt should enforce phase boundaries explicitly.
- What if the Select phase still times out even after context summarization? The system should have a secondary fallback (minimal-context retry or user-directed selection).
- What if the Zava assessment live test provides more or fewer inputs than the LLM expects? The test harness should detect input exhaustion and signal completion gracefully rather than silently consuming inputs across phase boundaries. (Test infrastructure concern — not a production code issue.)

## Requirements _(mandatory)_

### Functional Requirements

#### Phase Extraction Hardening (BUG-002)

- **FR-001**: At the end of each phase (when the conversation loop exits), the system MUST make a dedicated "summarization" LLM call that asks the model to output the phase's structured data as a JSON code block, using the full conversation from that phase as context.
- **FR-002**: The summarization call MUST use a phase-specific prompt that instructs the LLM to extract the exact JSON shape expected by the schema (e.g., `IdeaCard[]`, `IdeaEvaluation`, `SelectedIdea`, `ImplementationPlan`, `PocDevelopmentState`).
- **FR-003**: The existing `extractJsonBlock()` → schema parsing pipeline MUST be preserved as the primary extraction path during the conversation. The summarization call is an additional fallback that runs once at phase end.
- **FR-004**: If the summarization call produces valid structured data and the session field is still null (i.e., per-turn extraction didn't capture it), the system MUST populate the session field from the summarization result.
- **FR-005**: If the summarization call fails or returns invalid data, the system MUST log a warning and continue without blocking the phase transition. Existing per-turn extraction results (if any) MUST be preserved.
- **FR-006**: The summarization call MUST be implemented as a method on `ConversationLoop` (or a utility invoked by it) so that all phases benefit without duplicating logic per handler.
- **FR-007**: The existing `extractJsonBlock()` function MUST be enhanced to try multiple JSON blocks in a response (not just the first match) and return the first one that validates against the expected schema.
- **FR-007a**: The Design phase summarization prompt (FR-002) MUST also request a Mermaid architecture diagram alongside the structured evaluation JSON, fulfilling spec 001 FR-030. The diagram MUST be stored in the session (as part of `evaluation` or a dedicated field) for export.

#### Phase Boundary Enforcement

- **FR-007b**: The system prompt for each phase MUST include an explicit instruction prohibiting the LLM from introducing or transitioning to the next phase. The instruction MUST state: "You are in the [Phase] phase. Do NOT introduce or begin the next phase. The user will be offered a decision gate when this phase is complete."
- **FR-007c**: The `ConversationLoop` (or phase handler `buildSystemPrompt`) MUST inject the phase-boundary instruction automatically for all phases, without requiring per-handler duplication.

#### Lazy Web Search Configuration (BUG-001)

- **FR-008**: `isWebSearchConfigured()` MUST evaluate `process.env` at call time (lazy), not at module load time. The function MUST NOT cache or memoize the result of the environment variable check.
- **FR-009**: All callers of `isWebSearchConfigured()` MUST continue to call it as a function. No API signature changes required.
- **FR-010**: The CLI startup sequence MUST ensure `loadEnvFile()` runs before any code path checks `isWebSearchConfigured()`. This ordering MUST be enforced by calling `loadEnvFile()` at the top of the `workshopCommand()` and `developCommand()` entry points.

#### MCP Tool Wiring in Workshop Flow (BUG-005)

- **FR-011**: `workshopCommand.ts` MUST create an `McpManager` instance at startup (if MCP configuration exists in `.vscode/mcp.json` or equivalent).
- **FR-012**: `workshopCommand.ts` MUST create a `WebSearchClient` from the configured Foundry agent credentials (if web search is configured) and pass it to the Discover phase handler via `DiscoverHandlerConfig`.
- **FR-012a**: `workshopCommand.ts` MUST pass the `McpManager` to the Discover phase handler so that it can check WorkIQ availability. When WorkIQ is available, the Discover handler MUST prompt the user for explicit consent before querying WorkIQ (per spec 001 FR-020 and spec 003 US4). WorkIQ insights MUST be stored in `session.discovery.enrichment.workiqInsights`.
- **FR-013**: The Design phase handler MUST accept optional MCP configuration and use Context7 to fetch library documentation for technologies referenced in the ideas, when available.
- **FR-014**: The Plan phase handler MUST accept optional MCP configuration and use Azure MCP / Microsoft Learn to fetch architecture guidance for Azure services referenced in the plan, when available.
- **FR-015**: All MCP tool calls from workshop phase handlers MUST degrade gracefully — if a tool is unavailable or errors, the phase continues with LLM-only output.

#### Context Window Management (BUG-003)

- **FR-016**: When starting a new phase, the `ConversationLoop` MUST NOT include raw conversation turns from previous phases in the system prompt. Instead, it MUST include a summarized context block.
- **FR-017**: The summarized context MUST preserve: business context, topic, key decisions, selected idea (if applicable), plan milestones (if applicable), discovery enrichment data (web search results, WorkIQ insights — if populated), and any other structured session fields already extracted.
- **FR-018**: Only conversation turns from the current phase MUST be included in the session history injection (for resume scenarios). Turns from prior phases MUST be summarized.
- **FR-019**: The system SHOULD use the SDK's `infiniteSessions` configuration for long-running sessions as an additional protection against context exhaustion.
- **FR-019a**: If a phase times out even after context summarization (FR-016–FR-018), the system MUST retry once with a minimal context payload containing only the structured session fields (no conversation turns at all). If the retry also fails, the system MUST fall back to asking the user to manually confirm or provide the expected output (e.g., for Select: present the top-ranked idea from Design and ask the user to confirm).

#### Export Completeness (BUG-004)

- **FR-020**: The export writer MUST generate a phase markdown file for any phase that has conversation turns in the session, even if the structured session field for that phase is null.
- **FR-021**: When generating a phase file without structured data, the export writer MUST include the conversation turns formatted as a readable transcript.
- **FR-022**: When generating a phase file with both structured data and conversation turns, the export writer MUST include the structured data first, then the conversation as a "Conversation" section.
- **FR-023**: `summary.json` MUST list all generated phase files, not just those with structured data.
- **FR-024**: `summary.json` highlights MUST include at least one highlight per phase that had conversation turns, derived from the conversation content or structured data.

### Key Entities

- **PhaseSummarizationRequest**: A structured request to the LLM at phase end, containing the full conversation transcript for the phase and a phase-specific extraction prompt. Produces the expected schema (e.g., `IdeaCard[]`, `ImplementationPlan`).
- **SummarizedPhaseContext**: A compact representation of a completed phase's key outputs, used to inject prior-phase context into subsequent phases without including raw turns.
- **McpWorkshopConfig**: Configuration object passed from `workshopCommand.ts` to phase handler factories, containing optional `McpManager` and `WebSearchClient` references for tool-based enrichment.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A full 6-phase workshop session produces non-null values for at least `session.businessContext`, `session.ideas`, `session.selection`, and `session.plan` in 90%+ of properly configured runs.
- **SC-002**: The `sofia export` command generates markdown files for all 6 phases (Discover through Develop) when the session has conversation data for all phases, regardless of structured data availability.
- **SC-003**: `isWebSearchConfigured()` returns the correct value when `.env` is the sole source of Foundry credentials, verified by a unit test that sets env vars after module import.
- **SC-004**: A workshop session with 40+ turns across 4+ phases completes the Select and Plan phases without SDK timeout errors.
- **SC-005**: When web search and at least one MCP server (Context7 or Azure) are configured, the workshop session uses those tools during the appropriate phases and stores the results in the session.
- **SC-006**: The Zava Industries assessment test (or equivalent) scores at least 75% on testable checks (up from 53%) after these fixes are applied.

## Assumptions

- The Copilot SDK's `sendAndWait()` method can handle a 2-turn summarization call (system prompt + phase transcript) within the existing 120-second timeout.
- The LLM is capable of producing valid JSON that matches the session schema when given explicit instructions and the full conversation transcript — this has been verified in the Discover phase where `businessContext` extraction already works.
- The existing test suite (709 unit + 99 integration tests) continues to pass after these changes, as the fixes are backward-compatible with existing behavior.
- MCP server configurations in `.vscode/mcp.json` are readable by `McpManager` — this was already implemented in Feature 003.
- The `infiniteSessions` SDK feature (documented in `copilotClient.ts`) is stable enough for production use.

## Dependencies

- **Feature 001**: Session schema, ConversationLoop, phase handlers, export writer
- **Feature 003**: McpManager, MCP transport layer, DiscoveryEnricher, web search client
- **Feature 005**: Foundry deployment, `.env` output, `isWebSearchConfigured()`

## Out of Scope

- **Prose-based extraction without summarization call**: Building NLP-based extractors that parse markdown tables and prose directly is complex and fragile. The summarization call approach is simpler and leverages the LLM's own ability to restructure its output.
- **Automatic retry for the Select timeout**: While BUG-003 caused a timeout, the root fix is context management (FR-016), not retry logic. The existing retry infrastructure (FR-050 from spec 001) handles transient failures.
- **Multi-language template support for PoC generation**: Template changes belong in Feature 004.
- **PTY-based E2E test automation**: The Zava assessment test is a programmatic live test. Full PTY-based interactive testing is deferred to Feature 004.
