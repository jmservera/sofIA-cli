# Data Model: PoC Generation & Ralph Loop

**Feature**: [spec.md](spec.md)
**Research**: [research.md](research.md)
**Date**: 2026-02-27

This document defines the entities introduced or extended by Feature 002. It builds on the Feature 001 data model and extends `PocDevelopmentState` and `PocIteration` with the fields needed for the Ralph loop.

## Entities Modified

### PocDevelopmentState (extended from 001)

Extends the entity defined in Feature 001's [data-model.md](../001-cli-workshop-rebuild/data-model.md) §13.

**Fields**
- `repoPath?: string` — local path to generated PoC directory (e.g., `./poc/<sessionId>/`)
- `repoUrl?: string` — GitHub URL if created via MCP
- `repoSource: "local" | "github-mcp"` — how the repo was created
- `techStack?: TechStack` — technology choices for the PoC
- `iterations: PocIteration[]` — iteration history (extended, see below)
- `finalStatus?: "success" | "failed" | "partial"` — extended with "partial" for max-iteration with some passing tests
- `terminationReason?: "tests-passing" | "max-iterations" | "user-stopped" | "error"` — why the loop ended
- `totalDurationMs?: number` — total wall-clock time for all iterations
- `finalTestResults?: TestResults` — test state at loop termination

**Validation rules**
- `repoPath` OR `repoUrl` must be set after first successful scaffold.
- `repoSource` is required once scaffolding completes.
- `finalStatus` is set only when the Ralph loop terminates.
- `terminationReason` is set alongside `finalStatus`.
- `iterations` must be ordered by `iteration` (1-indexed, monotonically increasing).

### PocIteration (extended from 001)

Extends the entity defined in Feature 001's [data-model.md](../001-cli-workshop-rebuild/data-model.md) §13.

**Fields**
- `iteration: number` — 1-indexed iteration counter
- `startedAt: string` — ISO-8601 timestamp
- `endedAt?: string` — ISO-8601 timestamp
- `outcome: "tests-passing" | "tests-failing" | "error" | "scaffold"` — what happened this iteration
- `changesSummary?: string` — human-readable description of what changed
- `filesChanged: string[]` — list of file paths created/modified in this iteration
- `testResults?: TestResults` — structured test execution results
- `errorMessage?: string` — error message if iteration failed with an error
- `llmPromptContext?: string` — summary of context sent to LLM (for auditability, not full prompt)

**Validation rules**
- `iteration` starts at 1, increments by 1.
- First iteration always has `outcome: "scaffold"`.
- `filesChanged` must be relative paths within the PoC directory.
- `testResults` is present when `outcome` is `"tests-passing"` or `"tests-failing"`.

## Entities Introduced

### TechStack

Captures the technology choices for the generated PoC. Determined during scaffolding from the session's `plan.architectureNotes` and `plan.dependencies`.

**Fields**
- `language: string` — primary language (e.g., "TypeScript", "Python")
- `framework?: string` — web framework or runtime (e.g., "Express", "FastAPI")
- `testRunner: string` — test runner command (e.g., "npm test", "pytest")
- `buildCommand?: string` — build command if applicable (e.g., "npm run build")
- `runtime: string` — runtime environment (e.g., "Node.js 20", "Python 3.11")

**Validation rules**
- `language` and `runtime` are required.
- `testRunner` is required — the Ralph loop cannot proceed without it.

### TestResults

Structured output from running the PoC's test suite.

**Fields**
- `passed: number` — count of passing tests
- `failed: number` — count of failing tests
- `skipped: number` — count of skipped tests
- `total: number` — total test count
- `durationMs: number` — test execution time
- `failures: TestFailure[]` — details of each failure (max 10 to avoid prompt bloat)
- `rawOutput?: string` — truncated raw test runner output (max 2000 chars)

**Validation rules**
- `total === passed + failed + skipped`.
- `failures.length <= failed` (may be truncated).
- `rawOutput` is truncated to 2000 characters from the end (tail).

### TestFailure

Individual test failure detail, fed back to the LLM as context for the next iteration.

**Fields**
- `testName: string` — name/path of the failing test
- `message: string` — assertion error or exception message
- `expected?: string` — expected value (if assertion failure)
- `actual?: string` — actual value (if assertion failure)
- `file?: string` — test file path
- `line?: number` — line number of failure

### ScaffoldTemplate

Describes a PoC scaffold template. Templates are defined programmatically (no external template files).

**Fields**
- `id: string` — template identifier (e.g., "node-typescript-express", "python-fastapi")
- `name: string` — human-readable name
- `language: string` — primary language
- `files: TemplateFile[]` — list of files to generate

### TemplateFile

A single file in a scaffold template.

**Fields**
- `path: string` — path relative to PoC root
- `content: string` — file content (may contain `{{placeholder}}` tokens)
- `skipIfExists: boolean` — whether to skip writing if file already exists (default: true)

## State Machine Extensions

The Develop phase now has internal sub-states managed by the Ralph loop:

```
Develop (entered) → Scaffolding → Iteration 1 → ... → Iteration N → Complete/Failed
```

Transitions within Develop:
- `Scaffolding`: Generate initial PoC project structure → outcome: "scaffold"
- `Iteration N` (N >= 2): Run tests → feed failures to LLM → generate fixes → outcome: "tests-passing" | "tests-failing" | "error"
- `Complete`: `finalStatus = "success"` when `terminationReason = "tests-passing"`
- `Failed`: `finalStatus = "failed"` when `terminationReason = "max-iterations" | "error"`
- `Partial`: `finalStatus = "partial"` when some tests pass but loop hit max iterations

## Relationships

```
WorkshopSession
├── selection: SelectedIdea        ← Input (from Feature 001)
├── plan: ImplementationPlan       ← Input (from Feature 001)
└── poc: PocDevelopmentState       ← Output (Feature 002)
    ├── techStack: TechStack
    ├── iterations[]: PocIteration
    │   ├── testResults?: TestResults
    │   │   └── failures[]: TestFailure
    │   └── filesChanged[]
    ├── finalTestResults?: TestResults
    └── terminationReason
```

## Export Extensions

The Develop section of `exports/<sessionId>/develop.md` should include:
- PoC repository location (path or URL)
- Technology stack summary
- Iteration timeline with outcomes
- Final test results
- Files generated/modified per iteration
- Termination reason
