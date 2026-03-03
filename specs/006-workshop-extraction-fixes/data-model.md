# Data Model: Workshop Phase Extraction & Tool Wiring Fixes

**Feature**: 006-workshop-extraction-fixes  
**Date**: 2026-03-04

## New Entities

### SummarizedPhaseContext

A compact, deterministic projection of all structured session fields from prior phases. Used to build the system prompt for each new phase, replacing ad-hoc per-handler context injection.

| Field                  | Type                               | Source                                                                       | Description                                               |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| `businessSummary`      | `string?`                          | `session.businessContext.businessDescription`                                | Company/business description from Discover                |
| `challenges`           | `string[]?`                        | `session.businessContext.challenges`                                         | Key challenges from Discover                              |
| `topicArea`            | `string?`                          | `session.topic.topicArea`                                                    | Chosen workshop focus area                                |
| `workflowSteps`        | `string[]?`                        | `session.workflow.activities[].name`                                         | Activity names from the workflow map                      |
| `enrichmentHighlights` | `string[]?`                        | `session.discovery.enrichment.{industryTrends, companyNews, workiqInsights}` | Web search and WorkIQ highlights from Discover enrichment |
| `ideaSummaries`        | `Array<{id, title, description}>?` | `session.ideas[]`                                                            | Idea card summaries from Ideate                           |
| `evaluationSummary`    | `string?`                          | `session.evaluation`                                                         | Evaluation method + idea count from Design                |
| `selectionSummary`     | `string?`                          | `session.selection`                                                          | Selected idea ID + rationale from Select                  |
| `planMilestones`       | `string[]?`                        | `session.plan.milestones[].title`                                            | Milestone titles from Plan                                |
| `architectureNotes`    | `string?`                          | `session.plan.architectureNotes`                                             | Architecture description from Plan                        |

**Relationships**: Pure projection from `WorkshopSession` fields. No persistence — generated on-the-fly at each phase transition.

**Validation**: No schema validation needed (it's a rendering utility). Each field is optional; missing fields are omitted from the rendered output.

---

### PhaseSummarizationPrompt

The system prompt sent to the LLM during the post-phase summarization call. Phase-specific.

| Field               | Type         | Description                                                                      |
| ------------------- | ------------ | -------------------------------------------------------------------------------- |
| `phase`             | `PhaseValue` | Which phase this summarization targets                                           |
| `systemPrompt`      | `string`     | Loaded from `src/prompts/summarize/{phase}-summary.md`                           |
| `targetSchemaShape` | `string`     | JSON schema example embedded in the prompt (matched to Zod schema)               |
| `phaseTranscript`   | `string`     | Full conversation transcript for the phase (user + assistant turns concatenated) |

**Relationships**: One summarization prompt per phase (6 total, though Discover may not need one since `businessContext` extraction already works). The prompt template references the Zod schema from `session.ts`.

---

### McpWorkshopConfig

Configuration passed from `workshopCommand.ts` to phase handler factories.

| Field             | Type               | Description                         |
| ----------------- | ------------------ | ----------------------------------- |
| `mcpManager`      | `McpManager?`      | MCP manager instance for tool calls |
| `webSearchClient` | `WebSearchClient?` | Foundry web search client           |

**Relationships**: Extends the existing `PhaseHandlerConfig`. Passed to `createPhaseHandler()` which distributes to individual handler factories.

---

## Modified Entities

### WorkshopSession (existing — no schema changes)

No fields are added or modified on the session schema. All 29 FRs operate on **existing** session fields:

- `businessContext` (Discover)
- `workflow` (Discover)
- `ideas` (Ideate)
- `evaluation` (Design)
- `selection` (Select)
- `plan` (Plan)
- `poc` (Develop)
- `turns[]` (all phases)
- `discovery.enrichment` (Discover enrichment)

The only change is that these fields will now be **reliably populated** thanks to the summarization call fallback.

### PhaseHandlerConfig (existing — extended)

Currently:

```
{ discover?: DiscoverHandlerConfig }
```

After:

```
{ discover?: DiscoverHandlerConfig, mcpManager?: McpManager, webSearchClient?: WebSearchClient }
```

### ConversationLoopOptions (existing — extended)

Added field:

- `infiniteSessions?: { enabled?: boolean, backgroundCompactionThreshold?: number, bufferExhaustionThreshold?: number }` — forwarded to the SDK session for context compaction.

---

## State Transitions

No new state transitions. The existing phase progression is unchanged:

```
Discover → Ideate → Design → Select → Plan → Develop → Complete
```

Each transition now has an additional step between the conversation loop completing and the decision gate:

```
ConversationLoop exits
  → Post-phase summarization call (if structured fields still null)
  → Session persisted with extracted data
  → Decision gate shown to user
```

---

## Data Flow Diagram

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│ Phase N conv │────▸│ extractResult│────▸│ session field set?│
│  loop exits  │     │ (per-turn)   │     │   (e.g. ideas)   │
└──────┬───────┘     └──────────────┘     └────────┬─────────┘
       │                                           │
       │                                    yes ───┴─── no
       │                                    │           │
       │                                    │     ┌─────▼──────────┐
       │                                    │     │ Summarization  │
       │                                    │     │ LLM call       │
       │                                    │     │ (new session)  │
       │                                    │     └──────┬─────────┘
       │                                    │            │
       │                                    │     ┌──────▼─────────┐
       │                                    │     │ extractResult  │
       │                                    │     │ on summary     │
       │                                    │     └──────┬─────────┘
       │                                    │            │
       ▼                                    ▼            ▼
┌──────────────────────────────────────────────────────────┐
│              Session persisted with data                  │
└──────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐     ┌───────────────────────┐
│ Context      │────▸│ Phase N+1 starts with │
│ summarizer   │     │ SummarizedPhaseContext │
└──────────────┘     └───────────────────────┘
```
