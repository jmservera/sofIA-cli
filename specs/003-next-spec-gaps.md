# Next Spec: Gaps & Deferred Work from Feature 002

**Date**: 2026-02-28
**Source**: Post-implementation review of specs/002-poc-generation/
**Purpose**: Capture outstanding gaps, stubs, and deferred items that must be addressed in the next feature spec(s).

---

## P1 — Blocking for Production

### GAP-001: MCP Tool Invocation Layer

`McpManager` ([src/mcp/mcpManager.ts](../src/mcp/mcpManager.ts)) tracks configuration and connection status but provides **no `callTool()` method**. Every component that needs to invoke an MCP tool (GitHub adapter, Context7 enricher, Azure enricher, web search enricher) currently simulates the call with hardcoded responses.

**Impact**: None of the MCP integrations actually work in production.

**Files affected**:

- `src/mcp/mcpManager.ts` — needs a `callTool(serverName, toolName, args)` method
- `src/develop/githubMcpAdapter.ts` — `createRepository()` and `pushFiles()` return fake data
- `src/develop/mcpContextEnricher.ts` — `queryContext7()`, `queryAzureMcp()`, `queryWebSearch()` all return hardcoded strings

**Recommendation**: Feature 003 should implement a generic `McpManager.callTool()` that connects to the configured MCP server, invokes the named tool with arguments, and returns structured results. Then update all adapters/enrichers to use it.

### GAP-002: GitHub MCP Adapter — Real Integration

[src/develop/githubMcpAdapter.ts](../src/develop/githubMcpAdapter.ts) lines 82–88 and 111–118:

- `createRepository()` returns a fake URL (`https://github.com/poc-owner/...`) instead of calling the `create_repository` MCP tool.
- `pushFiles()` returns a random fake SHA instead of calling `create_or_update_file` MCP tools.

**Recommendation**: Wire to real GitHub MCP tools once GAP-001 is resolved. Add live integration tests gated behind an environment flag.

### GAP-003: GitHub Adapter pushFiles Sends Empty Content

[src/develop/ralphLoop.ts](../src/develop/ralphLoop.ts) lines 459–462: when calling `pushFiles`, the file list maps written files with `content: ''` (empty string). Even once the adapter is wired to real MCP, it would push empty files.

**Fix**: Read file content from disk before pushing, or pass content through from `CodeGenerator` output.

### GAP-004: Context7 / Azure MCP / Web Search Enrichment — Real Integration

[src/develop/mcpContextEnricher.ts](../src/develop/mcpContextEnricher.ts):

- `queryContext7()` (L127–152) returns hardcoded npmjs.com links based on dependency names instead of calling Context7 MCP
- `queryAzureMcp()` (L158–176) returns hardcoded guidance strings based on keyword detection instead of calling Azure/Microsoft Docs MCP
- `queryWebSearch()` (L183–195) returns a placeholder "no results" string instead of calling `web.search`

**Recommendation**: Implement real MCP tool calls via GAP-001's `callTool()`. Add graceful degradation tests with real (but optional) MCP servers.

---

## P2 — Important, Workarounds Exist

### GAP-005: No Resume/Checkpoint for `sofia dev`

`RalphLoop.run()` always starts from scratch: scaffold → install → iterate. There is no detection of an existing PoC directory or prior `poc.iterations` state. Running `sofia dev --session X` a second time re-scaffolds everything.

The CLI recovery message at [src/cli/developCommand.ts](../src/cli/developCommand.ts) L211–213 suggests "Resume: sofia dev --session ..." but the command does not actually resume.

**Recommendation**: Detect existing PoC output and `poc.iterations` in the session. If found, skip scaffolding and resume from the last iteration number. Honor `--force` to override this.

### GAP-006: `--force` Flag Declared but Not Implemented

`developCommand.ts` declares the `--force` option in `DevelopCommandOptions` and it's accepted by the CLI, but the flag is never read or acted upon in the command handler.

**Recommendation**: When `--force` is set, delete the existing output directory and reset `poc.iterations` before starting.

### GAP-007: testRunner.ts at 45% Coverage

[src/develop/testRunner.ts](../src/develop/testRunner.ts) has significant untested code paths:

- `spawnTests()` method (L71–151) — child process spawning, stdout/stderr collection, timeout/SIGTERM/SIGKILL
- `extractJson()` fallback path (L220–221) — parsing JSON from mixed output
- `buildErrorResult()` private method (L256) — timeout-triggered error path

**Recommendation**: Add integration tests that spawn a real test process (e.g., a tiny Vitest project) to cover these paths. Consider extracting the spawn logic into a testable wrapper.

### GAP-008: PoC Template Selection Not Finalized

The plan notes "v1 targets TypeScript + Vitest PoCs only (template: `node-ts-vitest`); other templates deferred." The spec's Open Items section asks to "Finalize the PoC repo technology templates and how they map from the plan's architecture notes."

Currently `PocScaffolder` always generates a Node.js/TypeScript/Vitest project regardless of what the plan's `architectureNotes` or `dependencies` specify.

**Recommendation**: Define a template registry mapping plan characteristics (language, framework) to scaffold templates. Start with Python/FastAPI as the next template.

---

## P3 — Nice-to-Have / Deferred

### GAP-009: Generated Scaffold Contains Intentional TODOs

[src/develop/pocScaffolder.ts](../src/develop/pocScaffolder.ts):

- L195: generated `src/index.ts` contains `TODO: Implement the core functionality`
- L233: generated test contains `TODO: sofIA Ralph loop will refine this test`

These are intentional — the Ralph loop is expected to replace them. Not a bug, but worth noting for template quality tracking.

### GAP-010: PTY-Based Interactive E2E Tests for `sofia dev`

The `sofia dev` command lacks PTY-based interactive E2E tests (Ctrl+C handling, spinner output, progress display). The existing E2E tests in `developE2e.spec.ts` test via function calls, not CLI subprocess interaction.

**Recommendation**: Add PTY tests similar to `newSession.e2e.spec.ts` for the dev command interactive scenarios.

### GAP-011: Workshop Develop Phase Transition

The `workshop` command can run through Discover → Ideate → Design → Select → Plan, but transitioning from Plan into Develop within the workshop flow (rather than via `sofia dev`) is handled by a boundary prompt (`develop-boundary.md`) that only captures PoC intent. The actual Ralph loop is only triggered via the standalone `sofia dev` command.

**Recommendation**: Consider whether the workshop command should auto-invoke the Ralph loop after Plan completion, or if the two-command workflow (`workshop` then `dev`) is intentional and should be documented more prominently.

---

## Spec Open Items — Resolution Status

From [specs/002-poc-generation/spec.md](002-poc-generation/spec.md) "Open Items":

| #   | Open Item                                                       | Status                                                                                                   |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Finalize the PoC repo technology templates                      | **Open** — only `node-ts-vitest` exists (see GAP-008)                                                    |
| 2   | Define the exact shape of `PocDevelopmentState` fields          | **Resolved** — fully defined in Zod schemas                                                              |
| 3   | Confirm which parts of Ralph loop run locally vs via GitHub MCP | **Partially resolved** — architecture is correct but MCP path is simulated (see GAP-001 through GAP-004) |

---

## Suggested Next Feature Spec: `003-mcp-integration`

Based on the gaps above, the next feature should focus on:

1. **Generic MCP tool invocation** — `McpManager.callTool()` with typed results, retries, timeouts
2. **GitHub MCP real integration** — create repo, push files, with auth flow
3. **Context7 real integration** — library documentation lookup for PoC dependencies
4. **Azure/Microsoft Docs MCP integration** — architecture guidance for Azure-based plans
5. **Web search integration** — research when Ralph loop iterations get stuck
6. **Dev command resume/force** — checkpoint detection and `--force` overwrite
7. **Additional scaffold templates** — Python/FastAPI as second template
8. **TestRunner coverage hardening** — spawn-based integration tests
