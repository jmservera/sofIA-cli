<!--
Sync Impact Report

- Version change: 1.1.1 → 1.1.2
- Modified principles: none
- Clarifications: added explicit mapping between 12-step process and Discover/Ideate/Design/Select/Plan/Develop wording
- Added sections: Sync Impact Report (this comment)
- Removed sections: none
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (Constitution Check gates clarified)
  - ✅ .specify/templates/tasks-template.md (tests/TDD requirements aligned)
  - ✅ .github/copilot-instructions.md (repo structure + TDD guidance aligned)
  - ⚠ .specify/templates/commands/*.md (folder not present in this repo)
- Deferred TODOs: none
-->

# sofIA Copilot CLI Constitution

This constitution governs the design, development, and operation of the sofIA Copilot CLI solution. The system helps organizations **analyze, ideate, design, generate, and select** high‑quality AI‑enabled project ideas using the AI Discovery Cards methodology, implemented with the GitHub Copilot SDK for Node.js.

## Core Principles

### I. Outcome‑First AI Discovery

- The primary goal is to help users discover, refine, and prioritize valuable, feasible AI use cases – **not** to generate code for its own sake.
- The agent always keeps the AI Discovery Cards workshop phases in view: Discover → Ideate → Design → Select → Plan → Develop.
- All outputs (text, plans, code suggestions) must explicitly tie back to business goals, users, processes, and measurable impact.

### II. Secure‑by‑Default & Privacy‑Respecting

- Follow **least privilege**: only request and use the minimum data, scopes, repos, and MCP capabilities required for the current task.
- Never log, echo, or persist secrets, access tokens, PII, or customer‑sensitive data.
- When using external MCP services or web fetch, prefer **anonymized, aggregate, or redacted** context; avoid copying proprietary content into prompts unless the user explicitly provides it.
- Default to local execution where possible; remote calls must be transparent and justifiable.

### III. Node.js + TypeScript, SDK‑Aligned

- The solution is implemented in **Node.js (LTS) with TypeScript**, using the GitHub Copilot SDK for Node.js as the primary integration surface.
- All core behavior (request parsing, streaming events, MCP calls, orchestration) must follow SDK best practices and patterns established in this repository.
- Public contracts (CLI flags, JSON schemas, extension event formats) are treated as **APIs** and evolved carefully.

### IV. MCP‑First Context & Tools

- Prefer **MCP servers** over ad‑hoc HTTP calls whenever suitable tools exist (Context7, Playwright, WorkIQ, Microsoft Docs, GitHub MCP, filesystem, fetch, etc.).
- Each MCP call must have a **clear purpose** that supports the current workshop phase (e.g., research technology options, inspect existing codebases, understand documentation, analyze processes).
- Tool use is **explainable**: the agent should be able to state what tool it used, why, and how the result influenced its recommendation.

### V. Test‑First, Regressions‑Last (Red → Green → Review)

- New behavior must be covered by **automated tests** (unit where possible, integration/e2e where necessary).
- **No implementation starts before tests**: for every task phase, the first committed change MUST be failing tests that describe the target behavior.
- The project follows a **phase‑level TDD cycle** for every feature implemented:
  1. **Red**: Write all tests for the current task phase **before** writing any implementation code. All new tests MUST fail initially, confirming they test real behavior that does not yet exist.
  2. **Green**: Implement the minimum code needed to make all failing tests pass. Do not move to the next phase until every test is green.
  3. **Review**: After green, perform a **mandatory self‑review** using the Test Review Checklist (see Development Workflow below) to identify gaps. Add new tests if gaps are found and repeat the red → green cycle for those additions.
- Critical flows – idea evaluation, scoring, selection, and project planning – require **stable, deterministic tests** that avoid flaky external dependencies.
- Interactive CLI flows (menus, phase gates, follow-up prompts, retries, resume, and Ctrl+C paths) MUST be testable from day one through deterministic automation, not only manual checks.
- Test strategy: pure logic → unit tests; orchestration and tool integration → integration tests with fakes/mocks and a minimal set of live MCP smoke tests.
- Generated PoC repositories MUST include **basic smoke/happy‑path tests** that validate the code runs successfully. Full TDD is not required for PoC code, but generated tests serve as a quality signal for the Ralph loop.
- Each **Ralph loop iteration** MUST be test‑driven: every refinement cycle starts with a failing test or captured error that proves a defect exists, refines code until the failure is resolved, and then checks whether new issues were introduced.

### VI. Interactive CLI Testability by Design

- Every interactive feature MUST define a machine-testable contract up front: expected prompts, user choices, streamed activity signals, decision gates, and terminal end states.
- The project MUST maintain an automated interactive harness capable of validating full workshop behavior (including phase transitions and governed progression) in a pseudo-terminal environment.
- For LLM-involved interactive validation, tests MUST use a layered approach:
  1. deterministic assertions on structure and control flow (menus, summaries, decisions, transitions),
  2. optional semantic validation (e.g., LLM-as-judge) for quality-sensitive phases.
- When interaction complexity requires it, the harness MAY use Copilot SDK-generated answer banks or tool-assisted inputs, but runs MUST remain reproducible via saved transcripts/reports and explicit pass/fail checks.
- A feature is not complete unless at least one automated end-to-end interactive scenario validates the happy path and one validates a failure/recovery path.

### VII. Deterministic, Auditable Agent Behavior

- Prompts, system instructions, and agent flows must be **versioned and reviewable** (stored under `src/prompts` or equivalent, not embedded ad‑hoc everywhere).
- For the same inputs and configuration, the system should aim for **predictable, reproducible** outputs (within the limits of LLM variability), achieved via structured prompts, stable scoring rubrics, and constrained response schemas.
- Significant decisions (e.g., why an AI idea was ranked #1 vs #2) should be accompanied by **structured rationale** suitable for audit and stakeholder review.

### VIII. CLI‑First UX & Transparency

- The CLI interface is a **first‑class product**: clear commands, help text, and progress reporting are mandatory.
- All long‑running operations (multi‑phase workshops, MCP orchestrations) must **stream progress**, not leave users idle.
- Users MUST always see the current execution state (current phase, waiting for input, running tool/action, retry/recovery state) during interactive and long-running operations.
- On failures, user-facing output MUST include: what failed, why it likely failed, what was already completed, and the next actionable recovery options.
- Operational telemetry shown to users MUST stay separate from model reasoning/private chain-of-thought.
- The agent must be honest about limitations, uncertainty, and trade‑offs, avoiding over‑confident claims.

## Architecture & Scope

- The system implements the AI Discovery Cards process as a **multi‑phase agentic pipeline**:
  - First phase is the AI Discovery Cards 12-step process
  - Phase 2: idea selection
  - Phase 3: Planning and development, outline milestones, dependencies, and PoC scope. Finally generate PoC‑level code examples and scaffolding.

Mapping: the 12-step workshop covers **Discover/Ideate/Design**; Phase 2 maps to **Select**; Phase 3 maps to **Plan/Develop**.

- Each step is implemented as a **composable agent/module** with:
  - A narrow responsibility and input/output contract.
  - A clear hand‑off format to the next phase.
  - Optional checkpointing/check‑in with the user (especially at selection & planning).
- The Copilot CLI acts as an **orchestrator**, not a monolith: orchestration code wires agents, prompts, and MCP tools together.

## Security & Compliance

- Always validate CLI arguments, configuration files, and Copilot SDK session payloads before processing.
- Enforce strict **input validation** on CLI arguments, configuration files, and environment variables; fail fast on invalid or unsafe values.
- Use secure defaults:
  - HTTPS‑only when calling remote services.
  - TLS verification enabled; no blanket `NODE_TLS_REJECT_UNAUTHORIZED=0`.
  - Timeouts and retries configured to avoid hanging processes.
- Access to GitHub, Azure, WorkIQ, or other enterprise systems must respect **organization policies** and least‑privilege scopes.
- Sensitive outputs (like architecture diagrams or PoC code that touches regulated data) should include **disclaimers and risk notes** when appropriate.

## MCP Services Usage

- **Context7**
  - Use to fetch **up‑to‑date documentation and best practices** for libraries, frameworks, and platforms relevant to a proposed AI idea.
  - Use when evaluating technical feasibility, comparing implementation options, or generating PoC scaffolding.
  - Prefer official or high‑trust sources; clearly separate factual documentation from generated interpretation.

- **Playwright MCP**
  - Use for **browser automation and validation** when ideas involve web UX, customer journeys, or site workflows.
  - Suitable tasks: walking through existing user flows, capturing page structure, or validating that an AI augmentation can integrate into a target UI.
  - Avoid using it to capture or persist sensitive user data; respect robots.txt and customer security guidelines.

- **WorkIQ / M365 MCP** (when enabled)
  - Use for **process discovery** and empirical analysis of how work is currently performed (emails, meetings, documents, Teams, etc.).
  - Only access tenants and scopes explicitly authorized; never assume cross‑tenant access.
  - Summaries and suggestions must preserve confidentiality and avoid exposing individual‑level behavioral analytics unless policy allows.

- **GitHub MCP**
  - Use to analyze existing repos and workflows when ideas involve **developer productivity, DevOps, or code quality**.
  - Prefer light‑touch analysis (metadata, structure, high‑level patterns) over raw code dumps unless the user explicitly requests deeper review.

- **Microsoft Docs / Azure MCP**
  - Use for authoritative **cloud architecture, security, and compliance** guidance when proposing Azure‑based or Microsoft‑based solutions.
  - When generating Azure/AI solution ideas, ground recommendations in official docs where feasible.

## Development Workflow & Quality Gates

- **Branching & Reviews**
  - All substantial changes (logic, prompts, workflows) go through PRs and human review.
  - PR descriptions must state which workshop phases are affected and which tests were run.

- **Testing Requirements (Red → Green → Review)**
  - A change is not done until there are passing tests covering the new behavior.
  - The first implementation commit for a task phase MUST include failing tests before production-code changes.
  - Core scoring and selection logic must have **high‑signal unit tests** (no reliance on live LLMs or MCP tools for correctness).
  - End‑to‑end tests may stub LLMs/MCPs while validating orchestration and CLI UX.
  - To generate proper non-stub integration LLM tests, GitHub Copilot SDK can help, keep in mind that results are non-deterministic.
  - Interactive CLI changes MUST include automated terminal-flow tests that verify prompts, user decisions, transitions, and persistence/resume behavior.
  - LLM-dependent behavior MUST expose deterministic checks first (schema/control flow/required signals), with optional semantic checks layered on top.
  - Every task phase follows the **phase‑level TDD cycle**: tests written first → all must fail → implement until green → self‑review.
  - After reaching green, the implementer MUST run through the **Test Review Checklist**:
    - [ ] Are all edge cases covered (empty inputs, nulls, boundary values)?
    - [ ] Are negative/error paths tested (invalid data, missing dependencies, permission failures)?
    - [ ] Are boundary conditions verified (max/min values, empty collections, large payloads)?
    - [ ] Are new integration points exercised (new MCP calls, Copilot SDK interactions)?
    - [ ] Do existing tests still pass without modification (no silent regressions)?
    If any gaps are found, add tests and repeat the red → green cycle before proceeding.

- **Observability & Diagnostics**
  - Use structured, leveled logging with a clear separation between **debug**, **info**, **warn**, and **error**.
  - Logging MUST be extensive enough to reconstruct interactive failures end-to-end: include session ID, phase, turn number, tool/action, timing, and transition decisions.
  - Logs must never contain secrets or sensitive data; link to resource identifiers or hashes instead.
  - For CLI users, provide concise error messages plus an optional `--verbose` or `--debug` mode.
  - Interactive UX MUST surface real-time operational events to users (progress, tool activity, state changes) and provide explicit failure reasons with recovery guidance.
  - Automated interactive runs MUST persist artifacts (for example: transcript + structured report) so regressions are diagnosable and reproducible.

## Governance

- This constitution **supersedes ad‑hoc practices** for the sofIA Copilot CLI and related agents.
- Any feature, design, or prompt that conflicts with this document must be revised or justified via a documented exception.
- Amendments require:
  - A proposal documenting the motivation, risks, and migration/rollout plan.
  - Review and approval via the project’s standard PR process.
  - A version bump and date update in this file.
- All PR reviews should include an explicit, light‑weight check against this constitution: security, testing, MCP usage, and AI Discovery alignment.
- Runtime guidance (coding style, prompts, agent composition) should be kept in the project’s developer docs and referenced from here as needed.

**Version**: 1.1.2 | **Ratified**: 2026-02-24 | **Last Amended**: 2026-02-26
