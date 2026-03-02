# Contract: MCP Context Enricher (Real Integration)

**Feature**: 003-mcp-transport-integration  
**Module**: `src/develop/mcpContextEnricher.ts`  
**Status**: Authoritative design document (replaces stub behavior from Feature 002)

---

## Overview

`McpContextEnricher` conditionally queries three MCP servers to enrich LLM iteration prompts:

1. **Context7** — library documentation for PoC dependencies
2. **Azure MCP** — architecture guidance when plan references Azure services
3. **Web Search** — solutions to failing tests when stuck (2+ consecutive iterations)

All three methods use real MCP `callTool()` invocations (replacing hardcoded strings). All degrade gracefully when their respective servers are unavailable.

---

## queryContext7() Contract

### When Invoked

Only when:

- `mcpManager.isAvailable('context7')` is `true`
- `dependencies.length > 0`

### Tool Call Sequence (per dependency)

**Step 1: Resolve library ID**

```typescript
mcpManager.callTool(
  'context7',
  'resolve-library-id',
  {
    libraryName: dep, // e.g., 'express', 'zod'
  },
  { timeoutMs: 30_000 },
);
```

Response field extraction for `libraryId`:

- `response.libraryId` (primary)
- `response.id` (fallback)
- If neither present: skip to fallback link (do not throw)

**Step 2: Query docs (only if libraryId resolved)**

```typescript
mcpManager.callTool(
  'context7',
  'query-docs',
  {
    libraryId, // e.g., '/expressjs/express'
    topic: dep, // hint to focus the query
  },
  { timeoutMs: 30_000 },
);
```

Response field extraction for documentation text:

- `response.content` (string, primary)
- `response.text` (string, fallback)
- If neither present: use fallback link

### Dependency Filter Rules

| Dependency                    | Skip?                                        |
| ----------------------------- | -------------------------------------------- |
| Starts with `@types/`         | ✅ Skip (type-only package)                  |
| `typescript`                  | ✅ Skip (well-known, no runtime docs needed) |
| `vitest`                      | ✅ Skip (test-only)                          |
| `node`                        | ✅ Skip                                      |
| First 5 non-skipped deps only | Process (others skipped to limit tokens)     |

### Fallback

When Context7 is unavailable OR a dependency resolution fails:

```
- **{dep}**: See https://www.npmjs.com/package/{dep} for API documentation
```

### Output Format

```
- **express**:
{documentation text from Context7}

- **zod**:
{documentation text from Context7}
```

---

## queryAzureMcp() Contract

### When Invoked

Only when:

- `mcpManager.isAvailable('azure')` is `true`
- `architectureNotes` contains at least one Azure keyword (existing detection logic)

### Tool Call

```typescript
mcpManager.callTool(
  'azure',
  'documentation',
  {
    query: `Best practices for ${detectedKeywords.join(', ')} in Azure`,
  },
  { timeoutMs: 30_000 },
);
```

Response field extraction:

- `response.content` (string, primary)
- `response.text` (string, fallback)
- If neither: fall through to static guidance

### Fallback (when Azure MCP unavailable or call fails)

Return static guidance string (existing behavior):

```
Detected Azure services: {detected.join(', ')}
Use the @azure/identity DefaultAzureCredential for authentication.
Prefer connection strings from environment variables (never hardcode).
```

---

## queryWebSearch() Contract

### When Invoked

Only when:

- `isWebSearchConfigured()` returns `true` (env var `AZURE_AI_FOUNDRY_ENDPOINT` set)
- `stuckIterations >= 2`
- `failingTests.length > 0`

### Invocation Priority

1. **Prefer MCP-based search** (if `mcpManager.isAvailable('websearch')`):

   ```typescript
   mcpManager.callTool(
     'websearch',
     'search',
     {
       query: `how to fix: ${failingTests.slice(0, 3).join('; ')}`,
     },
     { timeoutMs: 30_000 },
   );
   ```

   Response: `response.content` or `response.text`

2. **Fall back to Azure AI Foundry bridge** (existing `webSearch.ts` implementation):
   ```typescript
   // Already implemented in src/mcp/webSearch.ts
   webSearchClient.search(query);
   ```

### Output Format

When results are returned:

```
Search results for: "{query}"

{formatted search results}
```

When no results available:

```
Web search for: "{query}" — no results available in this environment.
```

---

## enrich() Orchestration Contract

```typescript
async enrich(options: EnricherOptions): Promise<EnrichedContext>
```

### Execution Order

1. Context7 query (parallel-safe, independent)
2. Azure MCP query (parallel-safe, independent)
3. Web search (only if stuck — gated by `stuckIterations >= 2`)

**Parallelism**: Queries 1 and 2 MAY be run concurrently with `Promise.allSettled()` to reduce latency. Web search runs sequentially after both to avoid unnecessary API calls when Context7 already unblocks the LLM.

### EnrichedContext Assembly

```typescript
{
  libraryDocs,      // from Context7 (undefined if unavailable)
  azureGuidance,    // from Azure MCP (undefined if unavailable)
  webSearchResults, // from web search (undefined if not stuck or unavailable)
  combined: parts.join('\n\n'),  // non-empty parts assembled as markdown sections
}
```

---

## Graceful Degradation Matrix

| Server          | Unavailable Behavior                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| `context7`      | Returns npm links instead of real docs. `combined` omits Context7 section.              |
| `azure`         | Returns static guidance string. `combined` uses static string.                          |
| `websearch`     | Falls back to Azure AI Foundry bridge. If also unavailable, returns placeholder string. |
| All unavailable | `combined` is empty string. Ralph Loop continues with LLM's baseline knowledge.         |

---

## Acceptance Tests

| Test                                                            | Type | Description                        |
| --------------------------------------------------------------- | ---- | ---------------------------------- |
| `queryContext7 calls resolve-library-id for each dependency`    | unit | Verify tool calls dispatched       |
| `queryContext7 uses libraryId from response.libraryId`          | unit | Primary field extraction           |
| `queryContext7 uses libraryId from response.id as fallback`     | unit | Fallback field extraction          |
| `queryContext7 skips @types/* dependencies`                     | unit | Filter rule                        |
| `queryContext7 skips typescript and vitest dependencies`        | unit | Filter rule                        |
| `queryContext7 processes max 5 non-skipped deps`                | unit | Limit rule                         |
| `queryContext7 returns npm link when resolve-library-id fails`  | unit | Graceful degradation               |
| `queryContext7 returns npm link when libraryId missing`         | unit | No libraryId in response           |
| `queryContext7 returns undefined when context7 unavailable`     | unit | `isAvailable('context7')` false    |
| `queryAzureMcp calls documentation tool with detected keywords` | unit | Tool dispatched with correct query |
| `queryAzureMcp extracts content from response.content`          | unit | Primary field                      |
| `queryAzureMcp falls back to static guidance on callTool error` | unit | Graceful degradation               |
| `queryAzureMcp returns undefined when azure unavailable`        | unit | `isAvailable('azure')` false       |
| `queryWebSearch calls websearch.search when server available`   | unit | MCP tool dispatch                  |
| `queryWebSearch uses Azure AI Foundry bridge as fallback`       | unit | Bridge used when MCP unavailable   |
| `queryWebSearch returns undefined when not configured`          | unit | `isWebSearchConfigured()` false    |
| `enrich returns combined string with all available contexts`    | unit | All three sections present         |
| `enrich skips web search when stuckIterations < 2`              | unit | Gate enforced                      |
| `enrich handles all servers unavailable gracefully`             | unit | Empty combined, no throws          |
