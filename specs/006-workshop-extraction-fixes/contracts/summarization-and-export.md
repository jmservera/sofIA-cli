# Contract: Post-Phase Summarization Call

**Feature**: 006-workshop-extraction-fixes  
**FRs**: FR-001 through FR-007

## Purpose

After each phase's conversation loop completes, if the expected structured session field is still `null`, make a one-shot LLM call to extract structured data from the full conversation transcript.

## Interface

### Input

```
phaseSummarize(
  client: CopilotClient,
  phase: PhaseValue,
  session: WorkshopSession,
  handler: PhaseHandler
): Promise<Partial<WorkshopSession>>
```

### Behavior

1. Check if the relevant session field for `phase` is still null:
   - Ideate: `session.ideas`
   - Design: `session.evaluation`
   - Select: `session.selection`
   - Plan: `session.plan`
   - Develop: `session.poc`
   - Discover: `session.businessContext` (unlikely to be null, but included for completeness)

2. If the field is already populated, return `{}` (no-op).

3. Build the phase transcript from `session.turns` filtered by `t.phase === phase`.

4. Create a new `ConversationSession` with a phase-specific summarization system prompt loaded from `src/prompts/summarize/{phase}-summary.md`.

5. Send the transcript as a single user message. Collect the full response.

6. Run `handler.extractResult(session, response)` on the summarization response.

7. Return the extracted updates (may be `{}` if extraction still fails).

### Error Handling

- If `client.createSession()` or `send()` throws, log a warning and return `{}`.
- If the response doesn't contain valid JSON matching the schema, log a warning and return `{}`.
- Never throw — the summarization call is a best-effort fallback.

### Summarization Prompt Shape (per phase)

Each prompt in `src/prompts/summarize/{phase}-summary.md` MUST include:

1. A role instruction: "You are a data extraction assistant."
2. The exact JSON schema shape expected (with field names, types, and constraints).
3. An instruction to output ONLY a fenced JSON code block.
4. For Design phase: additionally request a Mermaid architecture diagram (FR-007a).

---

# Contract: Export Writer Conversation Fallback

**Feature**: 006-workshop-extraction-fixes  
**FRs**: FR-020 through FR-024

## Purpose

Export Markdown files for all phases that had conversation data, even if structured session fields are null.

## Interface

Each `generate{Phase}Markdown(session: WorkshopSession): string | null` function follows this contract:

### Output Structure (when both structured data and turns exist)

```markdown
# {Phase} Phase

## {Structured Section — phase-specific}

{Rendered from session field if non-null}

## Conversation

**user**: {turn content}

**assistant**: {turn content}
...
```

### Output Structure (when only turns exist)

```markdown
# {Phase} Phase

## Conversation

**user**: {turn content}

**assistant**: {turn content}
...
```

### Returns `null` Only When

- No structured data AND no conversation turns exist for the phase.

### `summary.json` Enhancement

```json
{
  "files": [
    { "path": "discover.md", "type": "markdown" },
    { "path": "ideate.md", "type": "markdown" },
    { "path": "design.md", "type": "markdown" },
    { "path": "select.md", "type": "markdown" },
    { "path": "plan.md", "type": "markdown" },
    { "path": "develop.md", "type": "markdown" }
  ],
  "highlights": [
    "Business: {from businessContext}",
    "Ideas: {count} ideas generated",
    "Selection: {ideaId or 'pending'}",
    "Plan: {milestone count} milestones",
    ...
  ]
}
```

Highlights include at least one entry per phase with turns, even if the structured field is null. Fallback highlights use the first assistant turn's opening sentence (truncated to 100 chars).
