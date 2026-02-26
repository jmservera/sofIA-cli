# Implementation Plan: sofIA Unified Build-From-Scratch CLI

**Branch**: `001-cli-workshop-rebuild` | **Date**: 2026-02-26 | **Spec**: ./spec.md  
**Input**: Feature specification from `specs/001-cli-workshop-rebuild/spec.md`

**Plan outputs created by this workflow**:

- Phase 0: ./research.md
- Phase 1: ./data-model.md, ./quickstart.md, ./contracts/*

## Summary

Build a Node.js + TypeScript GitHub Copilot SDK CLI that runs the full workshop lifecycle end-to-end (Discover → Ideate → Design → Select → Plan → Develop) with governed phase decision gates, repo-local session persistence, robust recovery, and deterministic automated testability (including PTY-based interactive harness).

Transparency UX: provide a user-visible **reasoning/rationale view** as structured summaries (why we’re asking, what we inferred, what trade-offs we made), plus an **activity/telemetry stream** (phase state, tool usage, progress, retries) and an optional debug log.

Note: even though the constitution no longer forbids it, this plan does **not** include displaying raw hidden model chain-of-thought; instead it provides explicit, reviewable rationale summaries and intermediate artifacts.

## Technical Context

**Language/Version**: Node.js 20 LTS + TypeScript 5.x  
**Primary Dependencies**: `@github/copilot-sdk`, `commander` (CLI), `@inquirer/prompts` (menus), `zod` (schemas), `pino` (logs), `ora` (spinners/activity), `marked` + `marked-terminal` (Markdown→ANSI), `chalk` (color), `cli-table3` (tables)  
**Storage**: Repo-local files: `./.sofia/sessions/<sessionId>.json`, export bundles in `./exports/<sessionId>/`  
**Testing**: Vitest (unit/integration), `node-pty` (interactive E2E harness), deterministic fakes for Copilot SDK sessions  
**Target Platform**: macOS/Linux/Windows terminals (TTY and non-TTY); Node runtime only  
**Project Type**: CLI application + library modules (agents/orchestration)  
**Performance Goals**: First streamed output token ≤ 3 seconds in correctly configured environments; avoid blocking render loops  
**Constraints**: No raw SDK JSON to users; no hidden chain-of-thought display; no implicit phase transitions; repo-local persistence; graceful MCP/tool degradation; interactive must be fully automatable via PTY; stdout must remain JSON-only in `--json` mode  
**Scale/Scope**: Single-user/local facilitator runs; session sizes dominated by turn history + artifacts; support multiple sessions per repo

## CLI Rendering (Markdown, color, tables)

Goal: when possible, workshop outputs are authored in Markdown and rendered to the terminal in a readable, colorful format (headings, lists, code blocks, links, and tables at minimum).

Rendering rules:

- If `process.stdout.isTTY` and not `--json`, render Markdown to ANSI using `marked` + `marked-terminal`.
- Render tables using `cli-table3` for consistent borders/column widths.
- If non-TTY or `--json`, do not emit ANSI/spinners; output plain text (or raw Markdown when plain text would lose meaning).
- Keep activity/telemetry on stderr so stdout can remain clean for scripting.

## Existing Assets: Prompts + Discovery Cards Dataset

This repository already contains two critical inputs that the implementation must build on.

### Original prompts (seed material)

- Location: `src/originalPrompts/`
- Files:

  - `facilitator_persona.md`
  - `design_thinking_persona.md`
  - `design_thinking.md`
  - `guardrails.md`
  - `document_generator_persona.md`
  - `document_generator_example.md`

Plan requirement:

- Create canonical runtime prompts under `src/prompts/` by adapting/modularizing these files (shared guardrails + per-step instructions + output schemas).
- Keep `src/originalPrompts/` intact as a historical reference; do not treat it as the runtime source of truth.

### Discovery Cards dataset (authoritative data)

- Dataset: `src/shared/data/cards.json`
- Loader (already implemented): `src/shared/data/cardsLoader.ts` (Zod validation + cached load + search)

Plan requirement:

- Use this dataset in the relevant workshop steps (Explore Cards, scoring, mapping cards→workflow steps, ideation support).
- Provide CLI affordances to browse categories, list cards, and search cards by keyword in interactive mode.

## MCP Integration: Runtime Wiring (Copilot SDK + MCP)

This repo’s MCP servers are configured for the development environment in `.vscode/mcp.json` and include:

- stdio servers (invoked via `npx`): `workiq`, `azure`, `context7`, `playwright`
- HTTP servers: `github` (`https://api.githubcopilot.com/mcp/`), `microsoftdocs/mcp` (`https://learn.microsoft.com/api/mcp`)

Plan requirement:

- Implement an `McpManager` module that:
  - loads and validates `.vscode/mcp.json` (plus optional environment-variable overrides)
  - connects to stdio servers via the MCP TypeScript SDK `Client` + `StdioClientTransport`
  - connects to HTTP servers via `Client` + `StreamableHTTPClientTransport`
  - lists tools (`client.listTools()`) and exposes them to the Copilot SDK as callable tools (namespaced as `mcp.<server>.<tool>`)
  - classifies and surfaces errors (auth/connection/timeout/tool) without leaking secrets

Note: `.vscode/mcp.json` is a VS Code convention; the CLI must not assume Copilot SDK will auto-load it. The CLI loads it explicitly to reuse the same server inventory.

## Discovery Phase: Web Research via Copilot SDK tool-calling

The Discover phase requires web research “when possible”. To ensure this works in the CLI:

- Provide a first-class tool `web.search` (invoked via Copilot SDK tool-calling).
- Implement `web.search` by calling an Azure AI Foundry agent that has **Bing Search tools** configured (per “Grounding agents with Bing Search tools in Microsoft Foundry”).
  - Configure the Foundry agent endpoint and key via environment variables (for example: `SOFIA_FOUNDRY_AGENT_ENDPOINT`, `SOFIA_FOUNDRY_AGENT_KEY`).
  - The CLI MUST NOT log or persist these secrets; they are read at startup and used only for HTTPS calls to the agent.
  - If the Foundry agent is not configured or returns a hard failure, degrade gracefully to a “guided research” prompt that asks the facilitator to paste links/notes.

Output contract:

- `web.search` returns structured results (title, url, snippet/summary) plus an optional `sources` list for auditability, derived from the Foundry agent’s Bing Search tool output.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Default gates for this repository (sofIA Copilot CLI) — derived from `.specify/memory/constitution.md`:

- **Outcome-first discovery**: plan ties work to a measurable business/user outcome.
- **Secure-by-default**: least privilege, no secrets/PII in logs or prompts.
- **Node.js + TypeScript**: aligns with GitHub Copilot SDK patterns used here.
- **MCP-first**: prefer MCP tools over ad-hoc HTTP when available.
- **Test-first (NON-NEGOTIABLE)**: new behavior is implemented via Red → Green → Review.
- **CLI transparency**: long-running steps stream progress; failures include recovery options.

If any gate cannot be met, document the exception under **Complexity Tracking** with rationale.

## Project Structure

### Documentation (this feature)

```text
specs/001-cli-workshop-rebuild/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── cli/                  # command routing, menus, IO adapters
├── loop/                 # ConversationLoop abstraction + streaming renderer
├── sessions/             # session model, persistence, backtracking, exports
├── phases/               # discover/ideate/design/select/plan/develop phase modules
├── mcp/                  # wrappers for WorkIQ/Context7/MicrosoftDocs/GitHub MCP
├── logging/              # redaction + pino setup + log file routing
├── prompts/               # canonical runtime prompts (derived from src/originalPrompts)
└── shared/               # shared schemas, types, card dataset loader, utilities

src/originalPrompts/       # existing seed prompts (kept for reference; not runtime source of truth)

tests/
├── unit/
├── integration/
└── e2e/                  # PTY-driven interactive harness tests

.sofia/                   # repo-local state (gitignored): sessions, temp artifacts
exports/                  # repo-local exports (gitignored): customer artifact bundles
```

**Structure Decision**: Single Node.js/TypeScript CLI project at repository root with layered modules for CLI UX, conversation loop, phase orchestration, persistence, and MCP integrations.

## Agent Design: Step/Phase Coverage

The agent set is derived from the existing personas/prompts and covers the workshop pipeline end-to-end:

- Facilitator orchestrator (primary)

  - Seed: `src/originalPrompts/facilitator_persona.md`
  - Responsibilities: governed progression/decision gates, delegation to step specialists, persistence of summaries + artifacts.

- Step specialists (per phase/step)

  - Seeds: `design_thinking_persona.md` + `design_thinking.md`, plus `guardrails.md` included everywhere.
  - Output contracts: each step emits structured data for the session model (see `data-model.md`) and Markdown artifacts for export.

- Document generator

  - Seed: `document_generator_persona.md` + `document_generator_example.md`
  - Responsibilities: produce customer-ready workshop report/artifacts from session state.

- Discovery Cards support

  - Data source: `src/shared/data/cards.json` via `cardsLoader.ts`
  - Responsibilities: present cards, support scoring, map cards to workflow steps, seed ideation prompts with relevant cards.

## Post-Design Constitution Re-check (Phase 1)

- User-visible transparency is provided via rationale summaries + intermediate artifacts + activity/telemetry (not raw hidden chain-of-thought).
- Interactive mode never auto-advances phases; explicit decision gate required.
- Testability is a first-class deliverable: unit + integration + PTY E2E harness.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ----------------------------------- |
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
