# Research: MCP Transport Integration

**Feature ID**: 003-mcp-transport-integration  
**Date**: 2026-03-01  
**Status**: Complete

---

## Topic 1: GitHub Copilot SDK MCP Support (FR-019)

### Question

Does `@github/copilot-sdk` v0.1.28 provide native MCP transport — tool dispatch, server lifecycle management, stdio/HTTP protocol handling, and authentication? Where must we build custom transport?

### Findings

**SDK scope (v0.1.28) — UPDATED**: The Copilot SDK provides **native MCP server management** via `SessionConfig.mcpServers`. When `mcpServers` is passed to `CopilotClient.createSession()`, the SDK handles the full lifecycle: spawning stdio subprocesses, connecting to HTTP endpoints, JSON-RPC framing, and tool dispatch during LLM conversations. The SDK exposes `MCPLocalServerConfig` (type `"local"` | `"stdio"`, with `command`, `args`, `env?`, `cwd?`, `tools`, `timeout?`) and `MCPRemoteServerConfig` (type `"http"` | `"sse"`, with `url`, `headers?`, `tools`, `timeout?`). These types map directly to `.vscode/mcp.json` server entries.

**However**, the SDK's `executeToolCall()` method on `CopilotClient` is **private** — there is no public API to invoke a tool programmatically outside of an LLM conversation turn. This means:

- **LLM-initiated tool calls** (e.g., web search during conversation, discovery enrichment) can leverage SDK-managed MCP servers. The SDK spawns, connects, and dispatches tool calls as needed — no custom transport required.
- **Programmatic adapter calls** (GitHub `createRepository`, Context7 `resolve-library-id`, Azure `documentation`) cannot use the SDK. These calls are made deterministically by application code, not by the LLM. They require our custom `McpTransport` layer.

**Dual-path architecture**:

1. **SDK-managed path (LLM conversations)**: Pass `.vscode/mcp.json` config as `mcpServers` to `sdkClient.createSession()`. The SDK handles server lifecycle, JSON-RPC, and tool dispatch during `sendAndWait()` calls. Tools are available to the LLM without additional sofIA code.
2. **Custom transport path (programmatic adapter calls)**: `McpManager.callTool()` uses our `StdioMcpTransport` / `HttpMcpTransport` for deterministic tool invocations by adapters (GitHub, Context7, Azure). These bypass the LLM entirely.

**SDK value in this feature**: The SDK is useful for both (a) the web search case (`web.search` tool) — already registered via `WEB_SEARCH_TOOL_DEFINITION` — and (b) making any MCP server's tools available to the LLM during conversation turns. For direct MCP tool calls made by adapters (GitHub adapter, Context7 enricher), the SDK is bypassed — adapters call `McpManager.callTool()` directly without going through the LLM conversation.

**⚠️ Dual-lifecycle limitation**: If the same MCP server (e.g., `context7`) is used both by the SDK (LLM conversation) and by a custom transport (programmatic adapter call), two separate subprocesses will be spawned. This is acceptable for Feature 003 scope but should be revisited if subprocess resource usage becomes a concern in later features.

### Decision

**Dual-path approach**:

1. **Wire SDK-managed MCP** — Pass `.vscode/mcp.json` config (converted to `MCPServerConfig` format) to `sdkClient.createSession({ mcpServers })` so the LLM can invoke MCP tools during conversation turns. This requires updating `copilotClient.ts` to accept and forward `mcpServers`.
2. **Build custom MCP transport in `src/mcp/mcpTransport.ts`** — For the programmatic adapter path only (GitHub, Context7, Azure). The SDK's `executeToolCall` is private, so direct tool invocation from application code requires custom transport.

**Rationale**: Leveraging the SDK's native `mcpServers` support reduces the amount of custom protocol code needed for LLM conversation paths. The custom transport is still necessary for deterministic adapter calls that bypass the LLM. This dual approach aligns with the SDK's design intent.

**Alternatives considered**:

- Use the SDK tool-call loop for all MCP calls — rejected because it requires the LLM to initiate every tool call, making GitHub repo creation dependent on LLM decisions rather than deterministic code.
- Use only custom transport for everything — rejected because it ignores the SDK's native MCP support, duplicating server lifecycle management the SDK already provides for LLM conversations.
- Use a third-party MCP client library (`@modelcontextprotocol/sdk`) — viable but adds a dependency. The MCP client protocol (JSON-RPC 2.0 over stdio/HTTP) is simple enough to implement directly for the adapter path. Revisit in a later feature if the protocol surface grows.

---

## Topic 2: MCP Transport Protocol (stdio vs HTTP)

### Question

What protocol framing does each MCP server type require? How do stdio servers (Context7, Azure, WorkIQ, Playwright) communicate, and how do HTTP servers (GitHub MCP, Microsoft Docs MCP) differ?

### Findings

**MCP Protocol**: JSON-RPC 2.0. Every request is a JSON object:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "toolName", "arguments": {} }
}
```

Every response is:

```json
{ "jsonrpc": "2.0", "id": 1, "result": { "content": [{ "type": "text", "text": "..." }] } }
```

Errors use the standard JSON-RPC error envelope.

**Stdio servers** (Context7: `npx @upstash/context7-mcp`, Azure: `npx @azure/mcp server start`, WorkIQ: `npx @microsoft/workiq mcp`):

- Spawned as child processes (`child_process.spawn` with `stdio: ['pipe','pipe','pipe']`)
- JSON-RPC messages delimited by newlines over stdin/stdout
- One subprocess per server, kept alive for the session duration
- Initialization: send `initialize` request first, receive `initialized` notification
- Auth: inherits environment variables from the parent process (e.g., `GITHUB_TOKEN`, `AZURE_SUBSCRIPTION_ID`)

**HTTP servers** (GitHub MCP: `https://api.githubcopilot.com/mcp/`, Microsoft Docs: `https://learn.microsoft.com/api/mcp`):

- Standard HTTPS POST to the server URL with `Content-Type: application/json`
- Response is JSON-RPC response body
- Auth: HTTP Authorization header — GitHub MCP uses the user's Copilot token (extracted from the SDK session context or `GITHUB_TOKEN` env var)
- No persistent connection needed; each tool call is a stateless HTTP request

### Decision

**Implement two transport strategies**:

1. `StdioMcpTransport`: spawns subprocess, maintains persistent stdin/stdout pipe, sequences requests with pending-request map keyed by JSON-RPC id.
2. `HttpMcpTransport`: wraps native `fetch()`, adds `Authorization` header from env `GITHUB_TOKEN`, sets timeout via `AbortController`.

Both implement a common `McpTransport` interface:

```typescript
interface McpTransport {
  callTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ToolCallResponse>;
  isConnected(): boolean;
  disconnect(): Promise<void>;
}
```

**Rationale**: Clean abstraction isolates protocol details from `McpManager`, making both easily testable with mock transports.

**Alternatives considered**:

- Single class with type switch — rejected because it conflates two fundamentally different I/O models.
- Streaming responses (SSE) — deferred; none of the current MCP servers require streaming at the tool-call level.

---

## Topic 3: Authentication Model Per Transport

### Question

How does each MCP server authenticate tool calls? What credentials are needed and how are they passed?

### Findings

| Server              | Transport | Auth Mechanism                                                                                                 | Source                                              |
| ------------------- | --------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `github`            | HTTP      | `Authorization: Bearer <token>`                                                                                | `GITHUB_TOKEN` env var (set by Copilot environment) |
| `context7`          | stdio     | None required for public package                                                                               | npx subprocess, no auth needed                      |
| `azure`             | stdio     | Azure identity from env (`AZURE_SUBSCRIPTION_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`/DefaultAzureCredential) | Subprocess inherits env                             |
| `workiq`            | stdio     | Microsoft 365 OAuth — WorkIQ handles its own auth flow when launched                                           | Subprocess prompts user or reads cached token       |
| `microsoftdocs/mcp` | HTTP      | None (public API)                                                                                              | No auth header needed                               |

**Key finding for WorkIQ**: WorkIQ's own auth flow means sofIA does not need to implement OAuth — it only needs to spawn the subprocess. However, WorkIQ will prompt the user to authenticate on first use. This is handled transparently by the subprocess.

**Key finding for GitHub HTTP transport**: The `GITHUB_TOKEN` environment variable is the standard Copilot-set credential. The `HttpMcpTransport` reads it at call time (not startup) to avoid storing it in memory.

### Decision

Auth is **transport-level, not application-level**:

- `HttpMcpTransport` reads `process.env.GITHUB_TOKEN` per call, adds it as Bearer token.
- `StdioMcpTransport` passes the parent's `process.env` to the subprocess unchanged.
- No custom auth abstraction is needed. WorkIQ's own flow covers M365 auth.

---

## Topic 4: Retry Policy

### Question

Which error types are transient (retryable) vs permanent (must not retry)?

### Findings

From the spec (FR-004a) and error classification in `classifyMcpError()`:

| Error Class            | Retryable     | Examples                                            |
| ---------------------- | ------------- | --------------------------------------------------- |
| `connection-refused`   | ✅ Yes        | MCP subprocess not yet ready, temporary port in use |
| `timeout`              | ✅ Yes        | Server temporarily slow, network hiccup             |
| `dns-failure`          | ✅ Yes (once) | Transient DNS issues                                |
| `auth-failure`         | ❌ No         | Invalid token, expired credentials, 401/403 HTTP    |
| `unknown`              | ❌ No         | Malformed JSON response, logic errors               |
| Validation error (Zod) | ❌ No         | Bad args, schema mismatch                           |

**Backoff**: 1 second initial delay (jittered ±20%), exponential factor 2x, maximum 1 retry (as per spec — one automatic retry).

### Decision

**`retryPolicy.ts`** exports a `withRetry<T>(fn, options)` helper that wraps any async call:

- Retries once on transient errors after `initialDelayMs` (default 1000ms) with ±20% jitter.
- Does not retry on auth failures, validation errors, or unknown errors.
- On retry, logs a `warn` entry with server name, tool name, attempt number, and delay.

---

## Topic 5: `pushFiles` Empty Content Bug (GAP-003)

### Question

Where exactly does `ralphLoop.ts` send empty file content, and what is the minimal fix?

### Findings

In `ralphLoop.ts` lines 527–548, the current code already reads file content from disk using `readFile(resolve(outputDir, f), 'utf-8')` in the success-path push. The `content: ''` fallback at line 540 is reached only when `readFile` throws (file unreadable). The **actual bug** is that this same pattern is NOT used in the first-iteration scaffold push — only `applyResult.writtenFiles` paths are pushed after iterations 2+.

Reviewing the code more carefully: the current implementation at lines 527–548 does read file content. The GAP-003 bug noted in `specs/003-next-spec-gaps.md` was based on an earlier version. The current code's `content: ''` at line 540 is a **fallback for unreadable files** (correct behavior — skip unreadable rather than push garbage). However, the first scaffold push (before iteration 2) is missing — files created by `PocScaffolder` are never pushed to GitHub.

**Fix needed**: After the initial scaffold completes and a GitHub repo is created, push the scaffold files once (all `scaffoldResult.createdFiles`) with their actual on-disk content. The per-iteration push in the main loop already reads content correctly.

### Decision

Add a post-scaffold push in `RalphLoop.run()` immediately after the npm install step, reading all scaffold file contents from disk (same `readFile` pattern already used in the iteration push block).

---

## Topic 6: Discovery Phase Enrichment Architecture (GAP-005)

### Question

Where in the discovery phase flow should web search and WorkIQ enrichment be inserted? How is `DiscoveryEnrichment` stored in the session?

### Findings

From `src/phases/phaseHandlers.ts` and the spec (FR-014 through FR-018):

- Step 1 of the discovery phase collects company and team information and stores it in `DiscoveryState`.
- After this collection, the enricher should be triggered.
- The session schema (`src/shared/schemas/session.ts`) has a `DiscoveryState` object that currently does not have an enrichment field.

**Flow design**:

1. User completes Step 1 input.
2. `discoveryEnricher.ts` is invoked with the step 1 summary.
3. It calls `web.search` via `webSearch.ts` (already implemented) for company/competitor/industry queries.
4. It optionally calls WorkIQ after showing a permission prompt.
5. Results are stored in `session.discovery.enrichment: DiscoveryEnrichment`.
6. The enrichment is referenced in subsequent phase prompts (ideation, planning).

**WorkIQ permission**: Implemented as an `@inquirer/prompts` `confirm` prompt before any WorkIQ call. If the user declines, or WorkIQ subprocess is not available, enrichment is skipped silently.

### Decision

New module `src/phases/discoveryEnricher.ts` with a `DiscoveryEnricher` class that has:

- `enrichFromWebSearch(companySummary, mcpManager): Promise<Partial<DiscoveryEnrichment>>`
- `enrichFromWorkIQ(companySummary, mcpManager, io): Promise<Partial<DiscoveryEnrichment>>`
- `enrich(companySummary, mcpManager, io): Promise<DiscoveryEnrichment>` — orchestrates both, handles graceful degradation.

`DiscoveryEnrichment` is added to the Zod session schema as an optional field on `DiscoveryState`.

---

## Topic 7: Copilot SDK Agent Architecture Alignment (FR-020)

### Question

Do the current agent definitions (discovery, ideation, design, select, plan, develop) need structural changes to align with Copilot SDK v0.1.28 patterns?

### Findings

The Copilot SDK v0.1.28 agent model:

- An "agent" is a function/class that creates sessions via `CopilotClient.createSession(options)` where `options.systemPrompt` is the agent's identity and `options.tools` is the tool set.
- Tools are declared as `ToolDefinition[]`; there is no formal "agent registry" API in v0.1.28.
- The SDK dispatches `tool_call` events which the host handles in the conversation loop.

**Current sofIA agents**: Each phase (discovery, ideation, design, select, plan, develop) uses `createFakeCopilotClient` in tests and the real SDK client in production. They declare tools via `SessionOptions.tools`. This matches the SDK's expected pattern exactly.

**No structural misalignment found**. The current architecture correctly uses:

- `CopilotClient.createSession()` → one session per phase turn.
- `ToolDefinition` objects for capability declaration.
- Conversation loop event handling for tool dispatch.

**What FR-020 means in practice**: Ensure that when `callTool()` is implemented, direct adapter calls (GitHub, Context7, Azure) do NOT go through the LLM session — they are application-layer calls. This is already the design. The "alignment" is confirming the SDK does not provide a competing pattern that we should use instead.

### Decision

**No agent refactoring needed**. The existing architecture is already SDK-aligned. FR-020 is satisfied by documenting this finding in `research.md` (this document) and ensuring `McpManager.callTool()` is an application-layer call, not routed through LLM sessions.

---

## Topic 8: SDK Hooks, Events, and CLI Transparency (FR-021, FR-022, FR-024)

### Question

How should sofIA use the Copilot SDK's hooks and event system to provide real-time visibility into tool activity, errors, and usage — satisfying Constitution Principle VIII (CLI-First UX & Transparency)?

### Findings

The Copilot SDK v0.1.28 provides two complementary mechanisms for runtime visibility:

**Hooks** (via `SessionConfig.hooks`):

Six lifecycle hooks are available:

- `onPreToolUse(toolName, toolArgs, context)` — fired before every tool call; returns `{ permissionDecision, reason }` to allow/deny
- `onPostToolUse(toolResult, context)` — fired after every tool call; can modify or log results
- `onUserPromptSubmitted(prompt, context)` — modify user prompts before processing
- `onSessionStart(context)` — add additional context at session start
- `onSessionEnd(context)` — cleanup/analytics
- `onErrorOccurred(error, context)` — custom error handling for LLM-path errors

**Events** (via `session.on()`/`session.once()`):

40+ event types are available, including:

- `assistant.usage` — token usage per turn (input/output tokens)
- Streaming delta events for real-time content display
- Tool call lifecycle events

**Key insight for CLI transparency**: `onPreToolUse` and `onPostToolUse` are the standard mechanism to implement Constitution Principle VIII's requirement that _"Users MUST always see the current execution state."_ Currently, sofIA's spinner shows phase-level activity but does NOT show individual MCP tool calls being made during LLM conversation turns. The SDK hooks are the native way to emit this visibility.

**`onErrorOccurred` for LLM-path errors**: FR-004's `classifyMcpError()` only covers the custom transport path (adapter calls). Errors during SDK-managed tool calls (LLM conversation path) are handled by the SDK internally. The `onErrorOccurred` hook allows sofIA to log, surface, or recover from these errors — complementing the custom transport error handling.

**`onPermissionRequest` for tool approval**: The SDK provides an `onPermissionRequest` handler that implements deny-by-default tool approval. This was evaluated as an alternative to `io.prompt()` for WorkIQ consent (FR-016). Decision: defer in favor of the existing `io.prompt()` pattern, which is consistent with other interactive prompts in the discovery phase and supports custom consent UX.

**`assistant.usage` for token tracking**: Subscribing to the `assistant.usage` event provides per-turn token counts. This can be logged at `debug` level and optionally displayed in the spinner for transparency during long-running sessions.

### Decision

**Wire SDK hooks for tool-call visibility**:

1. Add `hooks` support to `SessionOptions` in `copilotClient.ts`.
2. Wire `onPreToolUse` to emit a `tool:start` activity event (tool name) to the CLI spinner.
3. Wire `onPostToolUse` to emit a `tool:end` activity event (tool name, duration) to the CLI spinner.
4. Wire `onErrorOccurred` to log SDK-path errors at `warn` level via the existing pino logger.
5. Subscribe to `assistant.usage` events and log token usage at `debug` level.

**Defer**: `onPermissionRequest` (use `io.prompt()` instead for WorkIQ consent), `onUserPromptSubmitted` (no current use case), `onSessionStart`/`onSessionEnd` (no current use case beyond what's already handled).

**Rationale**: Hooks are the SDK-native mechanism for the transparency that Constitution Principle VIII requires. Without them, MCP tool calls during LLM conversation turns are invisible to the user. The implementation is low-effort: forward hooks to `createSession()`, emit events to the existing spinner infrastructure in `src/shared/events.ts`.

---

## Topic 9: SDK Advanced Session Features — infiniteSessions, customAgents, skillDirectories (FR-023)

### Question

Do the SDK's `infiniteSessions`, `customAgents`, and `skillDirectories` features offer advantages over sofIA's current implementation patterns?

### Findings

**`infiniteSessions` config**:

- Controls context window management for long-running sessions.
- `backgroundCompactionThreshold` (default 0.7): triggers background context compaction when usage exceeds this ratio.
- `bufferExhaustionThreshold` (default 0.9): forces compaction to prevent context overflow.
- **Direct relevance**: The Ralph Loop runs extended multi-iteration conversations (up to `maxIterations` turns with code generation, test output, and enrichment context). Without `infiniteSessions`, long runs risk silently truncating conversation history, losing important context about failing tests or previous code changes.
- **Current gap**: Neither spec nor tasks configure `infiniteSessions`. The Ralph Loop could hit context limits on iteration 8+ with verbose test output.

**`customAgents` config**:

- Allows defining multiple agent personas within a single session.
- Each agent has its own system prompt, tools, and capabilities.
- The SDK handles agent switching within the session.
- **sofIA's current pattern**: Creates a new session per phase via `createSession()`. Each phase has its own system prompt and tools.
- **Evaluation**: `customAgents` would allow all phases to share a single session, but sofIA intentionally isolates phases with separate sessions for:
  - Clean context boundaries between workshop phases
  - Independent session history per phase
  - Ability to checkpoint/resume individual phases
- **Conclusion**: The per-phase session pattern is deliberate and offers advantages that `customAgents` would sacrifice. No change needed.

**`skillDirectories` config**:

- Skills are named directories containing `SKILL.md` files (markdown with optional YAML frontmatter).
- Content is injected into the session context.
- Can disable specific skills via `disabledSkills`.
- **sofIA's current pattern**: `promptLoader.ts` loads prompts from `src/prompts/` as markdown files, injects them as system prompts via `SessionOptions.systemMessage`.
- **Evaluation**: `skillDirectories` could replace `promptLoader.ts` for phase-specific prompts, but:
  - `promptLoader.ts` already works correctly and is tested.
  - Skills are additive context injection, not primary system prompts — semantically different.
  - Migration would add complexity without clear benefit.
- **Conclusion**: Keep `promptLoader.ts`. Skills could be used for supplementary context (e.g., workshop materials, card decks) in future features.

**`resumeSession(sessionId)` + session persistence**:

- Sessions persist at `~/.copilot/session-state/{sessionId}/` with checkpoints, plan.md, files.
- `resumeSession()` restores conversation history, tool call results, agent planning state.
- **Current "Out of Scope" deferral**: "Resume/checkpoint for `sofia dev`" (GAP-006 P2) was deferred assuming significant implementation effort.
- **SDK reality**: The SDK handles persistence natively — sofIA only needs to pass a structured `sessionId` and call `resumeSession()`. Implementation complexity is much lower than originally assessed.
- **Conclusion**: Keep deferred (different feature scope) but note reduced complexity in spec's Out of Scope section.

### Decision

| Feature            | Decision                                                        | Rationale                                                                            |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `infiniteSessions` | **Wire for Ralph Loop sessions**                                | Prevents context window exhaustion in extended iterations; low implementation effort |
| `customAgents`     | **Defer — current per-phase sessions are deliberate**           | Phase isolation provides clean context boundaries and independent checkpointing      |
| `skillDirectories` | **Defer — `promptLoader.ts` is sufficient**                     | Current approach works; skills could supplement in future features                   |
| `resumeSession`    | **Defer (different feature scope) but note reduced complexity** | SDK makes this nearly trivial; updated Out of Scope note in spec.md                  |

---

## Summary of Decisions

| Topic                | Decision                                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK MCP support      | SDK provides native `mcpServers` in `createSession()` for LLM conversations; build custom `mcpTransport.ts` only for programmatic adapter calls (GitHub, Context7, Azure)                                 |
| stdio transport      | `child_process.spawn` + JSON-RPC 2.0 newline-delimited over stdin/stdout                                                                                                                                  |
| HTTP transport       | Native `fetch()` + `AbortController` timeout + `Authorization: Bearer`                                                                                                                                    |
| Auth model           | Transport-level: env var for HTTP, subprocess env inheritance for stdio                                                                                                                                   |
| Retry policy         | 1 retry max, transient errors only, 1s base delay ±20% jitter                                                                                                                                             |
| pushFiles bug        | Add post-scaffold push; per-iteration push already correct                                                                                                                                                |
| Discovery enrichment | New `discoveryEnricher.ts`; `DiscoveryEnrichment` in session schema                                                                                                                                       |
| Agent alignment      | No refactoring needed; current SDK usage is correct                                                                                                                                                       |
| SDK hooks & events   | Wire `onPreToolUse`/`onPostToolUse` for CLI spinner visibility; `onErrorOccurred` for LLM-path errors; `assistant.usage` for token tracking                                                               |
| SDK session features | `infiniteSessions` wired for Ralph Loop; `customAgents` deferred (per-phase sessions deliberate); `skillDirectories` deferred (`promptLoader.ts` sufficient); session persistence noted as low-complexity |
