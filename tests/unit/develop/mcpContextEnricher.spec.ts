/**
 * T047: Unit tests for McpContextEnricher.
 *
 * Verifies:
 * - Queries Context7 for library docs when dependencies listed in plan
 * - Queries Azure MCP when plan mentions Azure services
 * - Calls web.search when stuckIterations > 0
 * - Falls back gracefully when MCP services unavailable
 * - Returns structured context string suitable for prompt injection
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { McpContextEnricher } from '../../../src/develop/mcpContextEnricher.js';
import type { McpManager } from '../../../src/mcp/mcpManager.js';

// ── Mock web search ───────────────────────────────────────────────────────────

vi.mock('../../../src/mcp/webSearch.js', () => ({
  isWebSearchConfigured: vi.fn(() => false),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMcpManager(
  availableServers: string[] = [],
  callToolImpl?: (
    server: string,
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>,
): McpManager {
  return {
    isAvailable: (name: string) => availableServers.includes(name),
    listServers: () => availableServers,
    getServerConfig: () => undefined,
    markConnected: () => {},
    markDisconnected: () => {},
    getAllConfigs: () => [],
    callTool: callToolImpl
      ? vi.fn(callToolImpl)
      : vi.fn().mockRejectedValue(new Error('not wired')),
  } as unknown as McpManager;
}

describe('McpContextEnricher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('stores mcpManager reference', () => {
      const manager = makeMcpManager();
      const enricher = new McpContextEnricher(manager);
      expect(enricher.mcpManager).toBe(manager);
    });
  });

  describe('enrich() — Context7', () => {
    it('queries Context7 when available and dependencies listed', async () => {
      const callTool = vi
        .fn()
        .mockResolvedValueOnce({ libraryId: 'express-lib-id' })
        .mockResolvedValueOnce({ content: 'Express.js API docs here' })
        .mockResolvedValueOnce({ libraryId: 'zod-lib-id' })
        .mockResolvedValueOnce({ content: 'Zod schema validation docs' });
      const manager = makeMcpManager(['context7'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        dependencies: ['express', 'zod'],
      });

      expect(result.combined).toBeTruthy();
      expect(result.libraryDocs).toBeDefined();
      // Should have called resolve-library-id and query-docs for each dep
      expect(callTool).toHaveBeenCalledWith(
        'context7',
        'resolve-library-id',
        {
          libraryName: 'express',
        },
        { timeoutMs: 30_000 },
      );
      expect(callTool).toHaveBeenCalledWith(
        'context7',
        'query-docs',
        {
          libraryId: 'express-lib-id',
          topic: 'express',
        },
        { timeoutMs: 30_000 },
      );
    });

    it('falls back to npmjs link when callTool throws for a dependency', async () => {
      const callTool = vi.fn().mockRejectedValue(new Error('not wired'));
      const manager = makeMcpManager(['context7'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        dependencies: ['express'],
      });

      expect(result.libraryDocs).toBeDefined();
      expect(result.libraryDocs).toContain('npmjs.com/package/express');
    });

    it('skips Context7 when not available', async () => {
      const manager = makeMcpManager([]); // no context7
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        dependencies: ['express', 'zod'],
      });

      expect(result.libraryDocs).toBeUndefined();
      expect(result.combined).toBe('');
    });

    it('skips Context7 when no dependencies listed', async () => {
      const manager = makeMcpManager(['context7']);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        dependencies: [],
      });

      expect(result.libraryDocs).toBeUndefined();
    });

    it('filters out type-only packages from Context7 queries', async () => {
      const callTool = vi
        .fn()
        .mockResolvedValueOnce({ libraryId: 'express-id' })
        .mockResolvedValueOnce({ content: 'Express docs' });
      const manager = makeMcpManager(['context7'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        dependencies: ['@types/node', 'typescript', 'vitest', 'express'],
      });

      expect(result.libraryDocs).toBeDefined();
      if (result.libraryDocs) {
        expect(result.libraryDocs).toContain('express');
        expect(result.libraryDocs).not.toContain('@types/node');
        expect(result.libraryDocs).not.toContain('typescript');
      }
      // Only express should trigger callTool calls (2 calls: resolve + query)
      expect(callTool).toHaveBeenCalledTimes(2);
    });
  });

  describe('enrich() — Azure MCP', () => {
    it('calls mcpManager.callTool for Azure documentation when available', async () => {
      const callTool = vi.fn().mockResolvedValue({
        content: 'Use managed identity for Cosmos DB authentication.',
      });
      const manager = makeMcpManager(['azure'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        architectureNotes: 'Use Azure Cosmos DB for data storage and Azure OpenAI for inference.',
      });

      expect(result.azureGuidance).toBeDefined();
      expect(result.azureGuidance).toContain('managed identity');
      expect(callTool).toHaveBeenCalledWith(
        'azure',
        'documentation',
        expect.objectContaining({
          query: expect.stringContaining('cosmos db'),
        }),
        { timeoutMs: 30_000 },
      );
    });

    it('falls back to static guidance when callTool throws', async () => {
      const callTool = vi.fn().mockRejectedValue(new Error('not wired'));
      const manager = makeMcpManager(['azure'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        architectureNotes: 'Use Azure Cosmos DB for data storage.',
      });

      expect(result.azureGuidance).toBeDefined();
      expect(result.azureGuidance).toContain('Detected Azure services');
      expect(result.combined).toContain('Azure');
    });

    it('skips Azure MCP when not available', async () => {
      const manager = makeMcpManager([]);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        architectureNotes: 'Use Azure Cosmos DB for data storage.',
      });

      expect(result.azureGuidance).toBeUndefined();
    });

    it('skips Azure MCP when plan does not mention Azure services', async () => {
      const manager = makeMcpManager(['azure']);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        architectureNotes: 'Use PostgreSQL and Express. No cloud dependencies.',
      });

      expect(result.azureGuidance).toBeUndefined();
    });

    it('detects various Azure keywords', async () => {
      const callTool = vi.fn().mockRejectedValue(new Error('not wired'));
      const manager = makeMcpManager(['azure'], callTool);
      const enricher = new McpContextEnricher(manager);

      const azureKeywords = ['cosmos db', 'blob storage', 'service bus', 'key vault'];
      for (const keyword of azureKeywords) {
        const result = await enricher.enrich({
          mcpManager: manager,
          architectureNotes: `Use ${keyword} for the implementation.`,
        });
        expect(
          result.azureGuidance,
          `Expected Azure guidance for keyword: ${keyword}`,
        ).toBeDefined();
      }
    });
  });

  describe('enrich() — web.search', () => {
    it('calls web.search when configured and stuckIterations >= 2', async () => {
      const { isWebSearchConfigured } = await import('../../../src/mcp/webSearch.js');
      vi.mocked(isWebSearchConfigured).mockReturnValue(true);

      const manager = makeMcpManager([]);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        stuckIterations: 2,
        failingTests: ['suite > test A fails with TypeError'],
      });

      expect(result.webSearchResults).toBeDefined();
    });

    it('skips web.search when stuckIterations < 2', async () => {
      const { isWebSearchConfigured } = await import('../../../src/mcp/webSearch.js');
      vi.mocked(isWebSearchConfigured).mockReturnValue(true);

      const manager = makeMcpManager([]);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        stuckIterations: 1,
        failingTests: ['suite > test A'],
      });

      expect(result.webSearchResults).toBeUndefined();
    });

    it('skips web.search when not configured', async () => {
      const { isWebSearchConfigured } = await import('../../../src/mcp/webSearch.js');
      vi.mocked(isWebSearchConfigured).mockReturnValue(false);

      const manager = makeMcpManager([]);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        stuckIterations: 3,
        failingTests: ['test fails'],
      });

      expect(result.webSearchResults).toBeUndefined();
    });
  });

  describe('graceful degradation', () => {
    it('returns empty context when all services unavailable', async () => {
      const manager = makeMcpManager([]);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        dependencies: ['express'],
        architectureNotes: 'Use Azure and express',
        stuckIterations: 5,
        failingTests: ['test fails'],
      });

      // All services unavailable (web search mocked to false, no MCP servers)
      expect(result.combined).toBe('');
    });

    it('returns combined context string when multiple services respond', async () => {
      const { isWebSearchConfigured } = await import('../../../src/mcp/webSearch.js');
      vi.mocked(isWebSearchConfigured).mockReturnValue(true);

      const callTool = vi
        .fn()
        // Context7 resolve + query for 'express'
        .mockResolvedValueOnce({ libraryId: 'express-id' })
        .mockResolvedValueOnce({ content: 'Express framework docs' })
        // Azure documentation
        .mockResolvedValueOnce({ content: 'Azure Cosmos DB guidance' });
      const manager = makeMcpManager(['context7', 'azure'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        dependencies: ['express'],
        architectureNotes: 'Use Azure Cosmos DB',
        stuckIterations: 2,
        failingTests: ['test A fails'],
      });

      // combined should include sections from multiple services
      expect(result.combined.length).toBeGreaterThan(0);
      // Should have at least some context
      const hasMultipleSections = (result.combined.match(/###/g) ?? []).length >= 1;
      expect(hasMultipleSections).toBe(true);
    });
  });

  // ── T009: Contract tests per contracts/context-enricher.md ──────────────

  describe('queryContext7 — contract: response field fallbacks', () => {
    it('uses response.id as fallback when response.libraryId is missing', async () => {
      const callTool = vi
        .fn()
        .mockResolvedValueOnce({ id: '/expressjs/express' }) // fallback field
        .mockResolvedValueOnce({ content: 'Express docs from id fallback' });
      const manager = makeMcpManager(['context7'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        dependencies: ['express'],
      });

      expect(result.libraryDocs).toBeDefined();
      expect(result.libraryDocs).toContain('Express docs from id fallback');
      // Should have called query-docs with the resolved id
      expect(callTool).toHaveBeenCalledWith(
        'context7',
        'query-docs',
        {
          libraryId: '/expressjs/express',
          topic: 'express',
        },
        { timeoutMs: 30_000 },
      );
    });

    it('uses response.text as fallback content when response.content is missing', async () => {
      const callTool = vi
        .fn()
        .mockResolvedValueOnce({ libraryId: 'zod-id' })
        .mockResolvedValueOnce({ text: 'Zod docs from text fallback' }); // text fallback
      const manager = makeMcpManager(['context7'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        dependencies: ['zod'],
      });

      expect(result.libraryDocs).toBeDefined();
      expect(result.libraryDocs).toContain('Zod docs from text fallback');
    });

    it('processes max 5 non-skipped dependencies', async () => {
      const callTool = vi.fn().mockResolvedValue({ libraryId: 'lib-id', content: 'docs' });
      const manager = makeMcpManager(['context7'], callTool);
      const enricher = new McpContextEnricher(manager);

      const deps = ['dep1', 'dep2', 'dep3', 'dep4', 'dep5', 'dep6', 'dep7'];
      await enricher.enrich({
        mcpManager: manager,
        dependencies: deps,
      });

      // Only 5 non-skipped deps should be processed (2 calls each: resolve + query)
      expect(callTool).toHaveBeenCalledTimes(10); // 5 * 2
    });

    it('falls back to npmjs link when both libraryId and id are missing', async () => {
      const callTool = vi.fn().mockResolvedValueOnce({}); // no libraryId, no id
      const manager = makeMcpManager(['context7'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        dependencies: ['unknown-pkg'],
      });

      expect(result.libraryDocs).toBeDefined();
      expect(result.libraryDocs).toContain('npmjs.com/package/unknown-pkg');
    });
  });

  describe('queryAzureMcp — contract: response field fallbacks', () => {
    it('uses response.text as fallback when response.content is missing', async () => {
      const callTool = vi.fn().mockResolvedValue({
        text: 'Azure guidance from text fallback',
      });
      const manager = makeMcpManager(['azure'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        architectureNotes: 'Use Azure Cosmos DB',
      });

      expect(result.azureGuidance).toBeDefined();
      expect(result.azureGuidance).toContain('Azure guidance from text fallback');
    });
  });

  describe('queryWebSearch — contract: MCP-first then fallback', () => {
    it('tries MCP callTool websearch before Azure AI Foundry bridge', async () => {
      const { isWebSearchConfigured } = await import('../../../src/mcp/webSearch.js');
      vi.mocked(isWebSearchConfigured).mockReturnValue(true);

      const callTool = vi.fn().mockResolvedValue({
        content: 'MCP search results here',
      });
      const manager = makeMcpManager(['websearch'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        stuckIterations: 2,
        failingTests: ['test A fails with TypeError'],
      });

      expect(result.webSearchResults).toContain('MCP search results here');
      expect(callTool).toHaveBeenCalledWith(
        'websearch',
        'search',
        expect.objectContaining({
          query: expect.stringContaining('how to fix'),
        }),
        { timeoutMs: 30_000 },
      );
    });
  });

  // ── T010: Web search gating tests ───────────────────────────────────────

  describe('enrich() — web search stuckIterations gating', () => {
    it('MUST NOT invoke queryWebSearch when stuckIterations < 2', async () => {
      const { isWebSearchConfigured } = await import('../../../src/mcp/webSearch.js');
      vi.mocked(isWebSearchConfigured).mockReturnValue(true);

      const callTool = vi.fn().mockResolvedValue({ content: 'should not be called' });
      const manager = makeMcpManager(['websearch'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        stuckIterations: 1,
        failingTests: ['test A fails'],
      });

      expect(result.webSearchResults).toBeUndefined();
      // websearch callTool should NOT have been called
      const webSearchCalls = callTool.mock.calls.filter((c: unknown[]) => c[0] === 'websearch');
      expect(webSearchCalls).toHaveLength(0);
    });

    it('MUST invoke queryWebSearch when stuckIterations >= 2', async () => {
      const { isWebSearchConfigured } = await import('../../../src/mcp/webSearch.js');
      vi.mocked(isWebSearchConfigured).mockReturnValue(true);

      const callTool = vi.fn().mockResolvedValue({ content: 'web search results' });
      const manager = makeMcpManager(['websearch'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        stuckIterations: 2,
        failingTests: ['test B fails with ReferenceError'],
      });

      expect(result.webSearchResults).toBeDefined();
      const webSearchCalls = callTool.mock.calls.filter((c: unknown[]) => c[0] === 'websearch');
      expect(webSearchCalls.length).toBeGreaterThan(0);
    });

    it('MUST invoke queryWebSearch when stuckIterations is 3', async () => {
      const { isWebSearchConfigured } = await import('../../../src/mcp/webSearch.js');
      vi.mocked(isWebSearchConfigured).mockReturnValue(true);

      const callTool = vi.fn().mockResolvedValue({ content: 'search data' });
      const manager = makeMcpManager(['websearch'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        stuckIterations: 3,
        failingTests: ['test C'],
      });

      expect(result.webSearchResults).toBeDefined();
    });

    it('does not invoke queryWebSearch when failingTests is empty', async () => {
      const { isWebSearchConfigured } = await import('../../../src/mcp/webSearch.js');
      vi.mocked(isWebSearchConfigured).mockReturnValue(true);

      const callTool = vi.fn();
      const manager = makeMcpManager(['websearch'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        stuckIterations: 5,
        failingTests: [],
      });

      expect(result.webSearchResults).toBeUndefined();
    });
  });

  describe('enrich() — concurrent execution', () => {
    it('runs queryContext7 and queryAzureMcp (results combined)', async () => {
      const callTool = vi
        .fn()
        // Context7 resolve + query
        .mockResolvedValueOnce({ libraryId: 'express-id' })
        .mockResolvedValueOnce({ content: 'Express docs' })
        // Azure documentation
        .mockResolvedValueOnce({ content: 'Azure best practices' });
      const manager = makeMcpManager(['context7', 'azure'], callTool);
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        mcpManager: manager,
        dependencies: ['express'],
        architectureNotes: 'Use Azure Cosmos DB for storage',
      });

      expect(result.libraryDocs).toBeDefined();
      expect(result.azureGuidance).toBeDefined();
      expect(result.combined).toContain('Library Documentation');
      expect(result.combined).toContain('Azure');
    });
  });
});
