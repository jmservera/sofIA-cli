# Implementation Plan: sofIA Unified Build-From-Scratch CLI

**Branch**: `001-cli-workshop-rebuild` | **Date**: 2026-02-26 | **Spec**: ./spec.md  
**Input**: Feature specification from `specs/001-cli-workshop-rebuild/spec.md`

**Plan outputs created by this workflow**:

- Phase 0: ./research.md
- Phase 1: ./data-model.md, ./quickstart.md, ./contracts/\*

## Summary

Build a Node.js + TypeScript GitHub Copilot SDK CLI that runs the governed workshop lifecycle for Discover → Ideate → Design → Select → Plan and captures PoC requirements for Develop, with explicit phase decision gates, repo-local session persistence, robust recovery, and deterministic automated testability (including PTY-based interactive harness). Concrete PoC repository generation and the Ralph loop are implemented in a separate feature (002-poc-generation) that consumes the session data produced here.

Transparency UX: provide a user-visible **reasoning/rationale view** as structured summaries (why we’re asking, what we inferred, what trade-offs we made), plus an **activity/telemetry stream** (phase state, tool usage, progress, retries) and an optional debug log.

Note: even though the constitution no longer forbids it, this plan does **not** include displaying raw hidden model chain-of-thought; instead it provides explicit, reviewable rationale summaries and intermediate artifacts.

## Technical Context

**Language/Version**: Node.js 20 LTS + TypeScript 5.x  
**Primary Dependencies**: `@github/copilot-sdk`, `commander` (CLI), `@inquirer/prompts` (menus), `zod` (schemas), `pino` (logs), `ora` (spinners/activity), `marked` + `marked-terminal` (Markdown→ANSI), `chalk` (color), `cli-table3` (tables)  
**Storage**: Repo-local files: `./.sofia/sessions/<sessionId>.json`, export bundles in `./exports/<sessionId>/`  
**Testing**: Vitest (unit/integration), `node-pty` (interactive E2E harness), deterministic fakes for Copilot SDK sessions  
**Target Platform**: macOS/Linux/Windows terminals (TTY and non-TTY); Node runtime only  
**Project Type**: CLI application + library modules (agents/orchestration)  
**Performance Goals**: First streamed output token ≤ 3 seconds in correctly configured environments; avoid blocking render loops  
**Constraints**: No raw SDK JSON to users; no hidden chain-of-thought display; no implicit phase transitions; repo-local persistence; graceful MCP/tool degradation; interactive must be fully automatable via PTY; stdout must remain JSON-only in `--json` mode  
**Scale/Scope**: Single-user/local facilitator runs; session sizes dominated by turn history + artifacts; support multiple sessions per repo

## CLI Rendering (Markdown, color, tables)

Goal: when possible, workshop outputs are authored in Markdown and rendered to the terminal in a readable, colorful format (headings, lists, code blocks, links, and tables at minimum).

Rendering rules:

- If `process.stdout.isTTY` and not `--json`, render Markdown to ANSI using `marked` + `marked-terminal`.
- **Streaming responses**: LLM text is rendered as formatted markdown incrementally during streaming using `marked` + `marked-terminal`. Each text chunk is processed through the renderer as it arrives, producing ANSI-formatted output in real time. Minor rendering artifacts from partial markdown (e.g., split headings, incomplete tables) are acceptable for responsiveness.
- Render tables using `cli-table3` for consistent borders/column widths (used for structured outputs like status, BXT scores; not for inline streaming).
- If non-TTY or `--json`, do not emit ANSI/spinners; output plain text (or raw Markdown when plain text would lose meaning).
- Keep activity/telemetry on stderr so stdout can remain clean for scripting.

### Visual Feedback & Activity Indicators (FR-043a/b/c)

The CLI provides continuous visual feedback during all operations via `ora` spinners and inline status summaries:

1. **"Thinking..." spinner**: Displayed during all silent gaps — after user input before LLM first token, and between tool results and next text output. Cleared when text streaming begins.
2. **Tool-specific spinner**: When the LLM triggers a tool call, the "Thinking..." spinner transitions to a contextual message (e.g., "⠋ Calling WorkIQ...", "⠋ Searching documentation..."). Cleared when the tool completes.
3. **Tool result summaries**: After each tool call completes, a one-line summary is printed below the spinner area (e.g., "✓ WorkIQ: Found 12 relevant processes"). These summaries remain visible in the output stream.
4. **`--debug` verbose tool output**: When `--debug` is specified, tool summaries expand to include arguments and full result details (multi-line). This reuses the existing `--debug` flag — no separate `--verbose` flag.
5. **Non-TTY/JSON suppression**: Spinners and tool summaries are suppressed in non-TTY and `--json` mode. Tool activity is written to stderr or the debug log only.

Spinner lifecycle in the ConversationLoop `streamResponse()` method:

```
User input → Start "Thinking..." spinner
  → ToolCall event  → Transition spinner to "⠋ <toolName>..."
  → ToolResult event → Stop spinner, print "✓ <toolName>: <summary>"
                       → Restart "Thinking..." spinner (if more processing expected)
  → TextDelta event → Stop spinner, stream rendered markdown
  → Response complete → Ensure spinner stopped
```

Implementation approach:

- Create `src/shared/activitySpinner.ts` module wrapping `ora` with methods: `startThinking()`, `startToolCall(toolName)`, `completeToolCall(toolName, summary)`, `stop()`, and `isActive()`.
- The spinner module respects `isTTY` and `isJsonMode` from the IO context.
- `ConversationLoop.streamResponse()` manages spinner lifecycle based on event types.
- `LoopIO` interface gains `writeToolSummary(toolName: string, summary: string, debug?: { args: Record<string, unknown>; result: unknown }): void` method.
- In `--debug` mode, `writeToolSummary()` expands the summary with args and full result details.

## Existing Assets: Prompts + Discovery Cards Dataset

This repository already contains two critical inputs that the implementation must build on.

### Original prompts (seed material)

- Location: `src/originalPrompts/`
- Files:
  - `facilitator_persona.md`
  - `design_thinking_persona.md`
  - `design_thinking.md`
  - `guardrails.md`
  - `document_generator_persona.md`
  - `document_generator_example.md`

Plan requirement:

- Create canonical runtime prompts under `src/prompts/` by adapting/modularizing these files (shared guardrails + per-step instructions + output schemas).
- Keep `src/originalPrompts/` intact as a historical reference; do not treat it as the runtime source of truth.

### Discovery Cards dataset (authoritative data)

- Dataset: `src/shared/data/cards.json`
- Loader (already implemented): `src/shared/data/cardsLoader.ts` (Zod validation + cached load + search)

Plan requirement:

- Use this dataset in the relevant workshop steps (Explore Cards, scoring, mapping cards→workflow steps, ideation support).
- Provide CLI affordances to browse categories, list cards, and search cards by keyword in interactive mode.

## MCP Integration: Runtime Wiring (Copilot SDK + MCP)

This repo’s MCP servers are configured for the development environment in `.vscode/mcp.json` and include:

- stdio servers (invoked via `npx`): `workiq`, `azure`, `context7`, `playwright`
- HTTP servers: `github` (`https://api.githubcopilot.com/mcp/`), `microsoftdocs/mcp` (`https://learn.microsoft.com/api/mcp`)

Plan requirement:

- Implement an `McpManager` module that:
  - loads and validates `.vscode/mcp.json` (plus optional environment-variable overrides)
  - connects to stdio servers via the MCP TypeScript SDK `Client` + `StdioClientTransport`
  - connects to HTTP servers via `Client` + `StreamableHTTPClientTransport`
  - lists tools (`client.listTools()`) and exposes them to the Copilot SDK as callable tools (namespaced as `mcp.<server>.<tool>`)
  - classifies and surfaces errors (auth/connection/timeout/tool) without leaking secrets

Note: `.vscode/mcp.json` is a VS Code convention; the CLI must not assume Copilot SDK will auto-load it. The CLI loads it explicitly to reuse the same server inventory.

## Discovery Phase: Web Research via Copilot SDK tool-calling

The Discover phase requires web research “when possible”. To ensure this works in the CLI:

- Provide a first-class tool `web.search` (invoked via Copilot SDK tool-calling).
- Implement `web.search` by calling an Azure AI Foundry agent that has **Bing Search tools** configured (per “Grounding agents with Bing Search tools in Microsoft Foundry”).
  - Configure the Foundry agent endpoint and key via environment variables (for example: `SOFIA_FOUNDRY_AGENT_ENDPOINT`, `SOFIA_FOUNDRY_AGENT_KEY`).
  - The CLI MUST NOT log or persist these secrets; they are read at startup and used only for HTTPS calls to the agent.
  - If the Foundry agent is not configured or returns a hard failure, degrade gracefully to a “guided research” prompt that asks the facilitator to paste links/notes.

Output contract:

- `web.search` returns structured results (title, url, snippet/summary) plus an optional `sources` list for auditability, derived from the Foundry agent’s Bing Search tool output.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Default gates for this repository (sofIA Copilot CLI) — derived from `.specify/memory/constitution.md`:

- **Outcome-first discovery**: plan ties work to a measurable business/user outcome.
- **Secure-by-default**: least privilege, no secrets/PII in logs or prompts.
- **Node.js + TypeScript**: aligns with GitHub Copilot SDK patterns used here.
- **MCP-first**: prefer MCP tools over ad-hoc HTTP when available.
- **Test-first (NON-NEGOTIABLE)**: new behavior is implemented via Red → Green → Review.
- **CLI transparency**: long-running steps stream progress; failures include recovery options.

If any gate cannot be met, document the exception under **Complexity Tracking** with rationale.

## Project Structure

### Documentation (this feature)

```text
specs/001-cli-workshop-rebuild/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── cli/                  # command routing, menus, IO adapters
├── loop/                 # ConversationLoop abstraction + streaming renderer
├── sessions/             # session model, persistence, backtracking, exports
├── phases/               # discover/ideate/design/select/plan, plus a Develop boundary module for PoC intent capture and delegation to feature 002
├── mcp/                  # wrappers for WorkIQ/Context7/MicrosoftDocs/GitHub MCP
├── logging/              # redaction + pino setup + log file routing
├── prompts/               # canonical runtime prompts (derived from src/originalPrompts)
└── shared/               # shared schemas, types, card dataset loader, utilities

src/originalPrompts/       # existing seed prompts (kept for reference; not runtime source of truth)

tests/
├── unit/
├── integration/
└── e2e/                  # PTY-driven interactive harness tests

.sofia/                   # repo-local state (gitignored): sessions, temp artifacts
exports/                  # repo-local exports (gitignored): customer artifact bundles
```

**Structure Decision**: Single Node.js/TypeScript CLI project at repository root with layered modules for CLI UX, conversation loop, phase orchestration, persistence, and MCP integrations.

## Agent Design: Step/Phase Coverage

The agent set is derived from the existing personas/prompts and covers the workshop pipeline end-to-end:

- Facilitator orchestrator (primary)
  - Seed: `src/originalPrompts/facilitator_persona.md`
  - Responsibilities: governed progression/decision gates, delegation to step specialists, persistence of summaries + artifacts.

- Step specialists (per phase/step)
  - Seeds: `design_thinking_persona.md` + `design_thinking.md`, plus `guardrails.md` included everywhere.
  - Output contracts: each step emits structured data for the session model (see `data-model.md`) and Markdown artifacts for export.

- Document generator
  - Seed: `document_generator_persona.md` + `document_generator_example.md`
  - Responsibilities: produce customer-ready workshop report/artifacts from session state.

- Discovery Cards support
  - Data source: `src/shared/data/cards.json` via `cardsLoader.ts`
  - Responsibilities: present cards, support scoring, map cards to workflow steps, seed ideation prompts with relevant cards.

## Phase 7: New Capabilities (Session Naming, Default Command, Auto-Start)

These additions address three new requirements clarified in Session 2026-02-27 (see spec.md Clarifications).

### 7a. Session Naming (FR-023a)

**Goal**: Auto-generate a short, human-readable session name after the first Discover exchange when `businessContext` is first captured.

**Design**:

- Add optional `name?: string` field to `workshopSessionSchema` in `src/shared/schemas/session.ts`.
- Update Discover phase system prompt to instruct the LLM to include a `sessionName` field in its structured JSON output alongside `businessContext`.
- Add `extractSessionName(response: string): string | null` extractor in `src/phases/phaseExtractors.ts`, parsing `sessionName` from the same JSON block used by `extractBusinessContext`.
- Update Discover handler's `extractResult()` to call `extractSessionName()` and set `session.name` when a name is found.
- Update `statusCommand.ts` to display the session name in table and JSON output.
- Update `workshopCommand.ts` to display the session name in menu/resume flows.

**Constraints**: Name is auto-generated; no user confirmation required. If the LLM omits `sessionName`, the session continues unnamed (no error).

### 7b. Default Workshop Command (FR-004 updated)

**Goal**: Running `sofia` with no subcommand starts the workshop flow (main menu). Workshop options (`--new-session`, `--phase`, `--retry`) promoted to top-level. `sofia workshop` kept as alias. `status` and `export` remain explicit subcommands.

**Design**:

- Restructure `src/cli/index.ts`:
  - Move workshop options (`--new-session`, `--phase`, `--retry`) to `program` (top-level).
  - Set a default action on `program` that invokes the workshop flow when no subcommand is given.
  - Keep `program.command('workshop')` as an alias (same handler).
  - `status` and `export` remain explicit subcommands.
  - `--help` shows all workshop options at the top level.

**Constraints**: Must not break existing `sofia workshop`, `sofia status`, or `sofia export` commands. Direct command mode (`--session` + `--phase`) must continue working at top level.

### 7c. Auto-Start Conversation (FR-015a)

**Goal**: When a conversation phase starts (new or resumed), the ConversationLoop sends an initial message to the LLM before waiting for user input. The LLM introduces the phase and asks the first question. On resume, it summarizes progress and asks the next question.

**Design**:

- Add `initialMessage?: string` option to `ConversationLoopOptions`.
- Modify `ConversationLoop.run()`:
  - If `initialMessage` is provided, send it as a system/user message to the LLM before entering the `readInput()` loop.
  - Stream and render the LLM response as the opening greeting.
  - Record the initial exchange in turn history.
  - If no first token arrives within 10 seconds, treat as transient failure and apply retry logic.
- Add `getInitialMessage(session: WorkshopSession): string` method to the `PhaseHandler` interface.
  - For new sessions: generates a prompt like "Introduce the [phase] phase and ask the first question."
  - For resumed sessions: generates a prompt like "Summarize progress so far and ask the next question."
- Wire `getInitialMessage()` into `workshopCommand.ts` so it's passed to `ConversationLoop` at phase start.
- All phase handler factories must implement `getInitialMessage()`.

**Timeout**: 10 seconds for first token of auto-start greeting (per clarification).

## Post-Design Constitution Re-check (Phase 1)

- User-visible transparency is provided via rationale summaries + intermediate artifacts + activity/telemetry (not raw hidden chain-of-thought).
- Interactive mode never auto-advances phases; explicit decision gate required.
- Testability is a first-class deliverable: unit + integration + PTY E2E harness.

## Post-Design Constitution Re-check (Phase 7 additions)

- **Outcome-first**: Session naming improves facilitator UX (identify sessions at a glance). Default command reduces friction. Auto-start eliminates dead air.
- **Secure-by-default**: No new secrets introduced; session name is derived from business context already in the session.
- **Test-first**: All new behavior requires failing tests before implementation (TDD).
- **CLI transparency**: Auto-start greeting makes the system proactive and informative.

## Phase 8: Visual Feedback & Streaming Markdown (FR-009a, FR-043a/b/c)

These additions address requirements clarified in Session 2026-02-27 regarding visual feedback during internal operations and incremental markdown rendering.

### 8a. Incremental Streaming Markdown Rendering (FR-009a)

**Goal**: Render LLM streaming text through `marked` + `marked-terminal` incrementally during streaming, so users see formatted markdown (headings, bold, code blocks, lists) in real time rather than raw markdown syntax.

**Design**:

- Update `ConversationLoop.streamResponse()` to pass each `TextDelta` chunk through `renderMarkdown()` before writing to `io.write()`.
- Update `renderMarkdown()` to handle incremental rendering: process chunks through `marked` + `marked-terminal` as they arrive. Accept minor artifacts from partial markdown (split headings, incomplete tables).
- Ensure the full response is still captured as raw markdown for session persistence (turn history stores raw markdown, not ANSI).
- In non-TTY/JSON mode, chunks are written raw (no ANSI rendering), preserving existing behavior.

**Files touched**: `src/loop/conversationLoop.ts`, `src/shared/markdownRenderer.ts`

### 8b. Activity Spinner Module (FR-043a, FR-043c)

**Goal**: Provide a unified spinner module wrapping `ora` that manages "Thinking..." and tool-specific spinners with proper lifecycle management.

**Design**:

- Create `src/shared/activitySpinner.ts` with an `ActivitySpinner` class:
  - `startThinking()`: Display "Thinking..." spinner. No-op if non-TTY/JSON.
  - `startToolCall(toolName: string)`: Transition to "⠋ <toolName>..." spinner. If already spinning, update text in-place.
  - `completeToolCall(toolName: string, summary: string)`: Stop spinner, print "✓ <toolName>: <summary>" line.
  - `stop()`: Stop any active spinner.
  - `isActive(): boolean`: Check if a spinner is currently running.
- Constructor accepts `{ isTTY: boolean; isJsonMode: boolean; debugMode: boolean }` — all spinner operations are no-ops when not TTY or in JSON mode.
- The spinner writes to stderr to avoid polluting stdout.

**Files touched**: `src/shared/activitySpinner.ts` (new)

### 8c. Tool Call Summaries & Debug Verbose Output (FR-043b)

**Goal**: After each tool call completes, display a one-line summary. In `--debug` mode, expand with full arguments and result details.

**Design**:

- Add `writeToolSummary(toolName: string, summary: string, debug?: { args: Record<string, unknown>; result: unknown }): void` method to `LoopIO` interface.
- Implement in `createLoopIO()` in `src/cli/ioContext.ts`:
  - Default: prints `✓ <toolName>: <summary>` to stderr.
  - `--debug`: additionally prints formatted JSON of args and result below the summary.
  - Non-TTY/JSON: omit from stdout; write to stderr or debug log only.
- Update `ConversationLoop.streamResponse()` to call `io.writeToolSummary()` when a `ToolResult` event is received, constructing the summary from the event data.

**Files touched**: `src/loop/conversationLoop.ts`, `src/cli/ioContext.ts`

### 8d. ConversationLoop Spinner Integration (FR-043a/b/c combined)

**Goal**: Wire the `ActivitySpinner` into `ConversationLoop.streamResponse()` to manage the full spinner lifecycle across thinking, tool calls, and text streaming.

**Design**:

- `ConversationLoop` constructor accepts an `ActivitySpinner` instance (injected via options or created from IO context).
- In `streamResponse()`, manage spinner state based on event types:
  1. Before sending message: call `spinner.startThinking()`.
  2. On `ToolCall` event: call `spinner.startToolCall(event.toolName)`.
  3. On `ToolResult` event: call `spinner.completeToolCall(event.toolName, summarize(event.result))`, then `spinner.startThinking()` if more events expected.
  4. On first `TextDelta` event: call `spinner.stop()` (clear spinner, start streaming text).
  5. On response complete: call `spinner.stop()` (safety net).
- Expose `spinner` option in `ConversationLoopOptions` to allow injection for testing (pass a no-op spinner in tests).

**Files touched**: `src/loop/conversationLoop.ts`

### Post-Design Constitution Re-check (Phase 8)

- **Outcome-first**: Visual feedback eliminates "dead terminal" anxiety — users always know the system is working. Markdown rendering improves readability of LLM outputs.
- **CLI transparency**: Spinners, tool summaries, and thinking indicators make internal operations visible without exposing raw SDK internals.
- **Test-first**: All new behavior requires failing tests before implementation (TDD). Spinner can be tested via a fake/mock `ora` or by verifying event-driven callbacks.
- **Secure-by-default**: Tool summaries in default mode show no sensitive data. `--debug` verbose output is opt-in and goes to stderr.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |
