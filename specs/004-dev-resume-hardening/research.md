# Research: Dev Resume & Hardening

**Feature**: 004-dev-resume-hardening  
**Date**: 2026-03-01  
**Status**: Complete — all unknowns resolved

## R1: Resume Iteration Seeding Strategy

**Decision**: Seed `iterations` from `session.poc.iterations` at `ralphLoop.ts` L183, derive `iterNum = iterations.length + 1`, conditionally skip scaffold/install.

**Rationale**: The `run()` method always initializes `iterations = []` (L183) and starts the iteration loop at `iterNum = 2` (L280). The session already persists `poc.iterations` via `onSessionUpdate` → `store.save()` after every iteration. The data needed for resume is already being written — it's just never read back. Seeding from session state is the minimal change with maximum correctness.

**Key insertion points**:

- L183: After `const iterations: PocIteration[] = []`, push from `session.poc.iterations` if present and `finalStatus` is unset
- L280: Change loop start from `iterNum = 2` to `iterNum = iterations.length + 1`
- L190-L271: Wrap scaffold + npm install in `if (iterations.length === 0)` guard
- L278-L279: Seed `prevFailingTests` from last iteration's `testResults.failures` on resume

**Alternatives considered**:

- **New `resume()` method on RalphLoop**: Rejected — would duplicate significant logic from `run()`. Better to make `run()` resume-aware.
- **Checkpoint file on disk**: Rejected — session JSON already contains all state needed. Adding a secondary checkpoint source creates consistency risks.

**Open design question resolved**: `maxIterations` counts _total_ iterations (not additional from resume point). If `maxIterations=10` and 3 completed, the loop runs iterations 4-10 (7 more). This matches the semantic "max iterations for this PoC" and prevents open-ended runs.

**Incomplete iteration handling** (FR-001a): If the last iteration in `session.poc.iterations` has no `testResults` (indicating mid-execution interruption), pop it from the seeded iterations so it gets re-run. Only fully completed iterations (with `testResults` or `outcome` set) are preserved.

## R2: `--force` Session State Reset

**Decision**: Direct mutation `session.poc = undefined` in `developCommand.ts` after `rmSync()`, followed by `store.save()`. Do not use `backtrackSession`.

**Rationale**: `backtrackSession(session, 'Develop')` is a no-op when `session.phase` is already `'Develop'` (same-phase check at sessionManager.ts L80-L84 returns without changes). The `--force` reset is a single-field operation within the current phase — directly clearing `session.poc` is simpler, more explicit, and avoids coupling to the backtrack function's cross-phase navigation semantics.

**Alternatives considered**:

- **`backtrackSession` with `clearCurrentPhase` option**: Rejected — adds complexity to a generic function for a specific use case. Backtrack is designed for phase navigation, not in-phase resets.
- **Delete and recreate session**: Rejected — would lose all workshop phases (Discover, Ideate, Design, Select, Plan). `--force` should only reset the PoC, preserving all prior work.

## R3: Template Registry Architecture

**Decision**: Create a `TemplateRegistry` map in a new `src/develop/templateRegistry.ts` module. `PocScaffolder` constructor already accepts `template?: TemplateFile[]` — the registry provides the lookup layer.

**Rationale**: The scaffolder's template injection point exists (`constructor(template?)`), `TemplateFile` interface is stable, and `TechStack` schema already supports the fields needed. The registry formalizes what's already implicit (hardcoded template selection) into an extensible pattern.

**Template entry shape**:

```typescript
export interface TemplateEntry {
  id: string; // e.g., 'node-ts-vitest', 'python-pytest'
  displayName: string; // e.g., 'TypeScript + Node.js + Vitest'
  files: TemplateFile[]; // scaffold file list
  techStack: TechStack; // includes language, runtime, testRunner, buildCommand
  installCommand: string; // e.g., 'npm install', 'pip install -r requirements.txt'
  testCommand: string; // e.g., 'npm test -- --reporter=json'
  matchPatterns: string[]; // keywords to match from architectureNotes
}
```

**Selection logic**: Scan `plan.architectureNotes` + `plan.dependencies` for `matchPatterns`. First match wins. Default: `node-ts-vitest`.

**`python-pytest` template files**: `.gitignore`, `requirements.txt`, `pytest.ini`, `README.md`, `src/__init__.py`, `src/main.py`, `tests/test_main.py`, `.sofia-metadata.json`.

**TechStack for Python**: `{ language: 'Python', runtime: 'Python 3.11', testRunner: 'pytest --tb=short -q --json-report', buildCommand: undefined, framework: undefined }`

**Alternatives considered**:

- **Auto-detection from plan (no registry)**: Rejected — fragile pattern matching without a structured lookup. Registry makes template addition declarative.
- **User-selectable template (CLI flag)**: Deferred — out of scope per spec. Registry enables this later without code changes.

## R4: TestRunner Command Configurability

**Decision**: Make test command configurable via `TestRunnerOptions.testCommand` (default: `'npm test -- --reporter=json'`). The `RalphLoop` passes the command from `TechStack.testRunner` or TemplateEntry.

**Rationale**: `spawnTests()` currently hardcodes `spawn('npm', ['test', '--', '--reporter=json'])`. For Python templates, the command would be `pytest --tb=short -q --json-report`. Rather than building separate parsers for each runner, make the command configurable and keep the JSON parsing generic — both Vitest and pytest can produce JSON output.

**Test strategy for coverage hardening**:

- Make `extractJson` and `buildErrorResult` `protected` (like `parseOutput` already is)
- Create test fixture files with sample Vitest JSON output (passing, failing, mixed, garbled)
- Use `child_process.spawn` mocking OR a real minimal project in `tests/fixtures/` for integration tests
- FR-019 requires real fixture — create `tests/fixtures/test-fixture-project/` with a minimal Vitest project

**Alternatives considered**:

- **Strategy pattern per runner**: Rejected for now — over-engineering. JSON output parsing can be generic. If pytest JSON format differs significantly, add a `parseStrategy` option later.
- **Test `spawnTests` via shell script fixture**: Rejected — too fragile across platforms. Real Vitest project is more reliable.

## R5: Workshop → Dev Transition

**Decision**: Insert guidance message in `workshopCommand.ts` when `getNextPhase(phase)` returns `'Develop'`, after the Plan decision gate. Show exact command `sofia dev --session <id>`. Optionally offer auto-transition in interactive mode (FR-021, SHOULD).

**Rationale**: The Plan → Develop boundary is where the workshop's conversational flow hands off to the RalphLoop's iterative code generation. The boundary handler at phaseHandlers.ts L283-L286 already comments that PoC generation uses `sofia dev`. Making this guidance explicit helps users complete the workflow.

**Insertion point**: `workshopCommand.ts` inside the `case 'continue'` block, when `next === 'Develop'`.

**Alternatives considered**:

- **Auto-transition always**: Rejected — breaks the two-command separation of concerns. Users may want to review the plan before generating code.
- **Display in phase handler instead of workshop command**: Rejected — phase handlers don't have access to the IO context for rich terminal rendering. The workshop command is the right orchestration layer.

## R6: `.sofia-metadata.json` TODO Tracking

**Decision**: Extend metadata JSON schema with a `todos` section. Scan template files at scaffold time for `TODO:` markers. After each RalphLoop iteration, rescan and update counts.

**Rationale**: The metadata file is already written at scaffold time (pocScaffolder.ts L243-L260), excluded from code generation (codeGenerator.ts L112), and used as a resume marker (developCommand.ts L160). Extending it with TODO tracking is a natural fit.

**Schema extension**:

```json
{
  "todos": {
    "totalInitial": 3,
    "remaining": 1,
    "markers": ["src/main.py:12: TODO: Implement business logic"]
  }
}
```

**Alternatives considered**:

- **Separate `.sofia-todos.json` file**: Rejected — adds another file to manage. Metadata is already the canonical per-PoC state file.
- **Track in session JSON instead**: Rejected — TODOs are file-system artifacts, not session-level state. Metadata file is co-located with the scaffold output.

## R7: Existing Test Infrastructure

**Decision**: Follow existing test patterns: unit tests in `tests/unit/develop/`, integration in `tests/integration/`, E2E with `node-pty` in `tests/e2e/`. Use Vitest `vi.mock()` at module boundaries.

**Rationale**: 48 test files already establish clear conventions. Unit tests mock at module boundaries using `vi.mock()`. Integration tests use fake IO contexts and deterministic session objects. E2E tests use `node-pty` for PTY simulation (already a dev dependency).

**Key test files to extend**:

- `tests/unit/develop/ralphLoop.spec.ts` — add resume iteration seeding tests
- `tests/unit/cli/developCommand.spec.ts` — add --force reset tests
- `tests/integration/ralphLoopPartial.spec.ts` — add full resume flow tests

**New test files**:

- `tests/unit/develop/templateRegistry.spec.ts` — registry selection logic
- `tests/integration/testRunnerReal.spec.ts` — fixture-based testRunner tests
- `tests/e2e/developPty.spec.ts` — PTY-based interactive E2E
- `tests/fixtures/test-fixture-project/` — minimal Vitest project for testRunner tests
