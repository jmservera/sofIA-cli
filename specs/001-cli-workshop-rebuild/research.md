# Research: sofIA Unified Build-From-Scratch CLI

**Feature**: ./spec.md
**Plan**: ./plan.md
**Date**: 2026-02-26

This document resolves technical choices for implementing the spec in Node.js/TypeScript with the GitHub Copilot SDK, focusing on testability, recoverability, and CLI-first UX.

## Decisions

### 1) CLI command framework

- Decision: Use `commander` for command parsing and help output.
- Rationale: Widely used, stable, good help/version/option ergonomics; plays well with non-TTY and JSON output constraints.
- Alternatives considered:
  - `yargs`: strong but heavier and less aligned with our simple command surface.
  - `oclif`: powerful but more framework-heavy than needed for early MVP.

### 2) Interactive menus (TTY)

- Decision: Use `@inquirer/prompts` for menu-driven interactive flows.
- Rationale: Modern UX for prompts, consistent behavior in Node environments, easy to stub in tests via input adapters.
- Alternatives considered:
  - `@clack/prompts`: very nice UX, but inquirer’s ecosystem is broader and easier to standardize.
  - Full-screen TUI frameworks (Ink/Blessed): rejected because the spec’s out-of-scope forbids rich terminal UI, and they complicate PTY automation.

### 3) Reasoning transparency (“LLM thoughts”) UX

- Decision: Provide a **rationale view** made of structured, user-readable summaries (intent, assumptions, trade-offs, and what evidence/tools were used) plus an **Activity Stream** (tool usage, phase state, progress) and optional debug logs.
- Rationale: Users get transparency and auditability without relying on hidden model chain-of-thought; also keeps the CLI deterministic and safe.
- Alternatives considered:
  - Full-screen TUI panes: rejected (spec out-of-scope for rich terminal UI and complicates PTY automation).
  - Dumping raw hidden chain-of-thought: rejected (not needed for transparency; better handled as explicit summaries + artifacts).

### 4) Markdown rendering in the CLI

- Decision: Render Markdown to ANSI when possible (TTY, non-JSON) with color and table support.
- Rationale: Workshop artifacts are naturally Markdown; rendering improves readability while preserving exports as Markdown.
- Proposed libraries: `marked` + `marked-terminal`, `chalk`, `cli-table3`.

### 5) Streaming output rendering

- Decision: Implement a streaming renderer that writes incremental text to stdout immediately and supports a dedicated activity channel.
- Rationale: Required by spec (no full-buffer output; TTFT ≤ 3s). Enables deterministic tests by asserting event ordering and output boundaries.
- Alternatives considered:
  - Buffer until completion: violates TTFT and streaming requirements.

### 6) Session persistence format and location

- Decision: Repo-local persistence at `./.sofia/sessions/<sessionId>.json` (single JSON per session), persisted after every user turn.
- Rationale: Matches clarified requirements; easiest to diff/debug, easiest to test; ensures recoverability across crashes.
- Alternatives considered:
  - JSONL turns log: good for append-only, but spec preference is single JSON file.
  - SQLite: robust but unnecessary complexity for MVP.

### 7) Export format

- Decision: Default export to `./exports/<sessionId>/` containing phase Markdown artifacts + `summary.json`.
- Rationale: Human-friendly outputs for customers + machine-readable index for tooling.
- Alternatives considered:
  - ZIP: introduces archive edge cases and harder diff/review.

### 8) Testing stack

- Decision: Use Vitest for unit/integration and `node-pty` for interactive E2E harness.
- Rationale: Deterministic, fast, good TypeScript support; PTY harness satisfies “interactive-only manual verification is insufficient”.
- Alternatives considered:
  - Jest: fine, but Vitest is faster and TypeScript-friendly.
  - Only integration tests without PTY: violates spec.

### 9) Copilot SDK simulation for tests

- Decision: Wrap Copilot SDK interactions behind a small interface (`CopilotClient` / `ConversationSession` abstraction) with deterministic fakes for tests.
- Rationale: Avoid flaky network/LLM dependence; allow tests to assert control-flow and output contracts.
- Alternatives considered:
  - Live Copilot calls in tests: non-deterministic and brittle.

### 10) Logging

- Decision: Use `pino` with a `--log-file <path>` (and/or `--debug`) option to enable full internal trace logs. Ensure strict redaction.
- Rationale: Speeds debugging; meets observability requirements; keeps user output clean.
- Alternatives considered:
  - Console-only logs: risks mixing telemetry into stdout; harder to persist.

### 11) Internal event model (streaming + tools)

- Decision: Define a stable internal event model for streaming (`TextDelta`, `Activity`, `ToolCall`, `ToolResult`, `PhaseChanged`, `Error`) and adapt whatever Copilot SDK emits into these events.
- Rationale: Keeps the CLI deterministic and testable even if underlying SDK event shapes change; enables fakes to drive the `ConversationLoop` in tests.
- Alternatives considered:
  - Binding tests directly to SDK event shapes: couples tests to external library details and increases brittleness.

### 12) `status` output contract

- Decision: `sofia status --json` outputs `{ sessionId, phase, status, updatedAt, nextAction }` as the stable minimum.
- Rationale: Enables scripting and CI checks; human mode stays concise.
- Alternatives considered:
  - Dumping full session JSON: violates “no raw SDK JSON / no overwhelming output” intent and risks leaking sensitive fields.

### 13) MCP availability and degradation strategy

- Decision: Treat all MCP integrations as optional at runtime; when unavailable, fall back to guided prompts + local scaffolding, while preserving the governed phase flow.
- Rationale: Matches clarified requirement to keep working when GitHub MCP is down; keeps workshop usable offline/limited.
- Alternatives considered:
  - Hard-failing on missing MCP servers: breaks workshop continuity and violates graceful degradation.

### 14) MCP runtime wiring (how the CLI uses MCP)

- Decision: Load MCP server inventory from `.vscode/mcp.json` at runtime and connect using the MCP TypeScript SDK (`Client` + transports).
- Rationale: Reuses the repo’s canonical MCP server list (WorkIQ, GitHub MCP, Microsoft Learn MCP, Context7, Playwright, Azure MCP) and keeps integrations consistent.
- Implementation note: use `StdioClientTransport` for `command` servers (npx-based) and `StreamableHTTPClientTransport` for remote HTTP MCP servers.

### 15) Web research in Discover (web search)

- Decision: Provide a `web.search` tool callable by the Copilot SDK; implement it by calling an Azure AI Foundry agent with Bing Search tools configured.
- Rationale: Uses a first-party, well-supported Bing Search integration as recommended for grounding agents; keeps the CLI thin and lets the Foundry agent orchestrate search.
- Degradation: if the Foundry agent is not configured or fails, fall back to guided prompts requesting user-provided links/notes.
