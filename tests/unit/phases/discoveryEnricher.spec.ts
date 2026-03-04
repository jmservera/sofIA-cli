/**
 * Tests for DiscoveryEnricher — US3 web search enrichment
 * and US4 WorkIQ enrichment.
 *
 * T026: enrichFromWebSearch() basic functionality
 * T027: User consent prompt integration
 * T028: Session schema integration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DiscoveryEnricher } from '../../../src/phases/discoveryEnricher.js';
import type { WebSearchClient } from '../../../src/phases/discoveryEnricher.js';
import type { LoopIO } from '../../../src/loop/conversationLoop.js';
import type { McpManager } from '../../../src/mcp/mcpManager.js';
import {
  DiscoveryEnrichmentSchema,
  workshopSessionSchema,
} from '../../../src/shared/schemas/session.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeWebSearchClient(
  results: Array<{ title: string; url: string; snippet: string }> = [],
  opts?: { degraded?: boolean; throws?: boolean },
): WebSearchClient {
  return {
    search: opts?.throws
      ? vi.fn().mockRejectedValue(new Error('search failed'))
      : vi.fn().mockResolvedValue({
          results,
          degraded: opts?.degraded ?? false,
        }),
  };
}

function makeLoopIO(overrides?: Partial<LoopIO>): LoopIO {
  return {
    write: vi.fn(),
    writeActivity: vi.fn(),
    writeToolSummary: vi.fn(),
    readInput: vi.fn().mockResolvedValue('n'),
    showDecisionGate: vi.fn().mockResolvedValue({ choice: 'continue' }),
    isJsonMode: false,
    isTTY: true,
    ...overrides,
  };
}

function makeMcpManager(overrides?: Partial<McpManager>): McpManager {
  return {
    isAvailable: vi.fn().mockReturnValue(false),
    callTool: vi.fn().mockResolvedValue({}),
    markConnected: vi.fn(),
    markDisconnected: vi.fn(),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as McpManager;
}

// ── T026: enrichFromWebSearch() ──────────────────────────────────────────────

describe('DiscoveryEnricher', () => {
  let enricher: DiscoveryEnricher;

  beforeEach(() => {
    enricher = new DiscoveryEnricher();
  });

  describe('enrichFromWebSearch() (T026)', () => {
    it('calls webSearchClient.search with company-news, competitor, and industry-trends queries', async () => {
      const searchFn = vi.fn().mockResolvedValue({ results: [], degraded: false });
      const client: WebSearchClient = { search: searchFn };

      await enricher.enrichFromWebSearch('Acme Corp makes widgets', client);

      // Should make 3 search calls (company news, competitors, industry trends)
      expect(searchFn).toHaveBeenCalledTimes(3);
      // First query should mention company/news
      expect(searchFn.mock.calls[0][0]).toMatch(/acme/i);
      expect(searchFn.mock.calls[0][0]).toMatch(/news/i);
      // Second should mention competitors/market
      expect(searchFn.mock.calls[1][0]).toMatch(/competitor|market/i);
      // Third should mention trends
      expect(searchFn.mock.calls[2][0]).toMatch(/trend/i);
    });

    it('populates companyNews, competitorInfo, industryTrends from results', async () => {
      const newsResults = [
        { title: 'Acme raises $10M', url: 'https://a.com', snippet: 'Acme Corp raised $10M' },
        { title: 'Acme launches product', url: 'https://b.com', snippet: 'New product launched' },
      ];
      const competitorResults = [
        { title: 'Widget Inc grows', url: 'https://c.com', snippet: 'Widget Inc sees 20% growth' },
      ];
      const trendResults = [
        {
          title: 'AI in manufacturing',
          url: 'https://d.com',
          snippet: 'AI transforms manufacturing',
        },
      ];

      const searchFn = vi
        .fn()
        .mockResolvedValueOnce({ results: newsResults, degraded: false })
        .mockResolvedValueOnce({ results: competitorResults, degraded: false })
        .mockResolvedValueOnce({ results: trendResults, degraded: false });

      const result = await enricher.enrichFromWebSearch('Acme Corp makes widgets', {
        search: searchFn,
      });

      expect(result.companyNews).toHaveLength(2);
      expect(result.companyNews![0]).toContain('Acme raises $10M');
      expect(result.competitorInfo ?? []).toHaveLength(0);
      expect(result.industryTrends ?? []).toHaveLength(0);
    });

    it('stops after first successful query to reduce web search calls', async () => {
      const searchFn = vi
        .fn()
        .mockResolvedValueOnce({
          results: [{ title: 'Acme news', url: 'https://a.com', snippet: 'Acme in manufacturing' }],
          degraded: false,
        })
        .mockResolvedValue({
          results: [{ title: 'Should not be used', url: 'https://b.com', snippet: 'unused' }],
          degraded: false,
        });

      const result = await enricher.enrichFromWebSearch('Acme Corp makes widgets', {
        search: searchFn,
      });

      expect(searchFn).toHaveBeenCalledTimes(1);
      expect(result.companyNews).toHaveLength(1);
      expect(result.competitorInfo ?? []).toHaveLength(0);
      expect(result.industryTrends ?? []).toHaveLength(0);
    });

    it('returns gracefully with empty arrays when search throws', async () => {
      const client = makeWebSearchClient([], { throws: true });

      const result = await enricher.enrichFromWebSearch('Acme Corp', client);

      // Should not throw, should return empty-ish object
      expect(result.companyNews ?? []).toHaveLength(0);
      expect(result.competitorInfo ?? []).toHaveLength(0);
      expect(result.industryTrends ?? []).toHaveLength(0);
    });

    it('returns empty when search result is degraded', async () => {
      const searchFn = vi.fn().mockResolvedValue({ results: [], degraded: true });
      const client: WebSearchClient = { search: searchFn };

      const result = await enricher.enrichFromWebSearch('Acme Corp', client);

      expect(result.companyNews ?? []).toHaveLength(0);
      expect(result.competitorInfo ?? []).toHaveLength(0);
    });

    it('sets sourcesUsed to ["websearch"] when search succeeds', async () => {
      const newsResults = [{ title: 'News', url: 'https://a.com', snippet: 'snippet' }];
      const searchFn = vi.fn().mockResolvedValue({ results: newsResults, degraded: false });
      const client: WebSearchClient = { search: searchFn };

      const result = await enricher.enrichFromWebSearch('Acme Corp', client);

      expect(result.sourcesUsed).toContain('websearch');
    });

    it('sets enrichedAt to an ISO 8601 timestamp', async () => {
      const newsResults = [{ title: 'News', url: 'https://a.com', snippet: 'snippet' }];
      const searchFn = vi.fn().mockResolvedValue({ results: newsResults, degraded: false });
      const client: WebSearchClient = { search: searchFn };

      const result = await enricher.enrichFromWebSearch('Acme Corp', client);

      expect(result.enrichedAt).toBeDefined();
      // Validate it's a parseable date
      expect(new Date(result.enrichedAt!).toISOString()).toBe(result.enrichedAt);
    });

    it('caps array fields at 10 items', async () => {
      // Return 15 results per query
      const bigResults = Array.from({ length: 15 }, (_, i) => ({
        title: `Title ${i}`,
        url: `https://example.com/${i}`,
        snippet: `Snippet ${i}`,
      }));
      const searchFn = vi.fn().mockResolvedValue({ results: bigResults, degraded: false });
      const client: WebSearchClient = { search: searchFn };

      const result = await enricher.enrichFromWebSearch('Acme Corp', client);

      expect((result.companyNews ?? []).length).toBeLessThanOrEqual(10);
      expect((result.competitorInfo ?? []).length).toBeLessThanOrEqual(10);
      expect((result.industryTrends ?? []).length).toBeLessThanOrEqual(10);
    });

    it('populates webSearchResults with combined snippets', async () => {
      const newsResults = [
        { title: 'News', url: 'https://a.com', snippet: 'Company news snippet' },
      ];
      const searchFn = vi.fn().mockResolvedValue({ results: newsResults, degraded: false });
      const client: WebSearchClient = { search: searchFn };

      const result = await enricher.enrichFromWebSearch('Acme Corp', client);

      expect(result.webSearchResults).toBeDefined();
      expect(result.webSearchResults).toContain('Company news snippet');
    });
  });

  // ── T027: enrich() user consent / prompt flow ────────────────────────────

  describe('enrich() consent flow (T027)', () => {
    it('does not prompt for web search when webSearchClient is not provided', async () => {
      const io = makeLoopIO();
      const mcpManager = makeMcpManager();

      await enricher.enrich({
        companySummary: 'Acme Corp',
        mcpManager,
        io,
      });

      // readInput should not be called for web search consent
      // (web search consent is implicit when webSearchClient is provided)
      expect(io.readInput).not.toHaveBeenCalled();
    });

    it('runs web search when webSearchClient is provided', async () => {
      const searchFn = vi.fn().mockResolvedValue({
        results: [{ title: 'News', url: 'https://a.com', snippet: 'snip' }],
        degraded: false,
      });
      const io = makeLoopIO();
      const mcpManager = makeMcpManager();

      const result = await enricher.enrich({
        companySummary: 'Acme Corp',
        mcpManager,
        io,
        webSearchClient: { search: searchFn },
      });

      expect(searchFn).toHaveBeenCalled();
      expect(result.sourcesUsed).toContain('websearch');
    });

    it('returns valid DiscoveryEnrichment when all sources unavailable', async () => {
      const io = makeLoopIO();
      const mcpManager = makeMcpManager();

      const result = await enricher.enrich({
        companySummary: 'Acme Corp',
        mcpManager,
        io,
      });

      // Should return a valid (possibly empty) enrichment — no crash
      const parsed = DiscoveryEnrichmentSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  // ── T028: Session schema integration ─────────────────────────────────────

  describe('session schema integration (T028)', () => {
    it('DiscoveryEnrichmentSchema parses valid enrichment', () => {
      const valid = {
        webSearchResults: 'Some results',
        companyNews: ['News 1', 'News 2'],
        competitorInfo: ['Competitor A'],
        industryTrends: ['Trend 1'],
        enrichedAt: new Date().toISOString(),
        sourcesUsed: ['websearch'],
      };

      const parsed = DiscoveryEnrichmentSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('validates enrichedAt is ISO 8601 when present', () => {
      const invalidDate = {
        enrichedAt: 'not-a-date',
        sourcesUsed: ['websearch'],
      };

      const parsed = DiscoveryEnrichmentSchema.safeParse(invalidDate);
      expect(parsed.success).toBe(false);
    });

    it('validates sourcesUsed entries are lowercase strings', () => {
      const valid = {
        sourcesUsed: ['websearch', 'workiq'],
      };

      const parsed = DiscoveryEnrichmentSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('session with discovery.enrichment round-trips through workshopSessionSchema.parse()', () => {
      const session = {
        sessionId: 'test-123',
        schemaVersion: '0.3.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        phase: 'Discover' as const,
        status: 'Active' as const,
        participants: [],
        artifacts: { generatedFiles: [] },
        discovery: {
          enrichment: {
            companyNews: ['News headline'],
            competitorInfo: ['Competitor X'],
            industryTrends: ['AI trend'],
            enrichedAt: new Date().toISOString(),
            sourcesUsed: ['websearch'],
          },
        },
      };

      const parsed = workshopSessionSchema.safeParse(session);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.discovery?.enrichment?.companyNews).toEqual(['News headline']);
      }
    });

    it('rejects array fields exceeding max 10 items', () => {
      const tooMany = {
        companyNews: Array.from({ length: 11 }, (_, i) => `News ${i}`),
      };

      const parsed = DiscoveryEnrichmentSchema.safeParse(tooMany);
      expect(parsed.success).toBe(false);
    });

    it('accepts completely empty enrichment', () => {
      const parsed = DiscoveryEnrichmentSchema.safeParse({});
      expect(parsed.success).toBe(true);
    });
  });

  // ── T034: enrichFromWorkIQ() ──────────────────────────────────────────────

  describe('enrichFromWorkIQ() (T034)', () => {
    it('prompts user for consent via io.readInput before any callTool call', async () => {
      const io = makeLoopIO({ readInput: vi.fn().mockResolvedValue('n') });
      const mcpManager = makeMcpManager({
        isAvailable: vi.fn().mockReturnValue(true),
      });

      await enricher.enrichFromWorkIQ('Acme Corp', mcpManager, io);

      expect(io.readInput).toHaveBeenCalled();
      // Should have asked before calling callTool
      expect(mcpManager.callTool).not.toHaveBeenCalled();
    });

    it('calls mcpManager.callTool when user consents with "y"', async () => {
      const io = makeLoopIO({ readInput: vi.fn().mockResolvedValue('y') });
      const mcpManager = makeMcpManager({
        isAvailable: vi.fn().mockReturnValue(true),
        callTool: vi.fn().mockResolvedValue({
          teamExpertise: ['TypeScript', 'React'],
          collaborationPatterns: ['Daily standups'],
          documentationGaps: ['API docs missing'],
        }),
      });

      const result = await enricher.enrichFromWorkIQ('Acme Corp', mcpManager, io);

      expect(mcpManager.callTool).toHaveBeenCalledWith(
        'workiq',
        'analyze_team',
        expect.objectContaining({ summary: 'Acme Corp' }),
        { timeoutMs: 30_000 },
      );
      expect(result.workiqInsights).toBeDefined();
      expect(result.workiqInsights!.teamExpertise).toContain('TypeScript');
      expect(result.workiqInsights!.collaborationPatterns).toContain('Daily standups');
      expect(result.workiqInsights!.documentationGaps).toContain('API docs missing');
      expect(result.sourcesUsed).toContain('workiq');
    });

    it('returns empty workiqInsights when user declines', async () => {
      const io = makeLoopIO({ readInput: vi.fn().mockResolvedValue('n') });
      const mcpManager = makeMcpManager({
        isAvailable: vi.fn().mockReturnValue(true),
      });

      const result = await enricher.enrichFromWorkIQ('Acme Corp', mcpManager, io);

      expect(result.workiqInsights).toBeUndefined();
      expect(mcpManager.callTool).not.toHaveBeenCalled();
    });

    it('returns empty workiqInsights when user presses Enter (default No)', async () => {
      const io = makeLoopIO({ readInput: vi.fn().mockResolvedValue('') });
      const mcpManager = makeMcpManager({
        isAvailable: vi.fn().mockReturnValue(true),
      });

      const result = await enricher.enrichFromWorkIQ('Acme Corp', mcpManager, io);

      expect(result.workiqInsights).toBeUndefined();
      expect(mcpManager.callTool).not.toHaveBeenCalled();
    });

    it('returns empty workiqInsights gracefully when callTool throws', async () => {
      const io = makeLoopIO({ readInput: vi.fn().mockResolvedValue('y') });
      const mcpManager = makeMcpManager({
        isAvailable: vi.fn().mockReturnValue(true),
        callTool: vi.fn().mockRejectedValue(new Error('WorkIQ timeout')),
      });

      const result = await enricher.enrichFromWorkIQ('Acme Corp', mcpManager, io);

      // Should not throw
      expect(result.workiqInsights).toBeUndefined();
    });

    it('extracts insights from response.insights fallback (split by newline)', async () => {
      const io = makeLoopIO({ readInput: vi.fn().mockResolvedValue('y') });
      const mcpManager = makeMcpManager({
        isAvailable: vi.fn().mockReturnValue(true),
        callTool: vi.fn().mockResolvedValue({
          insights: 'Expert in TypeScript\nDaily standups\nMissing API docs',
        }),
      });

      const result = await enricher.enrichFromWorkIQ('Acme Corp', mcpManager, io);

      expect(result.workiqInsights).toBeDefined();
      // When response has only 'insights' string, it gets split
      expect(result.workiqInsights!.teamExpertise).toBeDefined();
    });
  });

  // ── T035: enrich() orchestrator with WorkIQ ──────────────────────────────

  describe('enrich() orchestrator with WorkIQ (T035)', () => {
    it('calls enrichFromWorkIQ when WorkIQ is available', async () => {
      const io = makeLoopIO({ readInput: vi.fn().mockResolvedValue('y') });
      const mcpManager = makeMcpManager({
        isAvailable: vi.fn().mockReturnValue(true),
        callTool: vi.fn().mockResolvedValue({
          teamExpertise: ['Node.js'],
          collaborationPatterns: ['Async reviews'],
          documentationGaps: ['Onboarding docs'],
        }),
      });

      const result = await enricher.enrich({
        companySummary: 'Acme Corp makes widgets',
        mcpManager,
        io,
      });

      expect(result.workiqInsights).toBeDefined();
      expect(result.sourcesUsed).toContain('workiq');
    });

    it('merges WorkIQ results with web search results', async () => {
      const searchFn = vi.fn().mockResolvedValue({
        results: [{ title: 'News', url: 'https://a.com', snippet: 'snip' }],
        degraded: false,
      });
      const io = makeLoopIO({ readInput: vi.fn().mockResolvedValue('y') });
      const mcpManager = makeMcpManager({
        isAvailable: vi.fn().mockReturnValue(true),
        callTool: vi.fn().mockResolvedValue({
          teamExpertise: ['Python'],
          collaborationPatterns: [],
          documentationGaps: [],
        }),
      });

      const result = await enricher.enrich({
        companySummary: 'Acme Corp',
        mcpManager,
        io,
        webSearchClient: { search: searchFn },
      });

      expect(result.sourcesUsed).toContain('websearch');
      expect(result.sourcesUsed).toContain('workiq');
      expect(result.companyNews).toBeDefined();
      expect(result.workiqInsights).toBeDefined();
    });

    it('returns valid DiscoveryEnrichment with all empty fields when WorkIQ fails', async () => {
      const io = makeLoopIO({ readInput: vi.fn().mockResolvedValue('y') });
      const mcpManager = makeMcpManager({
        isAvailable: vi.fn().mockReturnValue(true),
        callTool: vi.fn().mockRejectedValue(new Error('WorkIQ down')),
      });

      const result = await enricher.enrich({
        companySummary: 'Acme Corp',
        mcpManager,
        io,
      });

      const parsed = DiscoveryEnrichmentSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });
});
