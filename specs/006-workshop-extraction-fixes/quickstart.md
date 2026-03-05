# Quickstart: Workshop Phase Extraction & Tool Wiring Fixes

**Feature**: 006-workshop-extraction-fixes  
**Date**: 2026-03-04

## Prerequisites

- Node.js 22 LTS
- GitHub Copilot CLI authenticated (`copilot auth login`)
- `.env` with `FOUNDRY_PROJECT_ENDPOINT` + `FOUNDRY_MODEL_DEPLOYMENT_NAME` (for web search)
- `.vscode/mcp.json` with MCP server configurations (for Context7, Azure, WorkIQ)

## Development Setup

```bash
git checkout 006-workshop-extraction-fixes
npm install
npm run build
```

## Key Files to Modify

### Phase 1: Lazy Web Search Config (BUG-001)

```
src/mcp/webSearch.ts          # isWebSearchConfigured() — already lazy, verify no caching
src/cli/workshopCommand.ts    # Ensure loadEnvFile() called at entry point
src/cli/developCommand.ts     # Same
```

### Phase 2: Phase Extraction Hardening (BUG-002)

```
src/loop/phaseSummarizer.ts   # NEW — post-phase summarization utility
src/phases/phaseExtractors.ts # extractAllJsonBlocks(), extractJsonBlockForSchema()
src/prompts/summarize/*.md    # NEW — per-phase summarization prompts (5 files)
src/loop/conversationLoop.ts  # Hook phaseSummarize() after while loop
```

### Phase 3: Context Window Management (BUG-003)

```
src/phases/contextSummarizer.ts  # NEW — buildSummarizedContext(), renderSummarizedContext()
src/phases/phaseHandlers.ts      # Replace ad-hoc context blocks with contextSummarizer
src/loop/conversationLoop.ts     # Add infiniteSessions + phase boundary injection
```

### Phase 4: MCP Tool Wiring (BUG-005)

```
src/cli/workshopCommand.ts     # Create McpManager, WebSearchClient; pass to handlers
src/phases/phaseHandlers.ts    # Extend PhaseHandlerConfig; Design/Plan accept MCP config
```

### Phase 5: Export Completeness (BUG-004)

```
src/sessions/exportWriter.ts   # Remove early-return guards, add conversation fallback
```

## Running Tests

```bash
# Unit tests (fast, ~10s)
npm run test:unit

# Integration tests (~15s)
npm run test:integration

# Live Zava assessment test (~13min, requires Copilot auth)
npm run test:live -- tests/live/zavaFullWorkshop.spec.ts

# Full suite
npm test
```

## TDD Workflow (per phase)

1. **Red**: Write failing tests in `tests/unit/` for the target FR group
2. **Green**: Implement minimum code to pass
3. **Review**: Run full suite (`npm test`), check `npm run typecheck` and `npm run lint`
4. Repeat for next FR group

## Verification

After all changes, run the Zava assessment test:

```bash
npm run test:live -- tests/live/zavaFullWorkshop.spec.ts
```

Expected improvement: assessment score from 53% → 75%+ (SC-006).

Key checks:

- `session.ideas` populated after Ideate (was null)
- `session.evaluation` populated after Design (was null)
- `session.selection` populated after Select (was null + timeout)
- `session.plan` populated after Plan (was null)
- Export produces 6 markdown files (was 1)
- Web search called during Discover (was skipped)
