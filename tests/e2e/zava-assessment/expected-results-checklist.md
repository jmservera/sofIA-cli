# Zava Industries — Expected Results & Assessment Checklist

This document defines what each phase of the sofIA workshop should produce when run with the Zava Industries company profile and agent interaction script. After the test run, each check should be marked as PASS, FAIL, or PARTIAL with notes.

---

## Test Metadata

| Field                     | Value                                                            |
| ------------------------- | ---------------------------------------------------------------- |
| **Test Date**             | _(to be filled)_                                                 |
| **sofIA Version**         | 0.1.0                                                            |
| **Node.js Version**       | _(to be filled)_                                                 |
| **Environment**           | _(local / CI)_                                                   |
| **Copilot SDK Token**     | _(configured / missing)_                                         |
| **MCP Servers Available** | _(list which ones: github, context7, azure, workiq, playwright)_ |
| **Web Search (Foundry)**  | _(configured / not configured — FOUNDRY_PROJECT_ENDPOINT set?)_  |
| **WorkIQ**                | _(configured / not configured — EULA accepted?)_                 |
| **Overall Result**        | _(PASS / FAIL / PARTIAL)_                                        |

---

## 0. Pre-flight & Environment

### Spec References: FR-051, FR-017 (005 spec)

| #   | Check                    | Expected Behavior                                                                              | Result | Notes |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------- | ------ | ----- |
| 0.1 | `.env` loaded at startup | sofIA loads `.env` without error; if missing, proceeds normally (FR-017 005)                   | ☐      |       |
| 0.2 | Pre-flight check         | sofIA validates Copilot connectivity before starting (FR-051)                                  | ☐      |       |
| 0.3 | MCP readiness            | Pre-flight reports which MCP servers are reachable                                             | ☐      |       |
| 0.4 | Web search configured    | `FOUNDRY_PROJECT_ENDPOINT` + `FOUNDRY_MODEL_DEPLOYMENT_NAME` detected (or absent with warning) | ☐      |       |
| 0.5 | Legacy env rejected      | If `SOFIA_FOUNDRY_AGENT_ENDPOINT` is set, a migration error is shown (FR-016 005)              | ☐      |       |

---

## 1. CLI Startup & Session Creation

### Spec References: FR-004, FR-009, FR-015a, FR-023, FR-023a

| #   | Check                       | Expected Behavior                                                                                               | Result | Notes |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| 1.1 | CLI starts without errors   | `npm run start -- workshop --new-session` launches successfully                                                 | ☐      |       |
| 1.2 | Auto-start greeting         | LLM produces a greeting introducing the Discover phase and asks the first question without requiring user input | ☐      |       |
| 1.3 | Greeting timeout            | First token arrives within 10 seconds                                                                           | ☐      |       |
| 1.4 | Markdown rendering          | Streamed output is rendered as formatted markdown (not raw text) in TTY mode                                    | ☐      |       |
| 1.5 | Spinner display             | A "Thinking..." spinner is shown before the first token arrives                                                 | ☐      |       |
| 1.6 | Session created             | A session JSON file is created in `.sofia/sessions/`                                                            | ☐      |       |
| 1.7 | Session name auto-generated | After first Discover exchange, session gets a short auto-generated name (e.g., "Zava Trend Intelligence")       | ☐      |       |

---

## 2. Discover Phase (Steps 1–4)

### Spec References: FR-019, FR-020, FR-021, FR-022, FR-023, FR-009a

| #    | Check                       | Expected Behavior                                                                                   | Result | Notes |
| ---- | --------------------------- | --------------------------------------------------------------------------------------------------- | ------ | ----- |
| 2.1  | Business context collection | sofIA asks about the business and accepts the company description                                   | ☐      |       |
| 2.2  | Follow-up probes            | sofIA asks clarifying questions about team, process, or pain points                                 | ☐      |       |
| 2.3  | Web search offer            | sofIA offers to search the web for company/industry context (FR-021)                                | ☐      |       |
| 2.4  | Web search execution        | If web search is available, sofIA executes a search and reports results                             | ☐      |       |
| 2.5  | Web search degradation      | If web search is unavailable, sofIA continues gracefully (FR-022)                                   | ☐      |       |
| 2.6  | WorkIQ permission prompt    | sofIA asks the user for explicit permission before querying WorkIQ (FR-020)                         | ☐      |       |
| 2.7  | WorkIQ graceful skip        | When user declines WorkIQ (or WorkIQ unavailable), sofIA continues normally (FR-022)                | ☐      |       |
| 2.8  | Topic selection             | sofIA suggests focus areas and accepts user's choice of "Trend Intelligence and Signal Aggregation" | ☐      |       |
| 2.9  | Activity brainstorming      | sofIA helps brainstorm activities and accepts the list of 8 activities                              | ☐      |       |
| 2.10 | Workflow diagram            | sofIA produces a Mermaid diagram of the activity flow                                               | ☐      |       |
| 2.11 | Critical step voting        | sofIA accepts business/human value scores and key metrics                                           | ☐      |       |
| 2.12 | Phase summary               | sofIA produces a summary covering: business context, topic, activities, workflow, critical steps    | ☐      |       |
| 2.13 | JSON extraction             | `businessContext` is extracted and stored in session JSON                                           | ☐      |       |
| 2.14 | Session persistence         | Session is persisted after every user turn (FR-039a)                                                | ☐      |       |
| 2.15 | Decision gate               | After Discover, sofIA shows a decision gate with options (continue, refine, exit, etc.)             | ☐      |       |
| 2.16 | No auto-advance             | System does NOT auto-advance to Ideate (FR-018, FR-060)                                             | ☐      |       |

### Discover — MCP Tool Invocation Audit

| #     | Check                                  | Expected Behavior                                                                                                                        | Result | Notes       |
| ----- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- |
| 2.T1  | `web.search` — company news query      | Enricher searches for "Zava Industries recent news" (or similar)                                                                         | ☐      | Query used: |
| 2.T2  | `web.search` — competitor query        | Enricher searches for competitor/market context                                                                                          | ☐      | Query used: |
| 2.T3  | `web.search` — industry trends query   | Enricher searches for fashion/AI industry trends                                                                                         | ☐      | Query used: |
| 2.T4  | `web.search` — results surfaced        | Search results are shown to the user (one-line summaries or inline in LLM text)                                                          | ☐      |             |
| 2.T5  | `web.search` — results stored          | `session.discoveryEnrichment.webSearchResults` is populated                                                                              | ☐      |             |
| 2.T6  | `web.search` — citations               | Search results include source URLs (FR-014 005)                                                                                          | ☐      |             |
| 2.T7  | `web.search` — spinner                 | Spinner shows "Searching..." or similar during web search calls                                                                          | ☐      |             |
| 2.T8  | `web.search` — summary line            | After search completes, a one-line summary is shown (e.g., "✓ Web search: 3 results for ...") (FR-043b)                                  | ☐      |             |
| 2.T9  | `workiq.analyze_team` — consent prompt | sofIA asks "May sofIA access WorkIQ for team insights? (y/N)" before calling WorkIQ                                                      | ☐      |             |
| 2.T10 | `workiq` — NOT called without consent  | If user says "no" or "skip", WorkIQ is NOT invoked                                                                                       | ☐      |             |
| 2.T11 | `workiq` — called with consent         | If user says "yes", `analyze_team` is called with the company summary                                                                    | ☐      |             |
| 2.T12 | `workiq` — insights stored             | If WorkIQ is called, `session.discoveryEnrichment.workiqInsights` is populated (teamExpertise, collaborationPatterns, documentationGaps) | ☐      |             |
| 2.T13 | `workiq` — degradation                 | If WorkIQ is unavailable/errors, sofIA continues without crashing                                                                        | ☐      |             |
| 2.T14 | `enrichment.sourcesUsed`               | Session records which sources were actually used (e.g., `["websearch"]` or `["websearch","workiq"]`)                                     | ☐      |             |

---

## 3. Ideate Phase (Steps 5–9)

### Spec References: FR-024, FR-025, FR-026, FR-027, FR-028

| #    | Check                     | Expected Behavior                                                                        | Result | Notes |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------- | ------ | ----- |
| 3.1  | Card presentation         | sofIA presents AI Discovery Cards, organized by category                                 | ☐      |       |
| 3.2  | Card explanation          | Each card includes: capability description, workflow application, examples               | ☐      |       |
| 3.3  | Card scoring              | sofIA accepts user scores (Relevance/Feasibility/Impact) for each card                   | ☐      |       |
| 3.4  | Top card selection        | sofIA selects top-scoring cards (up to 15)                                               | ☐      |       |
| 3.5  | Card aggregation          | sofIA aggregates similar cards into themes when requested                                | ☐      |       |
| 3.6  | Card–workflow mapping     | sofIA creates a mapping of cards to workflow steps with metrics                          | ☐      |       |
| 3.7  | Idea generation           | sofIA generates ideas using Design Thinking techniques (HMW, SCAMPER)                    | ☐      |       |
| 3.8  | Idea cards                | At least 3–5 distinct ideas are generated with title, description, workflow steps, scope | ☐      |       |
| 3.9  | Ideas match context       | Generated ideas are relevant to fashion trend analysis (not generic)                     | ☐      |       |
| 3.10 | Discovery enrichment used | Ideation references web search or WorkIQ insights from the Discover phase                | ☐      |       |
| 3.11 | Decision gate             | After Ideate, sofIA shows a decision gate                                                | ☐      |       |
| 3.12 | Session persistence       | Ideate artifacts are persisted to session JSON                                           | ☐      |       |

### Ideate — MCP Tool Invocation Audit

| #    | Check                    | Expected Behavior                                                                                             | Result | Notes                |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------- | ------ | -------------------- |
| 3.T1 | Cards dataset loaded     | sofIA uses the built-in `cards.json` dataset (FR-024) — not an MCP call, but verify cards come from data file | ☐      |                      |
| 3.T2 | No unexpected tool calls | Ideate should not call MCP tools (Context7, Azure, web search are not expected in this phase)                 | ☐      | Tool calls observed: |

---

## 4. Design Phase (Steps 10–12)

### Spec References: FR-029, FR-030, FR-031, FR-032, FR-033

| #   | Check                     | Expected Behavior                                                                       | Result | Notes |
| --- | ------------------------- | --------------------------------------------------------------------------------------- | ------ | ----- |
| 4.1 | Idea card refinement      | sofIA refines ideas into complete Idea Cards with assumptions and data requirements     | ☐      |       |
| 4.2 | Feasibility/Value matrix  | sofIA creates a scoring matrix and accepts user scores                                  | ☐      |       |
| 4.3 | Impact assessment         | BXT framework assessment is produced for each idea                                      | ☐      |       |
| 4.4 | Architecture sketch       | A Mermaid architecture diagram is generated for top idea(s)                             | ☐      |       |
| 4.5 | Documentation grounding   | If Context7/MS Learn is available, recommendations are grounded with real documentation | ☐      |       |
| 4.6 | User feedback integration | sofIA incorporates user additions (risks, notes) into the output                        | ☐      |       |
| 4.7 | Decision gate             | After Design, sofIA shows a decision gate                                               | ☐      |       |
| 4.8 | Session persistence       | Design artifacts are persisted                                                          | ☐      |       |

### Design — MCP Tool Invocation Audit

| #    | Check                                    | Expected Behavior                                                                                              | Result | Notes              |
| ---- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ | ------------------ |
| 4.T1 | Context7 — library docs queried          | If Context7 is available and ideas reference specific libraries, Context7 is called for documentation (FR-031) | ☐      | Libraries queried: |
| 4.T2 | Context7 — `resolve-library-id`          | For each queried library, `resolve-library-id` is called first                                                 | ☐      |                    |
| 4.T3 | Context7 — `query-docs`                  | After resolving, `query-docs` is called with the resolved ID                                                   | ☐      |                    |
| 4.T4 | Context7 — results in output             | Documentation results are referenced in architecture or feasibility assessment                                 | ☐      |                    |
| 4.T5 | MS Learn / Azure MCP — called            | If Azure services are mentioned (Cognitive Services, Cosmos DB, etc.), Azure docs MCP or MS Learn is queried   | ☐      | Services queried:  |
| 4.T6 | MS Learn / Azure MCP — results in output | Azure architecture guidance appears in the architecture sketch or recommendations                              | ☐      |                    |
| 4.T7 | Tool call spinner                        | Spinner shows tool-specific text during each MCP call (FR-043a)                                                | ☐      |                    |
| 4.T8 | Tool call summary lines                  | One-line summary after each tool completes (FR-043b)                                                           | ☐      |                    |
| 4.T9 | Degradation if tools unavailable         | If Context7/Azure is unavailable, sofIA still produces reasonable output (FR-056)                              | ☐      |                    |

---

## 5. Select Phase

### Spec References: FR-032, FR-033, FR-034

| #   | Check              | Expected Behavior                                                                           | Result | Notes |
| --- | ------------------ | ------------------------------------------------------------------------------------------- | ------ | ----- |
| 5.1 | Ranking            | sofIA ranks ideas by composite score (Feasibility 30%, Business Value 40%, Human Value 30%) | ☐      |       |
| 5.2 | Recommendation     | sofIA recommends a top idea with clear rationale                                            | ☐      |       |
| 5.3 | User confirmation  | sofIA asks for explicit user confirmation of selection                                      | ☐      |       |
| 5.4 | Selection recorded | Selected idea + rationale + `confirmedByUser` visible in session                            | ☐      |       |
| 5.5 | Correct selection  | Selection is "TrendPulse Dashboard with integrated TrendLens" (or similar combined idea)    | ☐      |       |
| 5.6 | Decision gate      | After Select, sofIA shows a decision gate                                                   | ☐      |       |

### Select — MCP Tool Invocation Audit

| #    | Check                 | Expected Behavior                                             | Result | Notes                |
| ---- | --------------------- | ------------------------------------------------------------- | ------ | -------------------- |
| 5.T1 | No MCP tools expected | Select phase is LLM-only analysis; no MCP tool calls expected | ☐      | Tool calls observed: |

---

## 6. Plan Phase

### Spec References: FR-035

| #   | Check                | Expected Behavior                                                                                | Result | Notes |
| --- | -------------------- | ------------------------------------------------------------------------------------------------ | ------ | ----- |
| 6.1 | Milestones           | Plan includes 3–6 milestones with IDs, titles, and deliverables                                  | ☐      |       |
| 6.2 | Architecture notes   | High-level architecture is documented with technology choices                                    | ☐      |       |
| 6.3 | Architecture diagram | A Mermaid diagram showing components and data flow is produced                                   | ☐      |       |
| 6.4 | Dependencies list    | External dependencies (APIs, data sources, skills) are listed                                    | ☐      |       |
| 6.5 | PoC definition       | PoC scope is defined with: minimum functionality, data needs, success criteria, timeline         | ☐      |       |
| 6.6 | Tech stack captured  | Plan references the requested tech stack (Azure Functions, Cognitive Services, Cosmos DB, React) | ☐      |       |
| 6.7 | Decision gate        | After Plan, sofIA shows a decision gate                                                          | ☐      |       |
| 6.8 | Dev command guidance | sofIA displays the exact `sofia dev --session <id>` command to run next                          | ☐      |       |

### Plan — MCP Tool Invocation Audit

| #    | Check                                        | Expected Behavior                                                               | Result | Notes              |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------------- | ------ | ------------------ |
| 6.T1 | MS Learn / Azure MCP — architecture guidance | If Azure services are in the plan, Azure docs may be queried for best practices | ☐      | Services queried:  |
| 6.T2 | Context7 — dependency docs                   | If specific npm/pip packages are in the plan, Context7 may be queried           | ☐      | Libraries queried: |
| 6.T3 | Tool call feedback visible                   | Any tool calls during Plan show spinner + summary line                          | ☐      |                    |

---

## 7. Develop Phase (Boundary — workshop side)

### Spec References: FR-036, FR-037, FR-038

| #   | Check               | Expected Behavior                                                          | Result | Notes |
| --- | ------------------- | -------------------------------------------------------------------------- | ------ | ----- |
| 7.1 | PoC intent captured | Target stack, key scenarios, constraints are stored in session `poc` field | ☐      |       |
| 7.2 | Structured data     | Enough structured data exists for `sofia dev` to consume                   | ☐      |       |
| 7.3 | Summary provided    | User-visible summary of PoC scope/decisions is shown                       | ☐      |       |

---

## 8. Cross-Cutting Concerns

### UX & Output Quality

| #   | Check                 | Expected Behavior                                                                                 | Result | Notes |
| --- | --------------------- | ------------------------------------------------------------------------------------------------- | ------ | ----- |
| 8.1 | No raw JSON in output | No SDK JSON events appear in user-facing output (FR-013, FR-058)                                  | ☐      |       |
| 8.2 | Streaming works       | Responses stream incrementally (not all-at-once block) (FR-009)                                   | ☐      |       |
| 8.3 | Tool call summaries   | Tool calls show one-line summaries (FR-043b)                                                      | ☐      |       |
| 8.4 | Spinner behavior      | Spinners appear during waits and clear properly (FR-043a, FR-043c)                                | ☐      |       |
| 8.5 | Thinking spinner      | "Thinking..." spinner appears during silent gaps (after user input, after tool results) (FR-043c) | ☐      |       |
| 8.6 | Ctrl+C handling       | If Ctrl+C is pressed mid-session, session is persisted and recovery info shown                    | ☐      |       |

### Session Integrity

| #    | Check                          | Expected Behavior                                                                            | Result | Notes |
| ---- | ------------------------------ | -------------------------------------------------------------------------------------------- | ------ | ----- |
| 8.7  | Session JSON valid             | Session file is valid JSON and contains all expected fields                                  | ☐      |       |
| 8.8  | Turn history preserved         | Conversation turns for each phase are stored in session                                      | ☐      |       |
| 8.9  | Phase progression correct      | Session `phase` field matches the actual phase completed                                     | ☐      |       |
| 8.10 | No data corruption             | Session JSON matches the session schema without extra or missing required fields             | ☐      |       |
| 8.11 | Discovery enrichment persisted | `session.discoveryEnrichment` contains web search / WorkIQ results (if tools were available) | ☐      |       |

### Error Handling & Recovery

| #    | Check                     | Expected Behavior                                                        | Result | Notes |
| ---- | ------------------------- | ------------------------------------------------------------------------ | ------ | ----- |
| 8.12 | Error classification      | Errors are classified (auth, connection, MCP, timeout, unknown) (FR-047) | ☐      |       |
| 8.13 | Actionable suggestions    | Error messages include remediation guidance (FR-047)                     | ☐      |       |
| 8.14 | Interactive recovery      | Interactive failures return to a recovery decision flow (FR-048)         | ☐      |       |
| 8.15 | Original errors preserved | Underlying error messages are not swallowed (FR-046, FR-059)             | ☐      |       |

### Export (post-workshop)

| #    | Check                          | Expected Behavior                                                                              | Result | Notes |
| ---- | ------------------------------ | ---------------------------------------------------------------------------------------------- | ------ | ----- |
| 8.16 | Export executes                | `sofia export --session <id>` runs without error                                               | ☐      |       |
| 8.17 | Export files present           | Export directory contains: summary.json, discover.md, ideate.md, design.md, select.md, plan.md | ☐      |       |
| 8.18 | Summary JSON valid             | summary.json contains sessionId, exportedAt, phase, status, files, highlights                  | ☐      |       |
| 8.19 | Markdown content quality       | Exported markdown files contain meaningful content (not empty or stub text)                    | ☐      |       |
| 8.20 | Discovery enrichment in export | Discover export includes web search findings and/or WorkIQ insights (if they were available)   | ☐      |       |

---

## 9. MCP Tool Invocation Master Audit

This section provides a consolidated view of all MCP tool calls across the entire session. Fill in after the test run by reviewing debug logs or `--debug` output.

### 9.1 Web Search (`web.search` / Foundry Agent)

| #     | Check                        | Expected Behavior                                                                   | Result | Notes          |
| ----- | ---------------------------- | ----------------------------------------------------------------------------------- | ------ | -------------- |
| 9.1.1 | Configured                   | `isWebSearchConfigured()` returns true (Foundry endpoint + model set in env)        | ☐      |                |
| 9.1.2 | Ephemeral agent created      | Foundry web search agent is created at session start (FR-015 005)                   | ☐      |                |
| 9.1.3 | Ephemeral agent destroyed    | Foundry web search agent is destroyed at session end (FR-015 005)                   | ☐      |                |
| 9.1.4 | Called during Discover       | At least 1–3 web search queries executed during Discover enrichment                 | ☐      | Total queries: |
| 9.1.5 | Called during Dev (if stuck) | If Ralph Loop gets stuck 2+ iterations, web.search is called with failing test info | ☐      |                |
| 9.1.6 | NOT called unnecessarily     | web.search is NOT called when there's no need (e.g., not during Select)             | ☐      |                |
| 9.1.7 | Results have citations       | All web search results include URLs for source verification (FR-014 005)            | ☐      |                |
| 9.1.8 | Latency acceptable           | Search queries return within 10 seconds (SC-003 005)                                | ☐      | Avg latency:   |
| 9.1.9 | Graceful failure             | If Foundry is down, sofIA degrades without crash and warns the user                 | ☐      |                |

### 9.2 WorkIQ (`workiq.*`)

| #     | Check                    | Expected Behavior                                                                      | Result | Notes             |
| ----- | ------------------------ | -------------------------------------------------------------------------------------- | ------ | ----------------- |
| 9.2.1 | Availability detected    | `mcpManager.isAvailable('workiq')` correctly reports status                            | ☐      | Available: yes/no |
| 9.2.2 | Consent before call      | WorkIQ is NEVER called without explicit user consent (FR-020)                          | ☐      |                   |
| 9.2.3 | `analyze_team` called    | If consent given, `analyze_team` is invoked with company summary                       | ☐      |                   |
| 9.2.4 | Response parsed          | WorkIQ response is parsed into teamExpertise, collaborationPatterns, documentationGaps | ☐      |                   |
| 9.2.5 | Insights used downstream | WorkIQ insights appear in Ideate or Design phase context                               | ☐      |                   |
| 9.2.6 | Timeout respected        | WorkIQ call respects 30s timeout                                                       | ☐      |                   |
| 9.2.7 | Graceful failure         | If WorkIQ errors or times out, sofIA continues without crashing                        | ☐      |                   |

### 9.3 Context7 (`context7.*`)

| #     | Check                       | Expected Behavior                                                                             | Result | Notes               |
| ----- | --------------------------- | --------------------------------------------------------------------------------------------- | ------ | ------------------- |
| 9.3.1 | Availability detected       | `mcpManager.isAvailable('context7')` correctly reports status                                 | ☐      | Available: yes/no   |
| 9.3.2 | `resolve-library-id` called | For each dependency, `resolve-library-id` is called first                                     | ☐      | Libraries resolved: |
| 9.3.3 | `query-docs` called         | After resolving, `query-docs` is called with resolved ID + topic                              | ☐      |                     |
| 9.3.4 | Max 5 deps queried          | Context7 limits to first 5 dependencies (skips @types/\*, typescript, vitest)                 | ☐      |                     |
| 9.3.5 | Results in LLM prompt       | Context7 docs appear in the Ralph Loop iteration prompt under "Library Documentation" section | ☐      |                     |
| 9.3.6 | Fallback on failure         | If a single dep query fails, it falls back to an npm link (not a crash)                       | ☐      |                     |
| 9.3.7 | Graceful if unavailable     | If Context7 server is down, enricher returns empty docs (no crash)                            | ☐      |                     |

### 9.4 Azure MCP / Microsoft Learn (`azure.*`)

| #     | Check                       | Expected Behavior                                                                       | Result | Notes             |
| ----- | --------------------------- | --------------------------------------------------------------------------------------- | ------ | ----------------- |
| 9.4.1 | Availability detected       | `mcpManager.isAvailable('azure')` correctly reports status                              | ☐      | Available: yes/no |
| 9.4.2 | Azure keywords detected     | Plan mentions Azure services → `mentionsAzure()` returns true                           | ☐      | Keywords found:   |
| 9.4.3 | `documentation` tool called | Azure MCP `documentation` tool is called with architecture notes                        | ☐      |                   |
| 9.4.4 | Results in LLM prompt       | Azure guidance appears in Ralph Loop prompt under "Azure Architecture Guidance" section | ☐      |                   |
| 9.4.5 | Used in Design phase        | Azure/MS Learn docs used to ground architecture sketches in Design (FR-031)             | ☐      |                   |
| 9.4.6 | Graceful if unavailable     | If Azure MCP is down, enricher returns empty guidance                                   | ☐      |                   |

### 9.5 GitHub MCP (`github.*`)

| #     | Check                      | Expected Behavior                                                                      | Result | Notes             |
| ----- | -------------------------- | -------------------------------------------------------------------------------------- | ------ | ----------------- |
| 9.5.1 | Availability detected      | `mcpManager.isAvailable('github')` correctly reports status                            | ☐      | Available: yes/no |
| 9.5.2 | `create_repository` called | During Dev, GitHub MCP is called to create the PoC repo (or fallback to local)         | ☐      |                   |
| 9.5.3 | `push_files` called        | After each iteration, files are pushed to GitHub repo (with actual content, not empty) | ☐      |                   |
| 9.5.4 | File content not empty     | Pushed files contain actual content read from disk (not empty strings)                 | ☐      |                   |
| 9.5.5 | Repo URL recorded          | Repository URL is stored in session `poc` state                                        | ☐      |                   |
| 9.5.6 | Local fallback             | If GitHub MCP unavailable, PoC is generated locally under `./poc/<sessionId>/`         | ☐      |                   |
| 9.5.7 | Fallback logged            | Local fallback is clearly logged so user knows it's local-only (D-003)                 | ☐      |                   |

### 9.6 MCP Transport Layer

| #     | Check                     | Expected Behavior                                                              | Result | Notes |
| ----- | ------------------------- | ------------------------------------------------------------------------------ | ------ | ----- |
| 9.6.1 | Retry on transient errors | Connection refused / timeout gets one automatic retry with backoff             | ☐      |       |
| 9.6.2 | No retry on auth errors   | Auth/validation errors are NOT retried                                         | ☐      |       |
| 9.6.3 | Timeout per server        | Each MCP server type respects its configured timeout (30s for context7/workiq) | ☐      |       |
| 9.6.4 | Error preserves detail    | MCP errors include server name, tool name, and original error message          | ☐      |       |

---

## 10. Dev Command (PoC Generation) — if running end-to-end

### Spec References: D-001 through D-005, FR-001 through FR-010 (004 spec)

| #     | Check                  | Expected Behavior                                                         | Result | Notes |
| ----- | ---------------------- | ------------------------------------------------------------------------- | ------ | ----- |
| 10.1  | Dev command starts     | `sofia dev --session <id>` starts without errors                          | ☐      |       |
| 10.2  | Session validation     | Dev validates that selection and plan are populated                       | ☐      |       |
| 10.3  | Scaffolding            | Initial PoC project is created with README, package.json, tsconfig, tests | ☐      |       |
| 10.4  | npm install            | Dependencies are installed in the PoC directory                           | ☐      |       |
| 10.5  | Iteration 1            | First Ralph Loop iteration runs (generate code → run tests)               | ☐      |       |
| 10.6  | Test feedback          | Test failures are fed back to the LLM for correction                      | ☐      |       |
| 10.7  | Iteration progress     | Multiple iterations show progress toward passing tests                    | ☐      |       |
| 10.8  | Termination            | Loop terminates (tests pass, max iterations, or user stop)                | ☐      |       |
| 10.9  | PoC output             | Output directory contains working or partially working PoC code           | ☐      |       |
| 10.10 | Session updated        | Session `poc.iterations` and `poc.finalStatus` are updated                | ☐      |       |
| 10.11 | GitHub MCP or fallback | Either pushes to GitHub (if MCP available) or falls back to local (D-003) | ☐      |       |
| 10.12 | Recovery message       | On non-success, shows recovery options with resume command                | ☐      |       |

### Dev — MCP Tool Invocation Audit

| #     | Check                         | Expected Behavior                                                          | Result | Notes                       |
| ----- | ----------------------------- | -------------------------------------------------------------------------- | ------ | --------------------------- |
| 10.T1 | Context7 called per iteration | Context7 queried for PoC dependencies at each iteration (if available)     | ☐      | Iterations with Context7:   |
| 10.T2 | Azure MCP called              | Azure guidance fetched because plan mentions Azure services                | ☐      |                             |
| 10.T3 | web.search called when stuck  | After 2+ stuck iterations (same failures), web.search is used for research | ☐      | Iteration # triggered:      |
| 10.T4 | GitHub MCP — create repo      | `create_repository` called at scaffold time                                | ☐      |                             |
| 10.T5 | GitHub MCP — push files       | `push_files` called after each iteration with non-empty file content       | ☐      | Files pushed per iteration: |
| 10.T6 | Tool results in prompt        | MCP-fetched context appears in the iteration prompt to the LLM             | ☐      |                             |

---

## 11. Infrastructure (005 spec) — if testing deployment

### Spec References: FR-001 through FR-018 (005 spec)

| #    | Check                | Expected Behavior                                                                       | Result | Notes |
| ---- | -------------------- | --------------------------------------------------------------------------------------- | ------ | ----- |
| 11.1 | Deploy script exists | `infra/deploy.sh` is present and executable                                             | ☐      |       |
| 11.2 | Bicep template valid | `infra/main.bicep` passes `az bicep build` without errors                               | ☐      |       |
| 11.3 | Parameterized        | Template accepts resource group, region, model deployment overrides                     | ☐      |       |
| 11.4 | Teardown exists      | `infra/teardown.sh` exists and works                                                    | ☐      |       |
| 11.5 | .env output          | Deploy script writes FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_MODEL_DEPLOYMENT_NAME to .env | ☐      |       |
| 11.6 | Web search works     | After deployment, web.search tool returns results with citations                        | ☐      |       |

---

## Summary Scorecard

| Section                      | Total Checks | Pass | Fail | Partial | Score |
| ---------------------------- | ------------ | ---- | ---- | ------- | ----- |
| 0. Pre-flight                | 5            |      |      |         |       |
| 1. CLI Startup               | 7            |      |      |         |       |
| 2. Discover (functional)     | 16           |      |      |         |       |
| 2. Discover (MCP audit)      | 14           |      |      |         |       |
| 3. Ideate (functional)       | 12           |      |      |         |       |
| 3. Ideate (MCP audit)        | 2            |      |      |         |       |
| 4. Design (functional)       | 8            |      |      |         |       |
| 4. Design (MCP audit)        | 9            |      |      |         |       |
| 5. Select (functional)       | 6            |      |      |         |       |
| 5. Select (MCP audit)        | 1            |      |      |         |       |
| 6. Plan (functional)         | 8            |      |      |         |       |
| 6. Plan (MCP audit)          | 3            |      |      |         |       |
| 7. Develop Boundary          | 3            |      |      |         |       |
| 8. Cross-Cutting             | 20           |      |      |         |       |
| 9. MCP Master Audit          | 30           |      |      |         |       |
| 10. Dev Command (functional) | 12           |      |      |         |       |
| 10. Dev Command (MCP audit)  | 6            |      |      |         |       |
| 11. Infrastructure           | 6            |      |      |         |       |
| **TOTAL**                    | **168**      |      |      |         |       |

---

## Test Notes & Observations

_(To be filled during/after the test run)_

### Environment Issues

-

### MCP Availability Summary

| Server               | Available? | Called? | Successful? | Degraded Gracefully? |
| -------------------- | ---------- | ------- | ----------- | -------------------- |
| web.search (Foundry) |            |         |             |                      |
| WorkIQ               |            |         |             |                      |
| Context7             |            |         |             |                      |
| Azure / MS Learn     |            |         |             |                      |
| GitHub MCP           |            |         |             |                      |

### Bugs Found

-

### Unexpected Behaviors

-

### Positive Surprises

-

### Content Quality Assessment

| Phase    | Output quality (1–5) | Key observation |
| -------- | -------------------- | --------------- |
| Discover |                      |                 |
| Ideate   |                      |                 |
| Design   |                      |                 |
| Select   |                      |                 |
| Plan     |                      |                 |
| Develop  |                      |                 |

### Recommendations

-

---

_This checklist is designed to validate sofIA against specs 001–005 using the Zava Industries scenario, with particular attention to MCP tool invocation, web search, WorkIQ, Context7, Azure MCP, and GitHub MCP usage across all phases._
