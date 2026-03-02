# Contract: Discovery Phase Enrichment

**Feature**: 003-mcp-transport-integration  
**Modules**: `src/phases/discoveryEnricher.ts`, `src/shared/schemas/session.ts`  
**Status**: Authoritative design document

---

## Overview

After the user provides company and team information in Step 1 of the discovery workshop, the system optionally enriches the session with:

1. **Web search results** — recent company news, competitor activity, industry trends
2. **WorkIQ insights** — internal team collaboration patterns and expertise (requires explicit user consent and WorkIQ availability)

Enrichment is stored in `WorkshopSession.discovery.enrichment` and is referenced by subsequent phases (ideation, planning) to improve PoC relevance.

---

## DiscoveryEnricher Interface

```typescript
// src/phases/discoveryEnricher.ts

export interface DiscoveryEnricherOptions {
  /** Company and team summary from Step 1 (used to build search queries) */
  companySummary: string;
  /** MCP manager for WorkIQ tool calls */
  mcpManager: McpManager;
  /** IO for permission prompts and progress messages */
  io: LoopIO;
  /** Activity spinner for visual feedback */
  spinner?: ActivitySpinner;
  /** Web search client (defaults to production webSearch module) */
  webSearchClient?: WebSearchClient;
}

export class DiscoveryEnricher {
  /**
   * Run the full enrichment flow: web search + optional WorkIQ.
   * Returns a populated DiscoveryEnrichment object (may have empty fields
   * if all enrichment sources are unavailable).
   */
  async enrich(options: DiscoveryEnricherOptions): Promise<DiscoveryEnrichment>;

  /**
   * Run only the web search enrichment step.
   * Does not prompt the user.
   */
  async enrichFromWebSearch(
    companySummary: string,
    webSearchClient: WebSearchClient,
  ): Promise<Partial<DiscoveryEnrichment>>;

  /**
   * Run only the WorkIQ enrichment step.
   * Prompts the user for consent before making any WorkIQ calls.
   * Returns empty partial if user declines or WorkIQ unavailable.
   */
  async enrichFromWorkIQ(
    companySummary: string,
    mcpManager: McpManager,
    io: LoopIO,
  ): Promise<Partial<DiscoveryEnrichment>>;
}
```

---

## enrich() Orchestration Flow

```
Step 1 input collected
      │
      ▼
[Web Search Available?] ──no──► skip, continue
      │ yes
      ▼
io.writeActivity('Searching for recent company and industry context...')
spinner.start('Enriching discovery context')
      │
      ▼
enrichFromWebSearch(companySummary)
      │
      ▼
[WorkIQ MCP Available?] ──no──► skip to session save
      │ yes
      ▼
io.writeActivity('WorkIQ is available — it can analyze your team's internal context.')
io.prompt('May sofIA query WorkIQ for team insights? [y/N]')
      │
      ├── no/timeout ──► skip WorkIQ
      │
      ▼ yes
enrichFromWorkIQ(companySummary)
      │
      ▼
Merge partial enrichments → DiscoveryEnrichment
Set enrichment.enrichedAt = new Date().toISOString()
Set enrichment.sourcesUsed = ['websearch'?, 'workiq'?]
session.discovery.enrichment = enrichment
onSessionUpdate(session)
spinner.stop()
io.writeActivity('Discovery context enriched ✓')
```

---

## enrichFromWebSearch() Contract

### Web Search Query Strategy

Three sequential queries (or as many as return results before timeout):

| Query                                       | Purpose             |
| ------------------------------------------- | ------------------- |
| `"${company name} recent news 2024 2025"`   | Company news        |
| `"${company name} competitors market 2024"` | Competitor activity |
| `"${industry or domain} AI trends 2025"`    | Industry trends     |

The company name and industry are extracted from `companySummary` via simple keyword heuristic (first quoted proper noun, or first capitalized multi-word sequence).

### Response Mapping

```typescript
// From WebSearchResult:
{
  companyNews: results[0]?.results.map(r => `${r.title}: ${r.snippet}`),
  competitorInfo: results[1]?.results.map(r => `${r.title}: ${r.snippet}`),
  industryTrends: results[2]?.results.map(r => `${r.title}: ${r.snippet}`),
  webSearchResults: [results].flatMap(r => r.results).map(r => r.snippet).join('\n'),
}
```

Array fields are capped at 10 items each.

### Graceful Degradation

| Condition                                                   | Behavior                                   |
| ----------------------------------------------------------- | ------------------------------------------ |
| Web search not configured (`isWebSearchConfigured()` false) | Return `{}` immediately, no prompt shown   |
| `WebSearchResult.degraded` is `true`                        | Return `{}` with no error surfaced to user |
| Individual query throws                                     | Log debug, continue with remaining queries |

---

## enrichFromWorkIQ() Contract

### Permission Gate

**REQUIRED**: Show a consent prompt before any WorkIQ call:

```
sofIA can query WorkIQ to analyze your team's internal context
(meeting patterns, expertise areas, documentation gaps).
This requires access to your Microsoft 365 tenant.

May sofIA access WorkIQ for team insights? (y/N)
```

If the user responds `n` or `N` (or presses Enter for the default):

- Return `{}` immediately
- Do NOT call any WorkIQ tool
- Log at `info` level: `'User declined WorkIQ enrichment'`

### WorkIQ Tool Call

```typescript
mcpManager.callTool(
  'workiq',
  'analyze_team',
  {
    summary: companySummary,
    focus: ['expertise', 'collaboration', 'documentation'],
  },
  { timeoutMs: 30_000 },
);
```

Response field extraction:

- `response.teamExpertise` → `workiqInsights.teamExpertise`
- `response.collaborationPatterns` → `workiqInsights.collaborationPatterns`
- `response.documentationGaps` → `workiqInsights.documentationGaps`
- `response.insights` (fallback, split by newline) → all three fields

### Graceful Degradation

| Condition                                  | Behavior                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `mcpManager.isAvailable('workiq')` false   | Return `{}`, no prompt shown, log info `'WorkIQ not available'`                                  |
| `callTool` throws `auth-failure`           | Return `{}`, show message: `'WorkIQ authentication required — skipping team insights'`           |
| `callTool` throws timeout/connection error | Return `{}`, log warn, show message: `'WorkIQ temporarily unavailable — skipping team insights'` |
| User declines consent                      | Return `{}`, no WorkIQ calls                                                                     |

---

## Session Schema Extension

```typescript
// src/shared/schemas/session.ts

// DiscoveryEnrichmentSchema (new)
export const DiscoveryEnrichmentSchema = z.object({
  webSearchResults: z.string().optional(),
  companyNews: z.array(z.string()).max(10).optional(),
  competitorInfo: z.array(z.string()).max(10).optional(),
  industryTrends: z.array(z.string()).max(10).optional(),
  workiqInsights: z
    .object({
      teamExpertise: z.array(z.string()).max(10).optional(),
      collaborationPatterns: z.array(z.string()).max(10).optional(),
      documentationGaps: z.array(z.string()).max(10).optional(),
    })
    .optional(),
  enrichedAt: z.string().datetime().optional(),
  sourcesUsed: z.array(z.string()).optional(),
});

// DiscoveryStateSchema (modified — add enrichment field)
export const DiscoveryStateSchema = z.object({
  // ... existing fields ...
  enrichment: DiscoveryEnrichmentSchema.optional(),
});
```

**Backward compatibility**: `enrichment` is optional. Sessions from Feature 001/002 parse without errors.

---

## Downstream Phase Usage

When `session.discovery.enrichment` is non-empty, the enrichment is injected into the ideation and planning phase prompts:

```markdown
## Discovery Context (from market research)

**Recent Company News**:

- {companyNews[0]}
- {companyNews[1]}

**Competitive Landscape**:

- {competitorInfo[0]}

**Industry Trends**:

- {industryTrends[0]}

**Internal Team Context** (from WorkIQ):

- Expertise: {workiqInsights.teamExpertise.join(', ')}
- Collaboration: {workiqInsights.collaborationPatterns.join(', ')}
```

This injection is the responsibility of the ideation/planning phase prompt builder, not `DiscoveryEnricher`.

---

## Acceptance Tests

| Test                                                                | Type        | Description                                        |
| ------------------------------------------------------------------- | ----------- | -------------------------------------------------- |
| `enrich runs web search when configured`                            | unit        | webSearchClient called with company queries        |
| `enrich skips web search when not configured`                       | unit        | Returns without querying                           |
| `enrich shows WorkIQ prompt when available`                         | unit        | io.prompt called before WorkIQ                     |
| `enrich calls WorkIQ when user consents`                            | unit        | callTool('workiq', 'analyze_team', ...) dispatched |
| `enrich skips WorkIQ when user declines`                            | unit        | No callTool for workiq                             |
| `enrich skips WorkIQ when not available`                            | unit        | No prompt shown, no callTool                       |
| `enrich stores enrichedAt timestamp`                                | unit        | ISO string set                                     |
| `enrich stores sourcesUsed correctly`                               | unit        | Reflects which sources ran                         |
| `enrichFromWebSearch builds three queries from companySummary`      | unit        | Query construction                                 |
| `enrichFromWebSearch caps array fields at 10 items`                 | unit        | Boundary check                                     |
| `enrichFromWebSearch returns empty on degraded search`              | unit        | Graceful degradation                               |
| `enrichFromWorkIQ returns empty on auth-failure`                    | unit        | Auth error handling                                |
| `enrichFromWorkIQ returns empty on timeout`                         | unit        | Timeout handling                                   |
| `enrichFromWorkIQ returns empty on user decline`                    | unit        | No-consent path                                    |
| `discoveryEnricher saves enrichment to session via onSessionUpdate` | integration | Session persistence                                |
| `phaseHandler injects enrichment into ideation prompt`              | integration | Downstream usage                                   |
