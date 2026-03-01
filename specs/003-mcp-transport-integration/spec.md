# Feature Specification: MCP Transport Integration

**Feature Branch**: `003-mcp-transport-integration`  
**Created**: 2026-03-01  
**Status**: Draft  
**Upstream Dependency**: specs/002-poc-generation/spec.md (Ralph Loop, GitHub adapter, context enricher)  
**Input**: User description: "Implement real MCP tool invocation layer connecting McpManager to actual MCP server transports, enabling GitHub repository creation, Context7 documentation lookup, Azure architecture guidance, and web search capabilities to function in production"

## Overview

Feature 002 built the Ralph Loop iteration engine and all its MCP-powered components — GitHub adapter, Context7 enricher, Azure enricher, web search enricher — but every MCP tool call is currently a stub that either returns fake data or throws "not yet wired to transport." This feature implements the actual MCP transport layer so that `McpManager.callTool()` dispatches real requests to configured MCP servers.

Additionally, this feature wires the discovery phase to use web search and WorkIQ MCP tools for gathering company and industry context, and researches how the GitHub Copilot SDK structures agent definitions and MCP tool routing to ensure architectural alignment.

**Gaps addressed**: GAP-001, GAP-002, GAP-003, GAP-004, GAP-005, GAP-006 (P1), GAP-007 (P1) from `specs/003-next-spec-gaps.md`.  
**Gaps deferred**: GAP-006 (P2, resume/checkpoint), GAP-007 (P2, `--force`), GAP-008 (P2, testRunner coverage), GAP-009 (P2, template selection) — see Out of Scope.

## Clarifications

### Session 2026-03-01

- Q: Should P2 gaps (resume/checkpoint, --force, testRunner coverage, template selection) be included in this feature spec or deferred? → A: Explicitly defer all P2 gaps to a separate feature spec; add Out of Scope section.
- Q: How should MCP authentication work across transport types (stdio env, HTTP SDK, WorkIQ OAuth)? → A: Defer auth design to implementation research (FR-019); determine correct pattern per transport during SDK research phase.
- Q: Should failed MCP tool calls be retried automatically? → A: One automatic retry with backoff for transient errors (connection refused, timeout); no retry for auth/validation errors.
- Q: What is the schema shape of DiscoveryEnrichment? → A: Flat structure with optional string arrays and nested WorkIQ insights object.
- Q: What if the Copilot SDK doesn't provide MCP integration or agent registration patterns? → A: Research SDK first; use built-in MCP support where available; build custom transport only where SDK lacks coverage; modify existing code to align with SDK patterns.

## Out of Scope

The following items from `specs/003-next-spec-gaps.md` are explicitly deferred to a subsequent feature spec to limit scope risk:

- **Resume/checkpoint for `sofia dev`** (P2 GAP-006) — Detect existing PoC directory and resume from last iteration instead of re-scaffolding. _Note: SDK provides native `resumeSession(sessionId)` with state stored at `~/.copilot/session-state/` — implementation complexity is lower than originally assessed (see research.md Topic 9)._
- **`--force` flag implementation** (P2 GAP-007) — Honor the declared `--force` CLI option to delete existing output and restart.
- **testRunner.ts coverage hardening** (P2 GAP-008) — Add spawn-based integration tests for child process spawning, timeout, and SIGTERM/SIGKILL paths.
- **PoC template selection** (P2 GAP-009) — Define a template registry mapping plan characteristics to scaffold templates (e.g., Python/FastAPI).
- **Generated scaffold TODOs** (P3 GAP-009) — Tracking intentional TODO markers in generated code for template quality.
- **PTY-based E2E tests** (P3 GAP-010) — Interactive terminal tests for `sofia dev` Ctrl+C handling and spinner output.
- **Workshop→develop phase transition** (P3 GAP-011) — Whether `workshop` should auto-invoke the Ralph loop after Plan completion.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — MCP Tool Calls Work in Production (Priority: P1)

As a facilitator running `sofia dev`, I want the Ralph Loop to create a real GitHub repository, query Context7 for library documentation, fetch Azure architecture guidance, and perform web searches when stuck — so that the PoC generation pipeline works end-to-end in a properly configured environment.

**Why this priority**: Without working MCP transport, the entire PoC generation pipeline produces degraded output. Every MCP-dependent component returns hardcoded or simulated data, making the Ralph Loop significantly less effective.

**Independent Test**: Configure a test environment with a mock MCP server implementing the MCP protocol, run `sofia dev` on a session with a plan referencing Azure services and npm dependencies, and verify that real tool calls are dispatched and real responses are used in the LLM prompt.

**Acceptance Scenarios**:

1. **Given** a configured MCP environment with GitHub MCP available, **When** the Ralph Loop scaffolds a PoC, **Then** `createRepository` dispatches a `create_repository` tool call via the MCP transport and returns the real repository URL from the server response.
2. **Given** a configured MCP environment with Context7 available, **When** the context enricher queries library docs for a dependency (e.g., "express"), **Then** `queryContext7` dispatches `resolve-library-id` followed by `query-docs` tool calls via MCP transport and returns real documentation text.
3. **Given** a configured MCP environment with Azure MCP available, **When** the plan references Azure services, **Then** `queryAzureMcp` dispatches a `documentation` tool call and returns real architecture guidance.
4. **Given** all MCP servers are unavailable, **When** the Ralph Loop runs, **Then** all adapters degrade gracefully to local fallbacks (local scaffold, static context strings) without errors or crashes.

---

### User Story 2 — GitHub MCP Pushes Real File Content (Priority: P1)

As a facilitator, I want the Ralph Loop to push actual file content (not empty strings) to the GitHub repository after each iteration, so that the remote repository always reflects the current state of the PoC.

**Why this priority**: Even with MCP transport working, pushing empty files makes the GitHub integration useless. This is a data-flow bug that must be fixed alongside the transport layer.

**Independent Test**: Run a Ralph Loop iteration that modifies files, verify that `pushFiles` sends the actual file content read from disk to the MCP server.

**Acceptance Scenarios**:

1. **Given** the Ralph Loop has applied code changes in an iteration, **When** `pushFiles` is called, **Then** each file in the push request contains the actual content read from disk (not empty strings).
2. **Given** a file path is outside the output directory, **When** `pushFiles` prepares the file list, **Then** that file is skipped with a warning logged.

---

### User Story 3 — Discovery Phase Uses Web Search and WorkIQ (Priority: P2)

As a facilitator running a discovery workshop, I want sofIA to optionally search the web for recent company news, competitor activity, and industry trends after I provide company information, so that the ideation phase is informed by current market context.

**Why this priority**: Enriching the discovery phase with real-world context improves PoC relevance, but the core pipeline works without it. This is an enhancement to workshop quality.

**Independent Test**: Start a workshop session, provide company and team information, verify that sofIA offers to search for relevant context and stores the results in the session for later phases.

**Acceptance Scenarios**:

1. **Given** the user has described their business in Step 1, **When** the discovery agent processes this input, **Then** it offers to search the web for recent news about the company, competitors, and industry trends.
2. **Given** the user consents to web search enrichment, **When** the search completes, **Then** the results are stored in the session's discovery state and are available to inform ideation and planning phases.
3. **Given** web search MCP is unavailable, **When** the discovery agent tries to enrich context, **Then** it skips enrichment gracefully with a message explaining that web search is not available.

---

### User Story 4 — WorkIQ Integration for Internal Context (Priority: P3)

As a facilitator, I want sofIA to optionally query WorkIQ to analyze internal documentation, meeting patterns, and team expertise, so that the PoC is aligned with the team's actual strengths and collaboration patterns.

**Why this priority**: WorkIQ provides valuable internal context but requires Microsoft 365 access and admin consent. It's an optional enhancement that adds significant value when available but is not required for core functionality.

**Independent Test**: With WorkIQ configured and authorized, verify that sofIA asks permission before querying, returns meaningful team insights, and stores them in the session.

**Acceptance Scenarios**:

1. **Given** WorkIQ is configured and available, **When** the discovery phase gathers team information, **Then** sofIA asks the user for explicit permission before querying WorkIQ.
2. **Given** the user grants WorkIQ permission, **When** WorkIQ returns team insights, **Then** these insights are stored in the session and surfaced during ideation to help shape the PoC approach.
3. **Given** the user declines WorkIQ access or WorkIQ is unavailable, **When** the discovery phase continues, **Then** it proceeds normally without internal context, with no errors.

---

### User Story 5 — Copilot SDK Agent Architecture Alignment (Priority: P2)

As a developer, I want the MCP transport layer to align with how the GitHub Copilot SDK structures agent definitions and tool routing, so that sofIA's agents can be registered and orchestrated through the SDK's native patterns rather than custom dispatch.

**Why this priority**: Aligning with SDK patterns now avoids a costly refactor later and enables sofIA to leverage SDK features like built-in authentication, tool approval flows, and session management.

**Independent Test**: Verify that the agent definitions follow Copilot SDK conventions and that MCP tool calls flow through the SDK's expected tool-calling interface.

**Acceptance Scenarios**:

1. **Given** the Copilot SDK provides native `mcpServers` support in `SessionConfig`, **When** `createSession()` is called with MCP server configurations from `.vscode/mcp.json`, **Then** the SDK manages server lifecycle (spawn/connect, JSON-RPC, tool dispatch) for LLM-initiated tool calls without custom transport code.
2. **Given** adapters (GitHub, Context7, Azure) need deterministic programmatic tool calls, **When** `McpManager.callTool()` is invoked, **Then** it routes through the custom transport layer (`StdioMcpTransport` / `HttpMcpTransport`) since the SDK's `executeToolCall` is private and cannot be called directly from application code.
3. **Given** the SDK defines agent registration patterns, **When** sofIA's discovery/ideation/design/select/plan agents are initialized, **Then** they follow SDK conventions for capability declaration and tool access.

### Dual-Lifecycle Limitation

**⚠️ Known limitation**: The Copilot SDK's `mcpServers` support and the custom `McpTransport` layer manage MCP server connections independently. If the same server (e.g., `context7`) is used both by the LLM during conversation turns (SDK-managed) and by a programmatic adapter call (custom transport-managed), **two separate subprocess instances** will be spawned. This is acceptable for Feature 003 scope because:

- The two paths serve fundamentally different call patterns (LLM-driven vs. deterministic).
- MCP subprocesses are lightweight (Node.js CLI tools via npx).
- HTTP servers (GitHub, Microsoft Docs) are stateless and unaffected.

This limitation should be revisited in a future feature if subprocess resource usage becomes a concern, potentially by sharing a single subprocess instance between the SDK and custom transport layers.

---

### Edge Cases

- What happens when an MCP server disconnects mid-tool-call? The transport MUST timeout and return a classified error that adapters handle gracefully.
- How does the system handle MCP servers returning malformed JSON responses? The transport MUST parse defensively and throw typed errors classifiable by `classifyMcpError()`.
- What happens when Context7 `resolve-library-id` succeeds but `query-docs` fails? Return whatever partial context was gathered.
- What happens when the GitHub MCP `create_repository` call creates the repo but the subsequent `push_files` call fails? The repository URL MUST still be recorded; the push failure is a recoverable error for the next iteration.
- What if WorkIQ requires re-authentication mid-session? Surface a clear message to the user and skip enrichment for that query.

## Requirements _(mandatory)_

### Functional Requirements

#### MCP Transport Layer (GAP-001)

- **FR-001**: `McpManager` MUST implement a working `callTool(serverName, toolName, args)` method that dispatches real tool calls to configured MCP servers and returns structured results.
- **FR-002**: The transport layer MUST support both `stdio` (subprocess-based) and `http` (URL-based) MCP server configurations as defined in `.vscode/mcp.json`.
- **FR-003**: Tool calls MUST include configurable timeouts (default: 30 seconds for data queries, 60 seconds for repository operations).
- **FR-004**: The transport MUST handle connection failures, timeouts, and malformed responses by throwing typed errors that callers can classify using `classifyMcpError()`.
- **FR-004a**: The transport MUST automatically retry once with exponential backoff for transient errors (connection refused, timeout, server unavailable). Auth failures and validation errors MUST NOT be retried.
- **FR-005**: The transport MUST support the MCP protocol's request/response format, including JSON-RPC message framing for stdio servers.

#### GitHub MCP Integration (GAP-002, GAP-003)

- **FR-006**: `GitHubMcpAdapter.createRepository()` MUST dispatch a `create_repository` tool call via the MCP transport and extract the repository URL from the real response.
- **FR-007**: `GitHubMcpAdapter.pushFiles()` MUST dispatch a `push_files` tool call via the MCP transport, sending actual file content read from disk.
- **FR-008**: The Ralph Loop MUST read file content from disk before passing it to `pushFiles()`, replacing the current empty-string behavior (GAP-003).
- **FR-009**: Both GitHub adapter methods MUST degrade gracefully when the MCP transport is unavailable, returning `{ available: false, reason }`.

#### Context Enrichment MCP Integration (GAP-004)

- **FR-010**: `McpContextEnricher.queryContext7()` MUST dispatch `resolve-library-id` and `query-docs` tool calls to the Context7 MCP server and return real documentation text.
- **FR-011**: `McpContextEnricher.queryAzureMcp()` MUST dispatch a `documentation` tool call to the Azure MCP server with architecture keywords and return real guidance.
- **FR-012**: `McpContextEnricher.queryWebSearch()` MUST dispatch a search tool call when the Ralph Loop is stuck (2+ consecutive iterations with same failures).
- **FR-013**: All enrichment methods MUST fall back to static/empty context when their respective MCP servers are unavailable, with no impact on the Ralph Loop's ability to continue iterating.

#### Discovery Phase Enrichment (GAP-005)

- **FR-014**: The discovery phase SHOULD offer web search enrichment after the user provides company and team information in Step 1.
- **FR-015**: Web search results (company news, competitor activity, industry trends) MUST be stored in the session state for use in subsequent phases.
- **FR-016**: WorkIQ integration MUST request explicit user permission before accessing Microsoft 365 data. _Note: SDK provides `onPermissionRequest` handler as an alternative — evaluated and deferred in favor of `io.prompt()` for consistency with other interactive prompts (see research.md Topic 8)._
- **FR-017**: WorkIQ-derived insights (team collaboration patterns, documentation gaps, expertise areas) MUST be stored in the session state when the user consents.
- **FR-018**: Both web search and WorkIQ enrichment MUST be optional — the discovery phase MUST function normally without them.

#### Copilot SDK Alignment (GAP-006, GAP-007)

- **FR-019**: Before implementing custom MCP transport, the team MUST research the GitHub Copilot SDK's built-in MCP support and tool-calling capabilities. Where the SDK provides native MCP integration (tool dispatch, authentication, protocol handling), the implementation MUST use the SDK's mechanisms rather than building custom transport. Custom stdio/HTTP transport MUST only be built for capabilities the SDK does not cover. This research MUST also determine the authentication model for each transport type. Findings MUST be documented in a research note under `specs/003-mcp-transport-integration/research.md`.
- **FR-020**: Agent definitions (discovery, ideation, design, select, plan, develop) MUST be verified to follow Copilot SDK conventions for agent registration and capability declaration. Where SDK patterns (e.g., `customAgents`, `skillDirectories`) offer advantages over the current implementation, they SHOULD be evaluated and adopted if beneficial. Research findings (research.md Topic 7) confirmed no structural refactoring is currently required; SDK `customAgents` and `skillDirectories` evaluated and deferred (research.md Topic 9).

#### SDK Hooks & Transparency (Constitution Principle VIII)

- **FR-021**: The system MUST use the Copilot SDK's `onPreToolUse` and `onPostToolUse` hooks to emit tool-call activity events (tool name, start/end, duration) visible via the CLI spinner or activity log, satisfying Constitution Principle VIII ("Users MUST always see the current execution state"). Findings documented in research.md Topic 8.
- **FR-022**: The system SHOULD use the Copilot SDK's `onErrorOccurred` hook to centralize error handling for LLM-conversation-path MCP failures, complementing `classifyMcpError()` which handles the custom transport path. FR-004's error classification covers programmatic adapter calls only; SDK-managed tool call errors require the `onErrorOccurred` hook.
- **FR-023**: Ralph Loop sessions SHOULD wire the SDK's `infiniteSessions` config (with `backgroundCompactionThreshold` and `bufferExhaustionThreshold`) to prevent context window exhaustion during extended multi-iteration conversations. Without this, long Ralph Loop runs risk silently truncating important context (see research.md Topic 9).
- **FR-024**: The system SHOULD subscribe to SDK events (e.g., `assistant.usage` for token tracking) to provide real-time progress and usage transparency in the CLI, per Constitution Principle VIII. Token counts logged at `debug` level and optionally surfaced in the CLI spinner.

### Key Entities

- **McpTransport**: Abstraction over the communication channel to an MCP server. Handles JSON-RPC framing for stdio servers and HTTP requests for HTTP servers. Manages connection lifecycle (connect, call, disconnect).
- **ToolCallRequest**: Structured request containing server name, tool name, and arguments. Includes timeout and retry configuration.
- **ToolCallResponse**: Structured response from an MCP server containing the tool result as parsed JSON, or an error with classification.
- **DiscoveryEnrichment**: Optional context gathered during the discovery phase, stored in the session for downstream phases. Schema:
  ```typescript
  {
    webSearchResults?: string;        // raw search summary text
    companyNews?: string[];            // recent news headlines/snippets
    competitorInfo?: string[];         // competitor activity summaries
    industryTrends?: string[];         // industry trend descriptions
    workiqInsights?: {
      teamExpertise?: string[];        // identified team skill areas
      collaborationPatterns?: string[];// meeting/communication patterns
      documentationGaps?: string[];   // areas lacking documentation
    };
  }
  ```

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-003-001**: All four MCP-dependent components (GitHub adapter, Context7 enricher, Azure enricher, web search enricher) successfully dispatch real tool calls and process real responses in a configured environment.
- **SC-003-002**: When any MCP server is unavailable, the system operates with the same graceful degradation behavior as the current stub implementation — no crashes, clear fallback messages, functional Ralph Loop output.
- **SC-003-003**: GitHub `pushFiles` sends actual file content to the MCP server, verified by inspecting the tool call arguments in integration tests.
- **SC-003-004**: The Ralph Loop completes at least one end-to-end run where Context7 documentation and web search results measurably improve the LLM's ability to fix failing tests (measured by comparing iteration counts with and without enrichment).
- **SC-003-005**: Discovery phase web search enrichment retrieves relevant context for at least 3 out of 5 test company descriptions, measured by keyword relevance in search results.
- **SC-003-006**: WorkIQ integration, when authorized, returns team insights within 10 seconds and stores them in the session without errors.
- **SC-003-007**: All MCP tool calls complete within their configured timeouts (30s for queries, 60s for repository operations) or return a classified timeout error.

## Assumptions

- The GitHub Copilot SDK (`@github/copilot-sdk` v0.1.28+) is the primary implementation path for MCP transport. FR-019 research MUST determine what the SDK provides natively before building any custom transport. Custom stdio/HTTP transport is only built for gaps in SDK coverage.
- MCP servers configured in `.vscode/mcp.json` follow the standard MCP protocol (JSON-RPC 2.0 over stdio, or HTTP endpoints).
- The authentication model for each MCP transport type is not yet determined. FR-019 research will establish whether stdio servers inherit environment credentials, whether HTTP servers use Copilot SDK auth, and whether WorkIQ requires its own OAuth flow. No custom auth abstraction should be built until this research is complete.
- Context7 and Azure MCP servers are publicly accessible npm packages (`@upstash/context7-mcp`, `@azure/mcp`) that can be spawned as subprocesses — unless the SDK provides a different mechanism for spawning/connecting.
- WorkIQ requires Microsoft 365 tenant access with admin consent, as documented in the WorkIQ Admin Instructions.
- The `web.search` capability is either built into the Copilot SDK or available as an MCP tool — research is needed to confirm the exact integration path.
- Live integration tests for MCP servers will be gated behind environment variables (e.g., `SOFIA_LIVE_MCP_TESTS=true`) to avoid CI failures when servers are not available.

## Dependencies

- **Feature 001**: Session model, workshop phases, plan outputs
- **Feature 002**: Ralph Loop, GitHub adapter, context enricher, PoC scaffolder
- **External**: `@github/copilot-sdk` v0.1.28+, MCP servers configured in `.vscode/mcp.json`
