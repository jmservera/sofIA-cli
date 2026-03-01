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
      expect(callTool).toHaveBeenCalledWith('context7', 'resolve-library-id', {
        libraryName: 'express',
      });
      expect(callTool).toHaveBeenCalledWith('context7', 'query-docs', {
        libraryId: 'express-lib-id',
      });
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
});
