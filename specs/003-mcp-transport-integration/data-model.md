# Data Model: MCP Transport Integration

**Feature ID**: 003-mcp-transport-integration  
**Date**: 2026-03-01  
**Status**: Complete

---

## Overview

This feature introduces three new logical entities and extends two existing ones:

| Entity                | Status       | Module                          |
| --------------------- | ------------ | ------------------------------- |
| `McpTransport`        | **NEW**      | `src/mcp/mcpTransport.ts`       |
| `ToolCallRequest`     | **NEW**      | `src/mcp/mcpTransport.ts`       |
| `ToolCallResponse`    | **NEW**      | `src/mcp/mcpTransport.ts`       |
| `DiscoveryEnrichment` | **NEW**      | `src/shared/schemas/session.ts` |
| `McpManager`          | **EXTENDED** | `src/mcp/mcpManager.ts`         |
| `DiscoveryState`      | **EXTENDED** | `src/shared/schemas/session.ts` |

---

## Entity 1: McpTransport (Interface + Implementations)

**Purpose**: Abstracts the communication channel to a single MCP server. Handles connection lifecycle and JSON-RPC framing.

### Interface

```typescript
/**
 * Common interface for all MCP transport implementations.
 * A transport represents a live connection to one MCP server.
 */
export interface McpTransport {
  /**
   * Invoke a named tool on this MCP server.
   * Throws McpTransportError on failure (callers use classifyMcpError).
   */
  callTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ToolCallResponse>;

  /** Whether the transport is currently connected and able to accept calls. */
  isConnected(): boolean;

  /** Gracefully disconnect (terminate subprocess or close HTTP keepalive). */
  disconnect(): Promise<void>;
}
```

### StdioMcpTransport

**Module**: `src/mcp/mcpTransport.ts`  
**Description**: Manages a long-lived child process for stdio-based MCP servers (Context7, Azure MCP, WorkIQ, Playwright).

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `config` | `StdioServerConfig` | Server name, command, args from `.vscode/mcp.json` |
| `process` | `ChildProcess \| null` | The spawned subprocess |
| `pendingRequests` | `Map<number, PendingRequest>` | In-flight JSON-RPC requests keyed by id |
| `nextId` | `number` | Auto-incrementing JSON-RPC request id counter |
| `connected` | `boolean` | Whether the initialization handshake completed |

**Lifecycle**:

1. `connect()`: `spawn()` subprocess, send `initialize` JSON-RPC request, wait for `initialized` response. Sets `connected = true`.
2. `callTool()`: Generate next id, create `PendingRequest` with resolve/reject + timeout, write JSON-RPC request to `process.stdin`, wait for matching response id on `process.stdout`.
3. `disconnect()`: Send `shutdown` request (optional), then `process.kill()`, clear pending requests with `McpTransportError`.

**Validation rules**:

- Subprocess must respond to `initialize` within 5 seconds or `connect()` throws.
- Malformed stdout (non-JSON lines) are silently skipped (debug-logged).
- If subprocess exits unexpectedly, all pending requests are rejected with `connection-refused` class error.

### HttpMcpTransport

**Module**: `src/mcp/mcpTransport.ts`  
**Description**: Stateless HTTPS tool calls for HTTP-based MCP servers (GitHub MCP, Microsoft Docs MCP).

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `config` | `HttpServerConfig` | Server name and URL from `.vscode/mcp.json` |
| `nextId` | `number` | Auto-incrementing request id |

**Behavior**:

- Each `callTool()` makes one `fetch()` POST to `config.url`.
- `AbortController` enforces `timeoutMs`.
- `Authorization: Bearer <GITHUB_TOKEN>` added when `process.env.GITHUB_TOKEN` is set.
- No persistent connection (`isConnected()` always returns `true` if the URL is reachable).

**Validation rules**:

- HTTP 4xx responses with status 401/403 → `auth-failure` error class.
- HTTP 5xx responses → `unknown` error class (not retried).
- Non-JSON response body → `unknown` error class.
- Missing `GITHUB_TOKEN` for authenticated endpoints → `auth-failure` (immediate, no retry).

---

## Entity 2: ToolCallRequest

**Purpose**: Structured input for a tool call — server, tool, args, and policy configuration.

```typescript
export interface ToolCallRequest {
  /** MCP server name as defined in .vscode/mcp.json (e.g., 'github', 'context7') */
  serverName: string;
  /** Tool name to invoke on the server (e.g., 'create_repository', 'resolve-library-id') */
  toolName: string;
  /** Tool arguments — must match the tool's declared JSON Schema */
  args: Record<string, unknown>;
  /**
   * Timeout in milliseconds.
   * Default: 30_000 for query tools, 60_000 for repo operations.
   */
  timeoutMs?: number;
  /**
   * Whether to apply retry policy for transient errors.
   * Default: true
   */
  retryOnTransient?: boolean;
}
```

**Validation rules**:

- `serverName` must be a key in the loaded `McpConfig.servers` — throws `Error` if unknown.
- `toolName` must be a non-empty string.
- `args` must be a plain object (no prototype chain, no Functions).
- `timeoutMs` must be between 1_000 and 120_000 ms when provided.

---

## Entity 3: ToolCallResponse

**Purpose**: Parsed and normalized output from an MCP tool call.

```typescript
export interface ToolCallResponse {
  /**
   * The tool's result content. For MCP protocol, this is the parsed
   * `result.content[0].text` value (or the full `result` object if no content array).
   */
  content: Record<string, unknown> | string;
  /** Raw MCP response for debugging (not logged in production) */
  raw?: unknown;
  /** Whether this response came from a retry attempt */
  wasRetried?: boolean;
}
```

**Validation rules**:

- If the MCP JSON-RPC response contains `error`, throw `McpTransportError` with the error message.
- If `result.content` is an array, use `content[0].text` as the content (standard MCP protocol format).
- If `result.content` is an object (some servers return directly), use it as-is.
- `content` must never be undefined in a successful response — throw if result is empty.

---

## Entity 4: DiscoveryEnrichment

**Purpose**: Optional context gathered during the discovery phase, stored in the session for downstream phases (ideation, planning).

**Module**: `src/shared/schemas/session.ts`

### Zod Schema

```typescript
export const DiscoveryEnrichmentSchema = z.object({
  /** Raw web search summary text (combined from all queries) */
  webSearchResults: z.string().optional(),
  /** Recent news headlines/snippets about the company */
  companyNews: z.array(z.string()).optional(),
  /** Competitor activity summaries */
  competitorInfo: z.array(z.string()).optional(),
  /** Industry trend descriptions */
  industryTrends: z.array(z.string()).optional(),
  /** WorkIQ-derived team insights (only present if user consented) */
  workiqInsights: z
    .object({
      /** Identified team skill areas */
      teamExpertise: z.array(z.string()).optional(),
      /** Meeting/communication patterns identified */
      collaborationPatterns: z.array(z.string()).optional(),
      /** Areas lacking internal documentation */
      documentationGaps: z.array(z.string()).optional(),
    })
    .optional(),
  /** ISO 8601 timestamp when enrichment was collected */
  enrichedAt: z.string().optional(),
  /** Which sources were queried ('websearch', 'workiq') */
  sourcesUsed: z.array(z.string()).optional(),
});

export type DiscoveryEnrichment = z.infer<typeof DiscoveryEnrichmentSchema>;
```

### Relationships

- **Belongs to `DiscoveryState`**: Added as `enrichment?: DiscoveryEnrichment` on the existing `DiscoveryState` schema.
- **Referenced by ideation/planning phases**: The enrichment fields are injected into LLM prompts as additional context when non-empty.

### State Transitions

```
DiscoveryEnrichment states:
  absent    → populated   (after user provides Step 1 input and enrichment completes)
  populated → updated     (if user re-runs Step 1; enrichment is replaced, not merged)
```

**Validation rules**:

- All fields are optional; a completely empty `DiscoveryEnrichment` is valid (means enrichment was attempted but returned no results or was declined).
- `enrichedAt` must be a valid ISO 8601 string when present.
- `sourcesUsed` entries must be lowercase strings (e.g., `'websearch'`, `'workiq'`).
- Maximum 10 items per array field to avoid unbounded session growth.

---

## Entity 5: McpManager (Extended)

**Purpose**: Existing class extended with `callTool()` implementation and transport registry.

### New Fields

| Field             | Type                        | Description                             |
| ----------------- | --------------------------- | --------------------------------------- |
| `transports`      | `Map<string, McpTransport>` | One transport per connected server name |
| `defaultTimeouts` | `Record<string, number>`    | Default timeout per server (30s or 60s) |

### New Methods

```typescript
/**
 * Call a tool on a named MCP server.
 * Creates and caches a transport for the server on first call.
 * Applies retry policy for transient errors.
 *
 * @throws Error if serverName not in config
 * @throws McpTransportError if tool call fails after retries
 */
async callTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
  options?: { timeoutMs?: number; retryOnTransient?: boolean }
): Promise<Record<string, unknown>>;

/**
 * Disconnect all active transports. Call on process exit.
 */
async disconnectAll(): Promise<void>;
```

### Transport Registry Rules

- Transports are lazily created on first `callTool()` for a server.
- `StdioMcpTransport` servers: subprocess is started and kept alive for the session.
- `HttpMcpTransport` servers: stateless; no persistent connection to manage.
- `markConnected()` is called after a successful `initialize` handshake for stdio, or after a successful HTTP call for HTTP servers.
- `markDisconnected()` is called when a transport errors or disconnects.

---

## Entity 6: DiscoveryState (Extended)

**Existing entity** in `src/shared/schemas/session.ts`.

### Change

Add `enrichment?: DiscoveryEnrichment` field to the existing `DiscoveryState` Zod schema.

```typescript
// Before:
export const DiscoveryStateSchema = z.object({
  steps: z.record(z.string(), z.unknown()),
  currentStep: z.number(),
  // ...
});

// After: (add one field)
export const DiscoveryStateSchema = z.object({
  steps: z.record(z.string(), z.unknown()),
  currentStep: z.number(),
  // ...
  enrichment: DiscoveryEnrichmentSchema.optional(),
});
```

**Backward compatibility**: The field is optional; existing sessions without enrichment remain valid and parse without errors.

---

## Entity Relationships Diagram

```
McpConfig (loaded from .vscode/mcp.json)
  └── servers: Record<string, McpServerConfig>
        ├── StdioServerConfig → StdioMcpTransport (spawns subprocess)
        └── HttpServerConfig  → HttpMcpTransport  (stateless fetch)

McpManager
  ├── config: McpConfig
  ├── transports: Map<serverName, McpTransport>
  └── callTool(serverName, toolName, args)
        ├── withRetry (retryPolicy.ts)
        └── transport.callTool(toolName, args, timeoutMs)
              └── returns: ToolCallResponse

GitHubMcpAdapter
  └── mcpManager.callTool('github', ...) → ToolCallResponse

McpContextEnricher
  ├── mcpManager.callTool('context7', 'resolve-library-id', ...) → ToolCallResponse
  ├── mcpManager.callTool('context7', 'query-docs', ...) → ToolCallResponse
  ├── mcpManager.callTool('azure', 'documentation', ...) → ToolCallResponse
  └── mcpManager.callTool('websearch', 'search', ...) → ToolCallResponse

DiscoveryEnricher
  ├── webSearch.searchWeb(...) → WebSearchResult
  └── mcpManager.callTool('workiq', ...) → ToolCallResponse
        → DiscoveryEnrichment stored in WorkshopSession.discovery.enrichment

WorkshopSession
  └── discovery: DiscoveryState
        └── enrichment?: DiscoveryEnrichment  ← NEW FIELD
```
