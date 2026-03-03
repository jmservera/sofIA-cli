# Research: Workshop Phase Extraction & Tool Wiring Fixes

**Feature**: 006-workshop-extraction-fixes  
**Date**: 2026-03-04

## Topic 1: Post-Phase Summarization LLM Call (FR-001–FR-007)

### Decision: Dedicated summarization call with a new ConversationSession

### Rationale

The LLM produces rich conversational content but inconsistently includes structured JSON blocks matching the Zod schemas. Rather than building brittle prose parsers, a dedicated "one-shot" LLM call at phase end sends the full conversation transcript with explicit extraction instructions. This leverages the LLM's own ability to restructure its output.

### Alternatives Considered

1. **NLP-based prose extraction** — Rejected: fragile regex/heuristic parsers for markdown tables, bullet lists, and prose. High maintenance, low accuracy.
2. **Instruct LLM to always output JSON inline** — Rejected: makes conversation unnatural, degrades facilitator UX, and the LLM still drifts.
3. **Post-process each turn** — Current approach (already implemented). Retained as primary path; summarization is the fallback.

### Implementation Details

- **Insertion point**: After the `while` loop in `ConversationLoop.run()` (~line 193), before `return this.session`.
- **Session strategy**: Create a **new** `ConversationSession` (not reuse the existing one) — avoids polluting conversation context and growing the already-long history. `CopilotClient.createSession()` is lightweight (SDK client is a singleton; only the session is new).
- **Prompt structure**: Phase-specific system prompt with the exact Zod schema shape, plus the full phase transcript as the user message.
- **Existing pattern**: Same as `ConversationLoop.streamResponse()` → `extractJsonBlock()` pipeline. Also mirrors the `postExtract` fire-once hook pattern from the Discover enricher.

### Multi-Block Extraction (FR-007)

- Current `extractJsonBlock()` uses non-global regexes → only finds first match.
- New `extractAllJsonBlocks()` uses `/g` flag for fenced blocks and a bracket-depth counter for raw JSON.
- New `extractJsonBlockForSchema<T>(response, schema)` tries each block with `safeParse()`, returns first valid match.

---

## Topic 2: Lazy Web Search Configuration (FR-008–FR-010)

### Decision: `isWebSearchConfigured()` already checks `process.env` at call time — but `.env` must be loaded first

### Rationale

The function itself is stateless: `return Boolean(process.env.FOUNDRY_PROJECT_ENDPOINT && ...)`. The bug is **import ordering**: the test/CLI path may call it before `loadEnvFile()` runs. Fix: ensure `loadEnvFile()` is called at the top of `workshopCommand()` and `developCommand()` entry points.

### Alternatives Considered

1. **Cache the result lazily on first call** — Rejected: caching means if `.env` is loaded after the first check, the cached value is stale.
2. **Module-level initialization** — Rejected: module load order is non-deterministic across import graphs.

---

## Topic 3: Context Window Management (FR-016–FR-019)

### Decision: Deterministic `SummarizedPhaseContext` from structured session fields — no LLM call needed

### Rationale

Context summarization doesn't require an LLM call. Structured session fields (`businessContext`, `ideas`, `evaluation`, `selection`, `plan`) are already compact data. A `buildSummarizedContext()` function projects them into a ~200-line markdown block. This is deterministic, fast (<1ms), and testable.

### Alternatives Considered

1. **LLM summarization of prior turns** — Rejected for context building: adds latency (30s+), costs an API call per phase, and is non-deterministic.
2. **Truncate raw turns** — Rejected: arbitrary truncation loses coherence.
3. **SDK `infiniteSessions`** — Adopted as a supplementary measure, not the primary fix. Forward the same config used by Ralph Loop (`backgroundCompactionThreshold: 0.7`, `bufferExhaustionThreshold: 0.9`).

### Current Problem

Each phase handler builds ad-hoc context from only the immediately preceding phase's structured fields. If extraction failed, the next phase gets **no context at all**. The new `contextSummarizer.ts` replaces all ad-hoc context blocks with a unified, comprehensive summary that degrades gracefully when fields are null.

---

## Topic 4: MCP Tool Wiring in Workshop Flow (FR-011–FR-015)

### Decision: Create McpManager + WebSearchClient in `workshopCommandInner()`, extend `PhaseHandlerConfig`

### Rationale

The `loadMcpConfig()` and `McpManager` infrastructure already exists (Feature 003). The gap is purely wiring: `workshopCommand.ts` never creates an McpManager. The Design and Plan handlers need an optional MCP config parameter passed through `PhaseHandlerConfig`.

### Implementation Details

- `McpManager` created from `.vscode/mcp.json` via existing `loadMcpConfig()`.
- `WebSearchClient` created from Foundry env vars via `createWebSearchClient()` (already exists).
- `PhaseHandlerConfig` extended with `mcpManager?: McpManager` and `webSearchClient?: WebSearchClient`.
- Design handler: adds `postExtract` hook that queries Context7 for libraries referenced in `session.ideas`.
- Plan handler: adds `postExtract` hook that queries Azure MCP for services referenced in `session.plan.architectureNotes`.
- All calls wrap in try/catch for graceful degradation.

---

## Topic 5: Export Completeness (FR-020–FR-024)

### Decision: Remove early `return null` guards, add conversation-turn fallback to all 5 phase generators

### Rationale

The Discover generator already has conversation-turn fallback code. The same pattern is applied to Ideate, Design, Select, Plan, and Develop generators: wrap structured rendering in an `if` guard, always include conversation turns if they exist.

### Changes per generator

| Generator | Current guard                                        | Change                                                     |
| --------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| Ideate    | `if (!session.ideas?.length) return null`            | Remove; wrap idea rendering in `if`; add turn section      |
| Design    | `if (!session.evaluation) return null`               | Remove; wrap eval rendering in `if`; add turn section      |
| Select    | `if (!session.selection) return null`                | Remove; wrap selection rendering in `if`; add turn section |
| Plan      | `if (!session.plan?.milestones?.length) return null` | Remove; wrap milestone rendering in `if`; add turn section |
| Develop   | `if (!session.poc) return null`                      | Remove; wrap poc rendering in `if`; add turn section       |

---

## Topic 6: Phase Boundary Enforcement (FR-007b, FR-007c)

### Decision: Inject boundary instruction in `ConversationLoop` system prompt builder

### Rationale

The LLM drifted between phases during the assessment (Ideate → Design, Plan → Develop). A system prompt instruction prevents this without changing phase prompts individually.

### Implementation

In `ConversationLoop.run()`, after building the system prompt, append:

```
You are in the {phase} phase. Do NOT introduce or transition to the next phase. The user will be offered a decision gate when this phase is complete.
```

---

## Topic 7: Select Timeout Fallback (FR-019a)

### Decision: Minimal-context retry, then user-directed selection

### Rationale

If context summarization (FR-016–018) doesn't prevent the Select timeout, a secondary fallback retries with only structured session fields (no conversation turns at all). If that also fails, the system presents the top-ranked idea from Design and asks the user to confirm manually.

### Implementation

In `ConversationLoop.run()`, wrap the initial `streamResponse()` in a try/catch. On timeout:

1. Log the timeout.
2. Create a new session with minimal context (just structured fields from `SummarizedPhaseContext`).
3. Retry the initial message.
4. If retry also fails, emit a user-facing message asking for manual selection:
   "The AI could not process the selection. Based on the Design phase evaluation, the top-ranked idea is [X]. Would you like to confirm this selection? (y/N)"
