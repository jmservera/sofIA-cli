# Feature Specification: Dev Resume & Hardening

**Feature Branch**: `004-dev-resume-hardening`  
**Created**: 2026-03-01  
**Status**: Draft  
**Upstream Dependency**: specs/002-poc-generation/spec.md (Ralph Loop, `--force`, testRunner, scaffolder), specs/003-mcp-transport-integration/spec.md (MCP transport layer)  
**Input**: User description: "Implement dev command resume/checkpoint, --force flag, testRunner coverage hardening, PoC template selection, and other deferred P2/P3 gaps from Feature 003 spec"

## Overview

Feature 002 built the PoC generation pipeline, and Feature 003 wires it to real MCP servers. This feature hardens the `sofia dev` command for production use by implementing the resume/checkpoint flow, honoring the `--force` flag, expanding test coverage for `testRunner.ts`, introducing a template registry for multi-language PoC scaffolding, and adding interactive E2E tests.

Currently, running `sofia dev --session X` a second time re-scaffolds everything from scratch despite the CLI displaying a "Resume" suggestion. The `--force` flag deletes the output directory but does not reset session state. The test runner has significant untested code paths at 45% coverage. The scaffolder is locked to a single TypeScript/Vitest template regardless of the plan's architecture notes.

**Gaps addressed**: GAP-006 (P2, resume/checkpoint), GAP-007 (P2, `--force`), GAP-008 (P2, testRunner coverage), GAP-009 (P2, template selection), GAP-009 (P3, scaffold TODOs), GAP-010 (P3, PTY E2E), GAP-011 (P3, workshop→develop transition) from `specs/003-next-spec-gaps.md`.

## Clarifications

### Session 2026-03-01

- Q: When resuming after an interruption mid-iteration, should the system re-run the incomplete iteration or skip to N+1? → A: Re-run the last iteration if it has no test results (was interrupted mid-execution); skip to N+1 only if the iteration completed fully.
- Q: Should npm install be skipped on resume if node_modules exists? → A: Always re-run npm install on resume — it's idempotent and avoids stale dependency issues from mid-iteration interruptions.
- Q: Should the template define the test command or should the test runner auto-detect it? → A: Template defines both install and test commands in TechStack — single source of truth, no auto-detection.
- Q: Should resume decisions (skip scaffold, re-run iteration, re-run install) be logged? → A: Log all resume decisions at info level (visible by default) for user confidence and debugging.
- Q: What adjacent concerns should be explicitly out of scope? → A: Multi-session dev, cloud-based resume, template marketplace, and Python test runner integration are all out of scope.

## Out of Scope

The following concerns are explicitly excluded from this feature:

- **Multi-session development** — Running `sofia dev` on multiple sessions simultaneously is not supported; resume is single-session only.
- **Cloud-based resume** — Checkpoint state is local to the machine; syncing resume state across machines (e.g., via GitHub or cloud storage) is deferred.
- **Template marketplace** — User-contributed or externally hosted templates are not supported; the template registry is internal and code-defined.
- **Python test runner integration** — While the `python-pytest` scaffold template is in scope, adapting `testRunner.ts` to parse pytest's JSON output format is deferred. The Python template will use a test command format compatible with the existing JSON parser (e.g., pytest with `--json-report` plugin producing a compatible shape).

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Resume an Interrupted PoC Session (Priority: P1)

As a facilitator who ran `sofia dev` and it was interrupted (Ctrl+C, network failure, LLM error), I want to run `sofia dev --session X` again and have it continue from where it left off — skipping scaffolding and npm install, resuming from the next iteration number — so that I don't lose progress and can reach a working PoC faster.

**Why this priority**: The CLI already advertises "Resume: sofia dev --session X" in its recovery message, but the command doesn't actually resume. This is the largest usability gap — users who encounter any interruption lose all iteration progress.

**Independent Test**: Run `sofia dev` on a session, interrupt after 2 iterations, re-run `sofia dev --session X`, and verify it starts from iteration 3 without re-scaffolding or re-running npm install.

**Acceptance Scenarios**:

1. **Given** a session with `poc.iterations` containing 2 completed iterations and `poc.finalStatus` unset, **When** the user runs `sofia dev --session X`, **Then** the Ralph Loop detects the existing iterations, skips scaffolding and npm install, and begins iteration 3 from the last known test results.
2. **Given** a session with `poc.finalStatus` set to `'success'`, **When** the user runs `sofia dev --session X`, **Then** the CLI displays a message indicating the PoC is already complete and exits without re-running the Ralph Loop.
3. **Given** a session with `poc.finalStatus` set to `'failed'` or `'partial'`, **When** the user runs `sofia dev --session X`, **Then** the CLI offers to resume from the last iteration or start fresh, defaulting to resume.
4. **Given** a session with existing iterations but the output directory is missing, **When** the user runs `sofia dev --session X`, **Then** the system re-scaffolds (using the original plan context) but preserves the iteration history for LLM context continuity.

---

### User Story 2 — Force-Restart a PoC Session (Priority: P1)

As a facilitator who wants to discard a previous PoC attempt and start completely fresh, I want to run `sofia dev --session X --force` and have it delete all prior output and reset PoC state, so that I get a clean slate without needing to create a new session.

**Why this priority**: The `--force` flag is already declared in the CLI and referenced in the recovery message, but it only partially works (deletes output directory without resetting session state). This creates a confusing state where files are gone but the session still references old iterations.

**Independent Test**: Run `sofia dev --session X` to create output, then run `sofia dev --session X --force`, and verify both the output directory and session's `poc.iterations` are reset to empty.

**Acceptance Scenarios**:

1. **Given** a session with existing `poc.iterations` and an output directory, **When** the user runs `sofia dev --session X --force`, **Then** the output directory is deleted, `poc.iterations` is reset to an empty array, `poc.finalStatus` is cleared, and the Ralph Loop starts fresh from iteration 1.
2. **Given** a session with no prior PoC state, **When** the user runs `sofia dev --session X --force`, **Then** it behaves identically to a first run (no error, no special message).
3. **Given** the `--force` flag is used on a session with `poc.finalStatus` set to `'success'`, **When** the command runs, **Then** it clears the success state and starts fresh without prompting for confirmation.

---

### User Story 3 — PoC Template Selection Based on Plan (Priority: P2)

As a facilitator whose plan specifies Python/FastAPI architecture, I want the scaffolder to generate a Python project with pytest instead of always generating TypeScript/Vitest, so that the PoC matches the planned technology stack.

**Why this priority**: Currently the scaffolder is hardcoded to TypeScript/Vitest regardless of the plan's `architectureNotes` or `dependencies`. This limits the PoC's usefulness when the plan targets a different technology. However, the core Ralph Loop works with any single template, making this an enhancement rather than a blocker.

**Independent Test**: Create a session with a plan specifying Python + FastAPI in its architecture notes, run `sofia dev`, and verify the scaffolder generates `requirements.txt`, `main.py`, `test_main.py` with pytest instead of `package.json` and TypeScript files.

**Acceptance Scenarios**:

1. **Given** a plan with `architectureNotes` mentioning "Python" or "FastAPI", **When** the scaffolder runs, **Then** it selects the `python-pytest` template and generates a Python project structure.
2. **Given** a plan with `architectureNotes` mentioning "TypeScript" or "Node.js" or no specific language, **When** the scaffolder runs, **Then** it uses the default `node-ts-vitest` template (current behavior preserved).
3. **Given** a plan with ambiguous architecture notes (e.g., "could be Python or TypeScript"), **When** the scaffolder runs, **Then** it defaults to `node-ts-vitest` and logs which template was selected and why.
4. **Given** a template registry with registered templates, **When** a new template is added, **Then** it only requires adding a new entry to the registry — no changes to the scaffolder's core logic.

---

### User Story 4 — TestRunner Coverage Hardening (Priority: P2)

As a developer maintaining sofIA, I want the test runner's critical code paths (subprocess spawning, output parsing, timeout handling) to be covered by integration tests, so that regressions in the test execution pipeline are caught early.

**Why this priority**: The test runner is at 45% coverage with critical untested paths including the child process spawning mechanism, output parsing fallbacks, and timeout error handling. These paths are exercised in every Ralph Loop iteration, making regressions high-impact but currently invisible.

**Independent Test**: Run the test runner integration tests against a tiny Vitest/pytest project fixture and verify all code paths are exercised including timeout, SIGTERM/SIGKILL, malformed output, and mixed stdout/JSON scenarios.

**Acceptance Scenarios**:

1. **Given** a test fixture project with passing tests, **When** the test runner executes, **Then** it correctly parses the JSON reporter output and returns accurate pass/fail/skip counts.
2. **Given** a test fixture project with a test that hangs indefinitely, **When** the test runner's timeout fires, **Then** it sends SIGTERM, waits 5 seconds, sends SIGKILL if needed, and returns a timeout-classified error result.
3. **Given** test output containing mixed console logs and JSON, **When** `extractJson()` parses the output, **Then** the fallback path (first `{` to last `}`) successfully extracts the JSON report.
4. **Given** test output containing no valid JSON at all, **When** `extractJson()` is called, **Then** it returns null and the caller produces a zero-count result with raw output preserved.

---

### User Story 5 — PTY-Based Interactive E2E Tests (Priority: P3)

As a developer, I want PTY-based E2E tests for the `sofia dev` command that verify interactive behavior (Ctrl+C handling, spinner display, progress output), so that the user's terminal experience is validated in CI.

**Why this priority**: Interactive behavior bugs (hanging spinners, swallowed Ctrl+C, garbled progress output) are invisible to the current E2E tests which use function calls. This is a quality-of-life improvement for developers but doesn't block production functionality.

**Independent Test**: Run PTY-based tests that spawn `sofia dev` as a subprocess, send Ctrl+C, and verify the process exits cleanly with the expected recovery message.

**Acceptance Scenarios**:

1. **Given** a PTY-spawned `sofia dev` process, **When** Ctrl+C is sent during an iteration, **Then** the process exits with the recovery message and a zero exit code.
2. **Given** a PTY-spawned `sofia dev` process, **When** the Ralph Loop progresses through iterations, **Then** the terminal displays iteration progress (e.g., "Iteration 2/10: Running tests…") readable from the PTY output buffer.

---

### User Story 6 — Workshop-to-Dev Transition Clarity (Priority: P3)

As a facilitator completing the Plan phase in `sofia workshop`, I want a clear indication of how to proceed to PoC development — whether via an automatic transition or explicit guidance to run `sofia dev` — so that the workflow feels intentional rather than abandoned after planning.

**Why this priority**: The current boundary prompt in the workshop only captures PoC intent without invoking the Ralph Loop. Users may not realize they need to run a separate command. However, the two-command workflow may be intentional for separation of concerns.

**Independent Test**: Complete all workshop phases through Plan, verify the workshop provides clear next-step guidance including the exact `sofia dev` command to run with the session ID.

**Acceptance Scenarios**:

1. **Given** a workshop session completing the Plan phase, **When** the plan is finalized, **Then** the workshop displays the exact `sofia dev --session <id>` command to run next, along with a brief explanation of what it does.
2. **Given** a workshop session completing the Plan phase, **When** the user is in interactive mode, **Then** the workshop offers: (a) automatically start development, or (b) save the session and exit with the `sofia dev` command displayed.

---

### Edge Cases

- What if the output directory exists but has been manually modified? Resume should detect file integrity via the `.sofia-metadata.json` marker and warn if unexpected changes are found.
- What if `poc.iterations` is corrupted or has invalid entries? The resume logic should validate iteration data and fall back to starting fresh if integrity checks fail.
- What if the user interrupts during npm install on a resumed session? The system should handle partial `node_modules` gracefully — either detect incomplete install or always re-run npm install on resume.
- How should the template registry handle unknown plan architectures? Fall back to the default `node-ts-vitest` template with a logged warning.
- What if a PTY E2E test environment doesn't support PTY allocation (e.g., some CI runners)? Tests must skip gracefully with a clear skip message.

## Requirements _(mandatory)_

### Functional Requirements

#### Resume/Checkpoint (GAP-006)

- **FR-001**: `RalphLoop.run()` MUST check `session.poc.iterations` at startup. If iterations exist and `session.poc.finalStatus` is unset, it MUST resume from the next iteration number rather than starting from scratch.
- **FR-001a**: When resuming, if the last recorded iteration has no test results (indicating it was interrupted mid-execution), the system MUST re-run that iteration from the last known-good state. Only fully completed iterations (with test results recorded) are considered done.
- **FR-002**: When resuming, the Ralph Loop MUST skip scaffolding if the output directory exists and contains a valid `.sofia-metadata.json` marker.
- **FR-003**: When resuming, the Ralph Loop MUST always re-run the dependency installation step (e.g., `npm install`). This is idempotent when dependencies haven't changed and avoids stale dependency issues when a prior iteration added packages before an interruption.
- **FR-004**: When resuming, the Ralph Loop MUST include prior iteration history (test results, applied changes) in the LLM prompt context so the model understands what has already been tried.
- **FR-005**: If `session.poc.finalStatus` is `'success'`, the CLI MUST display a completion message and exit without invoking the Ralph Loop.
- **FR-006**: If `session.poc.finalStatus` is `'failed'` or `'partial'`, the CLI MUST default to resuming from the last iteration and allow the user to override with `--force`.
- **FR-007**: If the output directory is missing but iterations exist in the session, the system MUST re-scaffold (using the original plan context) and resume iteration numbering from where it left off.
- **FR-007a**: All resume decisions MUST be logged at info level (visible by default), including: which iteration is being resumed from, whether an incomplete iteration is being re-run, whether scaffolding is being skipped, and that npm install is being re-run. These messages MUST be visible to the user without requiring `--debug`.

#### `--force` Flag (GAP-007)

- **FR-008**: When `--force` is set, the command handler MUST delete the existing output directory AND reset `session.poc.iterations` to an empty array AND clear `session.poc.finalStatus`.
- **FR-009**: After a force-reset, the Ralph Loop MUST start fresh from iteration 1 as if the session had never been developed.
- **FR-010**: The `--force` flag MUST work regardless of the current `poc.finalStatus` value (including `'success'`).

#### Template Registry (GAP-009)

- **FR-011**: The scaffolder MUST use a template registry that maps plan characteristics (language, framework) to scaffold templates.
- **FR-012**: The template registry MUST include at least two templates: `node-ts-vitest` (TypeScript/Node.js/Vitest, current default) and `python-pytest` (Python/pytest).
- **FR-013**: Template selection MUST be automatic based on the plan's `architectureNotes` and `dependencies`, with `node-ts-vitest` as the fallback default.
- **FR-014**: Each template MUST define: file list, `TechStack` configuration (language, runtime, test runner command, build command, dependency install command), and test execution command. Both the install and test commands are part of the template — the test runner MUST NOT auto-detect them.
- **FR-015**: Adding a new template MUST only require adding a registry entry — no changes to `PocScaffolder`'s core logic or `RalphLoop`'s iteration logic.

#### TestRunner Coverage (GAP-008)

- **FR-016**: Integration tests MUST cover the `spawnTests()` method including: successful test execution, timeout handling (SIGTERM then SIGKILL), and stderr collection.
- **FR-017**: Integration tests MUST cover the `extractJson()` fallback path where line-by-line parsing fails and the first-`{`-to-last-`}` slice is used.
- **FR-018**: Integration tests MUST cover the `buildErrorResult()` timeout path.
- **FR-019**: TestRunner integration tests MUST use a real test fixture project (minimal Vitest/pytest project) rather than mocking the subprocess.

#### Workshop→Dev Transition (GAP-011)

- **FR-020**: When the workshop Plan phase completes, the system MUST display the exact `sofia dev --session <id>` command needed to start PoC development.
- **FR-021**: In interactive mode, the workshop SHOULD offer to automatically transition to the development phase.

#### Scaffold TODO Tracking (GAP-009, P3)

- **FR-022**: Generated scaffold files containing intentional TODO markers MUST be tracked via `.sofia-metadata.json` so that the Ralph Loop can report how many TODOs remain at the end of each iteration.

### Key Entities

- **CheckpointState**: Represents the resume context derived from existing `session.poc` — includes last iteration number, whether scaffolding/install can be skipped, and prior iteration history for LLM context.
- **TemplateRegistry**: Maps plan characteristics to scaffold templates. Contains named template entries with file lists, tech stack configuration, and installation commands.
- **TemplateEntry**: A single scaffold template definition — includes template name (e.g., `node-ts-vitest`, `python-pytest`), file generators, TechStack shape, and install command.
- **TestFixtureProject**: A minimal project used by testRunner integration tests — contains a `package.json`, a passing test, a failing test, and a hanging test for timeout validation.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-004-001**: A `sofia dev --session X` run after an interruption resumes from the correct iteration number (e.g., iteration 3 if 2 were completed), measured by verifying the iteration counter in session state and the absence of scaffolding logs.
- **SC-004-002**: `sofia dev --session X --force` resets both the output directory and session `poc.iterations`/`poc.finalStatus`, measured by verifying empty iteration state after force.
- **SC-004-003**: The scaffolder produces a valid Python/pytest project when the plan specifies Python/FastAPI, measured by generating `requirements.txt`, `main.py`, and `pytest`-based tests that pass basic syntax validation.
- **SC-004-004**: `testRunner.ts` test coverage increases from 45% to at least 80%, measured by the coverage report.
- **SC-004-005**: A resumed Ralph Loop session reaches the same or better PoC quality (pass rate) as a fresh run, measured by comparing test pass counts between resumed and fresh runs on the same plan.
- **SC-004-006**: The workshop displays actionable next-step guidance (including the exact command) when the Plan phase completes, measured by verifying the output contains the session ID and `sofia dev` command.
- **SC-004-007**: Resume detection adds less than 500ms overhead to the `sofia dev` startup time, measured by comparing startup times with and without existing iterations.

## Assumptions

- Feature 002 session schema (`poc.iterations`, `poc.finalStatus`) is stable and does not require migration for resume support — only reading existing fields that are currently written but never read back.
- The `.sofia-metadata.json` file written by the scaffolder is a reliable marker for detecting existing scaffold output.
- npm install is always re-run on resume since it's idempotent (fast no-op when dependencies match) and avoids hard-to-diagnose stale dependency issues from interrupted iterations.
- Python/FastAPI is the highest-value second template based on user demand and workshop feedback.
- PTY allocation is available in the CI environment for E2E tests; tests skip gracefully if PTY is unavailable.
- The two-command workflow (`workshop` then `dev`) is the intentional default; auto-transition in interactive mode is optional behavior.

## Dependencies

- **Feature 001**: Session model, workshop phases
- **Feature 002**: Ralph Loop, `--force` CLI option, testRunner, PocScaffolder, session schemas
- **Feature 003**: MCP transport layer (resume should work with both stub and real MCP; template registry should support templates for MCP-enabled vs local-only PoCs)
