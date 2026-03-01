# Developer Quickstart: MCP Transport Integration

**Feature**: 003-mcp-transport-integration  
**Date**: 2026-03-01  
**Audience**: Engineers implementing or reviewing this feature

---

## Prerequisites

- Node.js >= 20 LTS
- `npm install` run at repo root
- Feature 002 (`002-poc-generation`) merged to `main`
- Working branch: `003-mcp-transport-integration`
- (Optional) `GITHUB_TOKEN` env var set to a PAT with `repo` scope for live GitHub MCP tests
- (Optional) Azure subscription credentials for live Azure MCP tests

---

## 1. Clone and Set Up

```bash
git clone <repo>
cd sofIA-cli
git checkout 003-mcp-transport-integration
npm install
```

Verify the test suite passes before making any changes (Feature 002 baseline):

```bash
npm run test
```

Expected: all unit and integration tests pass. e2e tests may require live services.

---

## 2. Understand the Transport Layer

The MCP transport lives in `src/mcp/`:

```
src/mcp/
├── mcpManager.ts      # Config loader + McpManager class (callTool to be implemented)
├── mcpTransport.ts    # NEW: StdioMcpTransport, HttpMcpTransport, createTransport()
├── retryPolicy.ts     # NEW: withRetry() helper for transient error handling
└── webSearch.ts       # Azure AI Foundry bridge (existing, no changes)
```

### How a tool call flows

```
adapter.createRepository()
  └── mcpManager.callTool('github', 'create_repository', args)
        └── withRetry(...)
              └── HttpMcpTransport.callTool('create_repository', args, 60_000)
                    └── fetch('https://api.githubcopilot.com/mcp/', { method: 'POST', ... })
                          └── returns ToolCallResponse
```

For stdio servers (Context7, Azure, WorkIQ):

```
enricher.queryContext7(['express', 'zod'])
  └── mcpManager.callTool('context7', 'resolve-library-id', { libraryName: 'express' })
        └── withRetry(...)
              └── StdioMcpTransport.callTool('resolve-library-id', args, 30_000)
                    └── writes JSON-RPC to subprocess stdin
                    └── reads JSON-RPC from subprocess stdout
```

---

## 3. First Tool Call (Development Walkthrough)

### Step A: Write the failing test (RED)

Before writing any implementation, add a failing test:

```typescript
// tests/unit/mcp/mcpTransport.spec.ts

import { describe, it, expect } from 'vitest';
import { HttpMcpTransport } from '../../../src/mcp/mcpTransport.js';

describe('HttpMcpTransport', () => {
  it('calls the server URL with JSON-RPC method tools/call', async () => {
    const calls: RequestInit[] = [];
    const mockFetch = async (url: string, init: RequestInit) => {
      calls.push(init);
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: '{"html_url":"https://github.com/org/repo"}' }] }
      }), { status: 200 });
    };

    const transport = new HttpMcpTransport(
      { name: 'github', type: 'http', url: 'https://api.githubcopilot.com/mcp/' },
      mockFetch as typeof fetch,
    );

    const result = await transport.callTool('create_repository', { name: 'test' }, 30_000);

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body as string);
    expect(body.method).toBe('tools/call');
    expect(body.params.name).toBe('create_repository');
    expect(result.content).toContain('html_url');
  });
});
```

Run: `npm run test:unit` → **should fail** (module doesn't exist yet).

### Step B: Implement (GREEN)

Create `src/mcp/mcpTransport.ts` with `HttpMcpTransport` satisfying the test.

Run: `npm run test:unit` → **should pass**.

### Step C: Review

Checklist:
- [ ] Are error paths tested (401, timeout, malformed JSON)?
- [ ] Is the retry policy exercised (separate `retryPolicy.spec.ts`)?
- [ ] Does `McpManager.callTool()` integration test pass?

---

## 4. MCP Configuration

The transport reads server configurations from `.vscode/mcp.json` (already present in the repo):

```json
{
  "servers": {
    "github": { "type": "http", "url": "https://api.githubcopilot.com/mcp/" },
    "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] },
    "azure": { "command": "npx", "args": ["-y", "@azure/mcp", "server", "start"] },
    "workiq": { "command": "npx", "args": ["-y", "@microsoft/workiq", "mcp"] }
  }
}
```

`McpManager` loads this file via `loadMcpConfig()`. In tests, pass a custom `McpConfig` directly:

```typescript
const config: McpConfig = {
  servers: {
    github: { name: 'github', type: 'http', url: 'https://api.githubcopilot.com/mcp/' },
  },
};
const manager = new McpManager(config);
manager.markConnected('github');
```

---

## 5. Running Tests

### Unit tests only (fast, no live services)

```bash
npm run test:unit
```

### Integration tests (mock MCP servers, no live services)

```bash
npm run test:integration
```

### Live MCP smoke tests (requires credentials)

```bash
SOFIA_LIVE_MCP_TESTS=true npm run test:live
```

> **Note**: Live tests will spawn real MCP subprocesses (`npx @upstash/context7-mcp`, etc.) and make real HTTP calls. Ensure `GITHUB_TOKEN` is set for GitHub MCP tests.

### Full test suite

```bash
npm test
```

---

## 6. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | For live GitHub MCP | Personal access token with `repo` scope |
| `AZURE_SUBSCRIPTION_ID` | For live Azure MCP | Azure subscription ID |
| `AZURE_TENANT_ID` | For live Azure MCP | Azure tenant ID |
| `AZURE_AI_FOUNDRY_ENDPOINT` | For web search | Azure AI Foundry endpoint URL |
| `AZURE_AI_FOUNDRY_API_KEY` | For web search | Azure AI Foundry API key |
| `SOFIA_LIVE_MCP_TESTS` | To enable live tests | Set to `true` to run live smoke tests |

---

## 7. Key Files to Modify

### New files

| File | Purpose |
|------|---------|
| `src/mcp/mcpTransport.ts` | `McpTransport` interface + `StdioMcpTransport` + `HttpMcpTransport` + `createTransport()` |
| `src/mcp/retryPolicy.ts` | `withRetry()` helper |
| `src/phases/discoveryEnricher.ts` | `DiscoveryEnricher` class |
| `tests/unit/mcp/mcpTransport.spec.ts` | Transport unit tests |
| `tests/unit/mcp/retryPolicy.spec.ts` | Retry policy unit tests |
| `tests/unit/phases/discoveryEnricher.spec.ts` | Discovery enricher unit tests |
| `tests/integration/mcpTransportFlow.spec.ts` | End-to-end transport integration test |
| `tests/e2e/mcpLive.spec.ts` | Live smoke tests (gated by `SOFIA_LIVE_MCP_TESTS`) |

### Modified files

| File | Change |
|------|--------|
| `src/mcp/mcpManager.ts` | Add `callTool()` implementation + transport registry |
| `src/develop/githubMcpAdapter.ts` | Remove stub; use real `callTool()` |
| `src/develop/mcpContextEnricher.ts` | Remove stub; use real `callTool()` |
| `src/develop/ralphLoop.ts` | Add post-scaffold push; fix file content flow |
| `src/phases/phaseHandlers.ts` | Wire discovery enrichment after Step 1 |
| `src/shared/schemas/session.ts` | Add `DiscoveryEnrichment` + extend `DiscoveryState` |

---

## 8. Common Patterns

### Making a tool call in an adapter

```typescript
// In any adapter or enricher:
try {
  const response = await this.mcpManager.callTool('context7', 'resolve-library-id', {
    libraryName: 'express',
  });
  const libraryId = response.libraryId as string;
  // ... use libraryId
} catch (err) {
  const errorClass = classifyMcpError(err);
  logger.warn({ errorClass, err }, 'Context7 resolve-library-id failed');
  // return fallback value
}
```

### Writing a test with a fake transport

```typescript
import { McpManager, loadMcpConfig } from '../../../src/mcp/mcpManager.js';

const manager = new McpManager({ servers: {
  context7: { name: 'context7', type: 'stdio', command: 'npx', args: [] }
}});

// Inject fake transport (via a test seam or vi.mock)
manager.markConnected('context7');
vi.spyOn(manager, 'callTool').mockResolvedValueOnce({ libraryId: '/expressjs/express' });
```

### Gating a live test

```typescript
import { describe, it } from 'vitest';

const LIVE = process.env.SOFIA_LIVE_MCP_TESTS === 'true';

describe.skipIf(!LIVE)('Live: GitHub MCP smoke test', () => {
  it('creates and deletes a test repository', async () => {
    // ... real MCP call
  });
});
```

---

## 9. Troubleshooting

### "MCP server 'github' is not available"

The server is in `mcp.json` config but not yet connected. Call `manager.markConnected('github')` in your test setup, or verify the real transport initialized successfully.

### Stdio subprocess hangs on startup

The `initialize` handshake times out after 5 seconds. Check that the subprocess command is correct in `mcp.json` and that `npx` can download the package (requires internet access in live test environment).

### Live test fails with 401 on GitHub MCP

Set `GITHUB_TOKEN` to a valid PAT. Tokens must have `repo` scope. Check token expiry.

### Context7 returns empty docs

The `resolve-library-id` tool may return a libraryId, but `query-docs` returns empty content for some packages. This is expected behavior — the enricher falls back to the npm link.

---

## 10. Reference

- [MCP Transport Contract](./contracts/mcp-transport.md)
- [GitHub Adapter Contract](./contracts/github-adapter.md)
- [Context Enricher Contract](./contracts/context-enricher.md)
- [Discovery Enricher Contract](./contracts/discovery-enricher.md)
- [Data Model](./data-model.md)
- [Research Notes](./research.md)
- [Feature 002 Plan](../002-poc-generation/plan.md) — upstream feature context
- [MCP Protocol Specification](https://modelcontextprotocol.io/specification) — JSON-RPC 2.0 framing
- [`.vscode/mcp.json`](../../.vscode/mcp.json) — server configurations
