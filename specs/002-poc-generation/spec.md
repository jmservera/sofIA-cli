# Feature Specification: sofIA PoC Generation & Ralph Loop

**Feature ID**: 002-poc-generation  
**Created**: 2026-02-26  
**Upstream Dependency**: specs/001-cli-workshop-rebuild/spec.md (session model, Plan outputs)  
**Status**: Draft

## Overview

This feature defines the **Develop** phase implementation for sofIA: generating a proof-of-concept (PoC) repository from an existing workshop session and iteratively refining it via a Ralph-like loop.

Feature 001 (CLI workshop rebuild) is responsible for Discover  Ideate  Design  Select  Plan and for capturing PoC intent/requirements into the session JSON. Feature 002 consumes that session state, creates or updates a PoC repository, and feeds back status/results.

## User Scenarios & Testing (mandatory)

### User Story 1  Generate a PoC repository from a completed plan (Priority: P1)

As a facilitator, I want to run the **Develop** phase for a completed workshop session so that sofIA generates a PoC repository aligned with the selected idea and implementation plan.

**Independent Test**: From a fixture session JSON produced by feature 001, run the Develop command and verify that a PoC repo is created (locally or via GitHub MCP), with README, basic docs, and smoke tests wired to the captured plan.

### User Story 2  Iterate via Ralph loop (Priority: P1)

As a facilitator, I want to iteratively refine the PoC by running tests and applying improvements suggested by sofIA, so that the PoC converges toward the intended behavior without manual code authoring.

**Independent Test**: Starting from an initial generated repo, simulate failing tests and verify that successive Develop iterations apply targeted changes until tests pass or a clear "cannot fix" outcome is produced.

### User Story 3  Handle MCP and permissions constraints (Priority: P2)

As an operator, I want Develop to gracefully handle environments where GitHub MCP cannot create or modify repositories, so that I still get a usable local PoC scaffold.

**Independent Test**: Disable/misconfigure GitHub MCP for the test environment, run Develop, and verify that the system falls back to a local repo structure without crashing or corrupting the parent session.

## Functional Requirements (Develop phase)

> Numbering in this feature is local (D-XXX) to avoid colliding with FR-0XX in feature 001. Feature 001 FR-036..038 now delegate detailed PoC behavior to this feature.

### D-001  Session consumption

- MUST accept a `WorkshopSession` produced by feature 001 (from .sofia/sessions/<sessionId>.json) with populated `selection`, `plan`, and PoC intent fields.
- MUST validate that required fields for PoC generation are present; otherwise fail fast with a clear error and guidance to re-run Plan.

### D-002  PoC repository creation (GitHub MCP)

- When GitHub MCP is available and authorized, MUST be able to create or update a PoC repository associated with the session.
- MUST at minimum generate:
  - `README` describing the selected idea and scope
  - basic run instructions
  - a minimal test or smoke-test harness
- MUST record the repository location (URL or local path) back into the session's `poc` state or a closely related artifact.

### D-003  Local scaffolding fallback

- When GitHub MCP is unavailable or lacks permissions, MUST fall back to generating a **local** PoC scaffold outside the workspace (e.g., `./poc/<sessionId>/`).
- MUST clearly mark in logs and artifacts that the PoC was generated locally rather than via GitHub MCP.

### D-004  Ralph loop iterations

- MUST support multiple iterations of Develop for a given session/repo.
- MUST run tests (or other checks) between iterations and incorporate failures into the next iteration's prompts.
- MUST stop the loop when:
  - tests are passing to the configured threshold, or
  - a maximum number of iterations is reached, or
  - the user explicitly stops the loop.

### D-005  Safety & auditability

- MUST log high-level actions (files created/modified, tests run, iteration outcomes) without logging secrets or full code diffs.
- MUST preserve an audit trail sufficient to explain why particular changes were made in each iteration, referencing session intent where possible.

## Success Criteria (initial)

- **SC-002-001**: From a valid session created by feature 001, at least one happy-path run of Develop generates a working PoC repo with README and a passing smoke test in a properly configured environment.
- **SC-002-002**: When GitHub MCP is misconfigured or unavailable, Develop still completes successfully by producing a local PoC scaffold and a clear explanation of the fallback in the logs and export artifacts.
- **SC-002-003**: The Ralph loop demonstrates at least one successful iteration where a failing test guides a subsequent change that results in a passing test.

## Open Items

- Finalize the PoC repo technology templates (e.g., Node/TypeScript web API, minimal Azure integration samples) and how they map from the plan's architecture notes.
- Define the exact shape of `PocDevelopmentState` fields that this feature will read and write, in coordination with the 001 data model.
- Confirm which parts of the Ralph loop run locally vs via GitHub MCP tools, and how to surface errors back to the main CLI UX.
