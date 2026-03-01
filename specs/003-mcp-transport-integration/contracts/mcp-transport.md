# Contract: MCP Transport Layer

**Feature**: 003-mcp-transport-integration  
**Module**: `src/mcp/mcpTransport.ts`, `src/mcp/mcpManager.ts`, `src/mcp/retryPolicy.ts`  
**Status**: Authoritative design document

---

## Overview

This contract defines the interface and behavior of `McpManager.callTool()` and the underlying transport layer (`McpTransport`). All MCP adapters and enrichers call `mcpManager.callTool()` — this is the single point of entry for MCP tool invocations.

---

## McpTransport Interface

```typescript
// src/mcp/mcpTransport.ts

export interface McpTransport {
  callTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ToolCallResponse>;
  isConnected(): boolean;
  disconnect(): Promise<void>;
}

export interface ToolCallResponse {
  content: Record<string, unknown> | string;
  raw?: unknown;
  wasRetried?: boolean;
}

export class McpTransportError extends Error {
  constructor(
    message: string,
    public readonly serverName: string,
    public readonly toolName: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'McpTransportError';
  }
}
```

---

## StdioMcpTransport Contract

**Constructor**: `new StdioMcpTransport(config: StdioServerConfig, logger: pino.Logger)`

### `connect(): Promise<void>`

| Step | Behavior |
|------|----------|
| 1 | Spawn subprocess: `spawn(config.command, config.args, { stdio: ['pipe','pipe','pipe'], env: process.env })` |
| 2 | Send JSON-RPC `initialize` request with `{ protocolVersion: '1.0', clientInfo: { name: 'sofIA', version: '0.1.0' } }` |
| 3 | Wait for any JSON-RPC response with matching id within **5 seconds** |
| 4 | On success: set `connected = true`; log info `'MCP stdio server connected: {name}'` |
| 5 | On timeout: kill subprocess, throw `McpTransportError` classified as `timeout` |
| 6 | On subprocess exit before init: throw `McpTransportError` classified as `connection-refused` |

### `callTool(toolName, args, timeoutMs): Promise<ToolCallResponse>`

**Preconditions**: `connect()` must have been called and succeeded.

| Step | Behavior |
|------|----------|
| 1 | Generate `id = this.nextId++` |
| 2 | Register pending request: `pendingRequests.set(id, { resolve, reject, timer })` |
| 3 | Start timeout: after `timeoutMs` ms, reject pending request with timeout error |
| 4 | Write to `process.stdin`: `JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: toolName, arguments: args } }) + '\n'` |
| 5 | On `process.stdout` line: parse JSON; if `line.id === id`, resolve/reject pending request |
| 6 | On JSON-RPC error response: throw `McpTransportError(error.message)` |
| 7 | On malformed line (JSON parse fails): skip, log debug `'Skipping non-JSON stdout line'` |
| 8 | Map `result.content[0].text` → `ToolCallResponse.content` (or `result` directly if no content array) |

### `disconnect(): Promise<void>`

| Step | Behavior |
|------|----------|
| 1 | Reject all pending requests with `McpTransportError('transport disconnected')` |
| 2 | Kill subprocess: `process.kill('SIGTERM')` |
| 3 | Set `connected = false` |

---

## HttpMcpTransport Contract

**Constructor**: `new HttpMcpTransport(config: HttpServerConfig, logger: pino.Logger)`

### `callTool(toolName, args, timeoutMs): Promise<ToolCallResponse>`

| Step | Behavior |
|------|----------|
| 1 | Build request body: `{ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name: toolName, arguments: args } }` |
| 2 | Build headers: `{ 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer <token>' } : {}) }` where token = `process.env.GITHUB_TOKEN` |
| 3 | Create `AbortController`, schedule `abort()` after `timeoutMs` ms |
| 4 | `fetch(config.url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })` |
| 5 | On abort: throw `McpTransportError` classified as `timeout` |
| 6 | On HTTP 401/403: throw `McpTransportError` classified as `auth-failure` |
| 7 | On HTTP 5xx: throw `McpTransportError` classified as `unknown` |
| 8 | Parse response body as JSON; extract `result.content` → `ToolCallResponse` |
| 9 | On JSON-RPC error: throw `McpTransportError(error.message)` |

### `isConnected(): boolean`

Returns `true` always (HTTP is stateless).

### `disconnect(): Promise<void>`

No-op (no persistent connection to close).

---

## McpManager.callTool() Contract

```typescript
// src/mcp/mcpManager.ts

async callTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
  options?: { timeoutMs?: number; retryOnTransient?: boolean }
): Promise<Record<string, unknown>>
```

### Behavior

| Step | Behavior |
|------|----------|
| 1 | Validate `serverName` is in `this.config.servers`; throw `Error('Unknown MCP server: {serverName}')` if not |
| 2 | Get or create transport: `this.getOrCreateTransport(serverName)` |
| 3 | For stdio transports: if not connected, call `transport.connect()` and `markConnected(serverName)` |
| 4 | Determine timeout: `options.timeoutMs ?? this.defaultTimeouts[serverName] ?? 30_000` |
| 5 | Apply retry policy (if `retryOnTransient !== false`): `withRetry(() => transport.callTool(toolName, args, timeoutMs), { serverName, toolName })` |
| 6 | Normalize response: cast `ToolCallResponse.content` to `Record<string, unknown>` (if string, wrap as `{ text: content }`) |
| 7 | On transport error: call `markDisconnected(serverName)`; re-throw `McpTransportError` to caller |

### Default Timeouts

| Server | Default Timeout |
|--------|----------------|
| `github` | 60,000 ms (repo operations can be slow) |
| `context7` | 30,000 ms |
| `azure` | 30,000 ms |
| `workiq` | 30,000 ms |
| `microsoftdocs/mcp` | 30,000 ms |
| any other | 30,000 ms |

### Error Propagation

`McpManager.callTool()` does **not** swallow errors. Callers (adapters, enrichers) are responsible for catching `McpTransportError` and degrading gracefully. This keeps the transport layer simple and the caller's error handling explicit.

---

## RetryPolicy Contract

```typescript
// src/mcp/retryPolicy.ts

export interface RetryOptions {
  serverName: string;
  toolName: string;
  /** Initial delay in ms before first retry. Default: 1000 */
  initialDelayMs?: number;
  /** Jitter fraction (0–1). Default: 0.2 (±20%) */
  jitter?: number;
  logger?: pino.Logger;
}

/**
 * Wrap an async function with a single-retry policy for transient MCP errors.
 * 
 * Retryable errors: connection-refused, timeout, dns-failure
 * Non-retryable: auth-failure, unknown, validation errors
 * 
 * On retry: waits initialDelayMs ± jitter, then calls fn() again once.
 * If the retry also fails, the second error is thrown (not the first).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T>
```

### Retry Decision Table

| `classifyMcpError()` result | Retried? |
|-----------------------------|----------|
| `connection-refused` | ✅ Yes, once |
| `timeout` | ✅ Yes, once |
| `dns-failure` | ✅ Yes, once |
| `auth-failure` | ❌ No — throw immediately |
| `unknown` | ❌ No — throw immediately |
| Not a `McpTransportError` | ❌ No — throw immediately |

### Logging on Retry

When a retry is triggered, log at `warn` level:
```
{ server: serverName, tool: toolName, attempt: 1, delayMs: N, errorClass: '...' }
MCP transient error — retrying after {N}ms
```

---

## Transport Factory

```typescript
// src/mcp/mcpTransport.ts

/**
 * Create the correct transport implementation for a server config.
 */
export function createTransport(
  config: McpServerConfig,
  logger: pino.Logger,
): McpTransport {
  if (config.type === 'stdio') return new StdioMcpTransport(config, logger);
  if (config.type === 'http') return new HttpMcpTransport(config, logger);
  throw new Error(`Unsupported MCP transport type: ${(config as McpServerConfig).type}`);
}
```

---

## Test Doubles

### FakeMcpTransport (for unit tests)

```typescript
// tests/helpers/fakeMcpTransport.ts

export class FakeMcpTransport implements McpTransport {
  private readonly responses: Map<string, Record<string, unknown>>;
  public callCount = 0;
  public connected = true;
  public callLog: Array<{ toolName: string; args: Record<string, unknown> }> = [];

  constructor(responses: Map<string, Record<string, unknown>>) {
    this.responses = responses;
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolCallResponse> {
    this.callCount++;
    this.callLog.push({ toolName, args });
    const response = this.responses.get(toolName);
    if (!response) throw new McpTransportError(`No fake response for tool: ${toolName}`, 'fake', toolName);
    return { content: response };
  }

  isConnected(): boolean { return this.connected; }
  async disconnect(): Promise<void> { this.connected = false; }
}
```

---

## Acceptance Tests (Unit + Integration)

| Test | Type | Description |
|------|------|-------------|
| `callTool routes to StdioTransport for stdio servers` | unit | Verify transport factory creates correct type |
| `callTool routes to HttpTransport for HTTP servers` | unit | Verify transport factory creates correct type |
| `StdioMcpTransport sends JSON-RPC and parses response` | unit | Mock subprocess stdout returns valid response |
| `StdioMcpTransport times out after timeoutMs` | unit | Mock subprocess that never responds |
| `HttpMcpTransport POSTs correct JSON-RPC and parses response` | unit | Mock `fetch` returns valid response |
| `HttpMcpTransport sets Authorization header when GITHUB_TOKEN set` | unit | Verify header presence |
| `HttpMcpTransport throws auth-failure on 401` | unit | Mock `fetch` returns 401 |
| `withRetry retries once on connection-refused` | unit | First call throws connection-refused, second succeeds |
| `withRetry does NOT retry on auth-failure` | unit | Throws immediately |
| `McpManager.callTool unknown server throws` | unit | Verify guard |
| `McpManager.callTool creates and caches transport` | unit | Second call reuses same transport |
| `McpManager.disconnectAll terminates all transports` | unit | Both transports disconnected |
| `End-to-end transport with mock MCP server` | integration | Node.js echo server over stdin/stdout |
