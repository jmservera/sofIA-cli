# Implementation Plan: Dev Resume & Hardening

**Branch**: `004-dev-resume-hardening` | **Date**: 2026-03-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-dev-resume-hardening/spec.md`

## Summary

Harden the `sofia dev` command for production use by implementing resume/checkpoint support (seeding `RalphLoop.run()` from persisted `session.poc.iterations`), fixing `--force` to reset both output directory and session state, introducing a template registry for multi-language PoC scaffolding (starting with `python-pytest`), increasing `testRunner.ts` coverage from 45% to 80%+, and adding workshop→dev transition guidance. The core change is making `RalphLoop` read existing iteration state on startup instead of always starting from `iterations = []`.

## Technical Context

**Language/Version**: TypeScript (ES2022 target) on Node.js ≥ 20 LTS, ESM (`"type": "module"`)  
**Primary Dependencies**: `@github/copilot-sdk` ^0.1.28, `commander` ^11.1.0, `zod` ^4.3.6, `pino` ^8.17.2, `ora` ^7.0.1, `chalk` ^5.2.0  
**Storage**: Local JSON files via `SessionStore` (atomic write-then-rename to `.sofia/sessions/<id>.json`)  
**Testing**: Vitest ^4.0.18 with `@vitest/coverage-v8`; `node-pty` ^1.0.0 for PTY E2E tests  
**Target Platform**: Linux/macOS/Windows CLI (Node.js LTS)  
**Project Type**: CLI application  
**Performance Goals**: Resume detection adds <500ms overhead to `sofia dev` startup (SC-004-007)  
**Constraints**: No breaking changes to session schema (`.passthrough()` ensures forward compatibility); template registry must be extensible without modifying core scaffolder/loop logic  
**Scale/Scope**: ~936 lines in `ralphLoop.ts`, ~267 lines in `testRunner.ts`, ~444 lines in `pocScaffolder.ts`, ~267 lines in `developCommand.ts`; 48 existing test files (33 unit, 11 integration, 3 E2E, 1 live)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Gate                            | Status  | Evidence                                                                                                                                                                                                                         |
| ------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Outcome-first discovery**     | ✅ PASS | Resume/checkpoint directly addresses user-reported pain (lost iteration progress on interruption). SC-004-001 through SC-004-007 define measurable outcomes tied to facilitator productivity.                                    |
| **Secure-by-default**           | ✅ PASS | No new secrets, tokens, or PII handling. Resume reads existing session state from local files already governed by least-privilege. Info-level resume logs contain only iteration numbers and decision flags — no sensitive data. |
| **Node.js + TypeScript**        | ✅ PASS | All implementation in TypeScript/Node.js using existing SDK patterns. Template registry extends current `PocScaffolder` without introducing new runtimes.                                                                        |
| **MCP-first**                   | ✅ PASS | No new external integrations introduced. Template registry is code-defined (internal). Existing MCP connections (GitHub, Context7) remain unchanged.                                                                             |
| **Test-first (NON-NEGOTIABLE)** | ✅ PASS | Spec mandates TDD via constitution. Every task phase starts with failing tests. US4 explicitly targets testRunner coverage from 45% → 80%+.                                                                                      |
| **CLI transparency**            | ✅ PASS | FR-007a mandates info-level resume decision logging. FR-005/FR-006 require clear completion/status messages. FR-020 requires actionable next-step guidance with exact command.                                                   |

All gates pass. No exceptions required.

## Project Structure

### Documentation (this feature)

```text
specs/004-dev-resume-hardening/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── cli/
│   └── developCommand.ts        # Modified: resume detection, --force session reset
├── develop/
│   ├── ralphLoop.ts             # Modified: seed iterations from session, skip scaffold
│   ├── pocScaffolder.ts         # Modified: extract template registry, add python-pytest
│   ├── templateRegistry.ts      # New: template registry with selection logic
│   └── testRunner.ts            # Unchanged (tests added, not code)
├── phases/
│   └── phaseHandlers.ts         # Modified: Plan phase → dev transition guidance
├── sessions/
│   └── sessionManager.ts        # Possibly modified: backtrack for --force poc reset
└── shared/
    └── schemas/
        └── session.ts           # Possibly extended: TechStack install/test commands

tests/
├── unit/
│   ├── cli/
│   │   └── developCommand.spec.ts     # Extended: resume + --force scenarios
│   └── develop/
│       ├── ralphLoop.spec.ts          # Extended: resume iteration seeding
│       ├── pocScaffolder.spec.ts      # Extended: template registry selection
│       └── templateRegistry.spec.ts   # New: registry unit tests
├── integration/
│   ├── ralphLoopFlow.spec.ts          # Extended: full resume flow
│   ├── ralphLoopPartial.spec.ts       # Extended: partial resume scenarios
│   └── testRunnerReal.spec.ts         # New: real fixture-based testRunner tests
├── e2e/
│   └── developPty.spec.ts            # New: PTY-based interactive E2E
└── fixtures/
    └── test-fixture-project/          # New: minimal Vitest project for testRunner tests
```

**Structure Decision**: Single project (Option 1) — consistent with existing repo layout. New files are limited to `templateRegistry.ts`, test files, and test fixture. All changes extend existing modules.

## Complexity Tracking

> No constitution violations. All gates pass.

## Post-Design Constitution Re-Check

_Re-evaluated after Phase 1 design artifacts (data-model.md, contracts/, quickstart.md)._

| Gate                            | Status  | Post-Design Evidence                                                                                                                                                    |
| ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Outcome-first discovery**     | ✅ PASS | CheckpointState derivation directly maps to resume UX outcomes. TemplateRegistry enables multi-language PoC — ties to broader workshop value.                           |
| **Secure-by-default**           | ✅ PASS | No new data flows. CheckpointState is derived from existing session data. Template registry is code-defined, no external fetches. TODO tracking scans local files only. |
| **Node.js + TypeScript**        | ✅ PASS | All new types (CheckpointState, TemplateEntry, TemplateRegistry) are TypeScript interfaces. No schema migration needed — existing Zod schemas support resume as-is.     |
| **MCP-first**                   | ✅ PASS | No new external integrations. Feature is internal hardening.                                                                                                            |
| **Test-first (NON-NEGOTIABLE)** | ✅ PASS | Quickstart outlines TDD workflow. TestFixtureProject entity provides real subprocess testing. Data model specifies testable derivation logic (deriveCheckpointState).   |
| **CLI transparency**            | ✅ PASS | Contracts define exact info-level log messages for every resume decision. Workshop→dev transition contract specifies exact command output.                              |

All gates pass post-design. No exceptions required.
