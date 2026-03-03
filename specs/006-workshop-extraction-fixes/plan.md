# Implementation Plan: Workshop Phase Extraction & Tool Wiring Fixes

**Branch**: `006-workshop-extraction-fixes` | **Date**: 2026-03-04 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-workshop-extraction-fixes/spec.md`

## Summary

Fix five systemic bugs discovered during the Zava Industries full-session assessment that prevent sofIA from: (1) reliably extracting structured data from LLM responses across all workshop phases, (2) recognizing web search configuration when `.env` is loaded after module import, (3) wiring MCP tools into the workshop flow, (4) managing context window growth across multi-phase sessions, and (5) exporting all phases regardless of structured data availability. The primary technical approach is a post-phase summarization LLM call for extraction, lazy env checking, McpManager/WebSearchClient wiring in workshopCommand, context summarization instead of raw turn injection, and conversation-fallback export generation.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS  
**Primary Dependencies**: `@github/copilot-sdk`, `zod` (schema validation), `marked`/`marked-terminal` (markdown rendering), `pino` (logging), `commander` (CLI), `dotenv` (.env loading)  
**Storage**: Single JSON file per session in `.sofia/sessions/<sessionId>.json`  
**Testing**: Vitest (unit + integration + live); 709 unit tests, 99 integration tests currently passing  
**Target Platform**: Linux/macOS/Windows (Node.js CLI)  
**Project Type**: CLI application  
**Performance Goals**: Phase summarization call must complete within 60 seconds; context summary generation adds <500ms to phase transitions  
**Constraints**: Copilot SDK `sendAndWait()` has a 120s timeout; session JSON files can grow to 100KB+ for multi-phase sessions  
**Scale/Scope**: 6 workshop phases, ~10–15 conversation turns per phase, 29 functional requirements across 6 categories

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Gate                            | Status  | Evidence                                                                                                                                                                         |
| ------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Outcome-first discovery**     | ✅ PASS | All 5 bugs directly prevent workshop artifacts from reaching users. SC-006 targets 75%+ assessment score (up from 53%).                                                          |
| **Secure-by-default**           | ✅ PASS | No new secrets/PII handling. `.env` loading respects existing `override: false` policy. MCP calls follow existing least-privilege patterns.                                      |
| **Node.js + TypeScript**        | ✅ PASS | All changes are TypeScript, aligned with existing Copilot SDK patterns. No new runtime dependencies required.                                                                    |
| **MCP-first**                   | ✅ PASS | FR-011–FR-015 wire existing MCP servers (Context7, Azure, WorkIQ) into workshop phases. No ad-hoc HTTP calls introduced.                                                         |
| **Test-first (NON-NEGOTIABLE)** | ✅ PASS | Each FR group will be implemented via Red→Green→Review. Failing tests written first for: summarization call, lazy env check, export fallback, context summarization, MCP wiring. |
| **CLI transparency**            | ✅ PASS | Summarization call progress surfaced via existing spinner. Export generates files for all phases. Phase boundary prompts improve UX predictability.                              |

## Project Structure

### Documentation (this feature)

```text
specs/006-workshop-extraction-fixes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── summarization-call.md
│   └── export-fallback.md
├── checklists/
│   └── requirements.md  # Quality checklist
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (files modified or created)

```text
src/
├── cli/
│   ├── workshopCommand.ts      # FR-011,012,012a: wire McpManager + WebSearchClient; FR-010: ensure loadEnvFile runs first
│   └── developCommand.ts       # FR-010: ensure loadEnvFile runs first
├── loop/
│   ├── conversationLoop.ts     # FR-001,006: add postPhaseSummarize(); FR-016–018: context summarization; FR-007b,c: phase boundary injection; FR-019a: timeout fallback
│   └── phaseSummarizer.ts      # NEW: summarization LLM call utility (FR-001–005)
├── mcp/
│   └── webSearch.ts            # FR-008,009: make isWebSearchConfigured() lazy
├── phases/
│   ├── phaseExtractors.ts      # FR-007: multi-JSON-block extraction; FR-007a: Mermaid extraction
│   ├── phaseHandlers.ts        # FR-013,014: Design/Plan accept MCP config; FR-007b: phase boundary in buildSystemPrompt
│   └── contextSummarizer.ts    # NEW: build SummarizedPhaseContext from session fields (FR-016–018)
├── sessions/
│   └── exportWriter.ts         # FR-020–024: conversation fallback export, summary.json enhancements
└── prompts/
    └── summarize/              # NEW: per-phase summarization prompts (FR-002)
        ├── ideate-summary.md
        ├── design-summary.md
        ├── select-summary.md
        ├── plan-summary.md
        └── develop-summary.md

tests/
├── unit/
│   ├── loop/
│   │   ├── phaseSummarizer.spec.ts         # Tests for summarization call
│   │   └── contextSummarizer.spec.ts       # Tests for context summarization
│   ├── mcp/
│   │   └── webSearch.spec.ts               # Tests for lazy isWebSearchConfigured
│   ├── phases/
│   │   ├── phaseExtractors.spec.ts         # Tests for multi-block extraction + Mermaid
│   │   └── phaseHandlers.spec.ts           # Tests for phase boundary injection, MCP config
│   └── sessions/
│       └── exportWriter.spec.ts            # Tests for conversation fallback export
├── integration/
│   ├── summarizationFlow.spec.ts           # Integration test: full summarize pipeline
│   └── exportFallbackFlow.spec.ts          # Integration test: export with null structured data
└── live/
    └── zavaFullWorkshop.spec.ts            # Updated Zava assessment test (regression)
```

**Structure Decision**: Single-project CLI structure preserved. Two new modules (`phaseSummarizer.ts`, `contextSummarizer.ts`) are extracted to avoid bloating `conversationLoop.ts`. New summarization prompts are placed under `src/prompts/summarize/` following the existing prompt organization pattern.

## Complexity Tracking

> No constitution violations. All gates pass.

## Constitution Re-Check (Post-Design)

| Gate                            | Status  | Evidence                                                                                                                                                                                                  |
| ------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Outcome-first discovery**     | ✅ PASS | Summarization call directly enables structured artifact extraction → export → `sofia dev` → user value. All changes tie to the 53%→75% assessment improvement goal.                                       |
| **Secure-by-default**           | ✅ PASS | Summarization call sends only conversation turns to the LLM (same data already in the system). No new secrets, PII, or external data paths introduced. MCP wiring uses existing least-privilege patterns. |
| **Node.js + TypeScript**        | ✅ PASS | Two new TypeScript modules (`phaseSummarizer.ts`, `contextSummarizer.ts`), 5 new prompt markdown files. All follow existing patterns.                                                                     |
| **MCP-first**                   | ✅ PASS | Design/Plan phases wired to use Context7 and Azure MCP via existing `McpManager`. No ad-hoc HTTP calls.                                                                                                   |
| **Test-first (NON-NEGOTIABLE)** | ✅ PASS | Each FR group has a dedicated test file. Failing tests written before implementation. Zava assessment test serves as regression gate.                                                                     |
| **CLI transparency**            | ✅ PASS | Summarization call uses existing spinner (`Thinking...`). Phase boundary prompt prevents confusing phase drift. Export includes all phases so users see full workshop output.                             |

## Generated Artifacts

| Artifact          | Path                                                                        | Description                                               |
| ----------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| Plan              | `specs/006-workshop-extraction-fixes/plan.md`                               | This file                                                 |
| Research          | `specs/006-workshop-extraction-fixes/research.md`                           | 7 research topics with decisions, rationale, alternatives |
| Data Model        | `specs/006-workshop-extraction-fixes/data-model.md`                         | 3 new entities, 0 schema changes, data flow diagram       |
| Contracts         | `specs/006-workshop-extraction-fixes/contracts/summarization-and-export.md` | Summarization call interface + export fallback contract   |
| Quickstart        | `specs/006-workshop-extraction-fixes/quickstart.md`                         | Development setup, file map, TDD workflow, verification   |
| Quality Checklist | `specs/006-workshop-extraction-fixes/checklists/requirements.md`            | Bug traceability + cross-spec gap coverage                |
