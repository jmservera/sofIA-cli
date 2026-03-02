/**
 * Discovery Phase Enrichment.
 *
 * After the user provides company information in Step 1, this module
 * optionally enriches the session with web search results and WorkIQ insights.
 *
 * Contract: specs/003-mcp-transport-integration/contracts/discovery-enricher.md
 */
import type { McpManager } from '../mcp/mcpManager.js';
import type { LoopIO } from '../loop/conversationLoop.js';
import type { ActivitySpinner } from '../shared/activitySpinner.js';
import type { DiscoveryEnrichment } from '../shared/schemas/session.js';
import type { WebSearchResult } from '../mcp/webSearch.js';

// ── WebSearchClient interface ────────────────────────────────────────────────

export interface WebSearchClient {
  search(query: string): Promise<WebSearchResult>;
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface DiscoveryEnricherOptions {
  /** Company and team summary from Step 1 */
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const MAX_ITEMS = 10;

/**
 * Extract a likely company name from the summary.
 * Uses the first capitalized multi-word sequence or first noun phrase.
 */
function extractCompanyName(summary: string): string {
  // Try quoted string first
  const quoted = summary.match(/"([^"]+)"/);
  if (quoted) return quoted[1];
  // Try first capitalized multi-word sequence
  const capitalized = summary.match(/\b([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*)\b/);
  if (capitalized) return capitalized[1];
  // Fallback: first 3 words
  return summary.split(/\s+/).slice(0, 3).join(' ');
}

/**
 * Map search results to "Title: Snippet" strings, capped at MAX_ITEMS.
 */
function mapResults(results: Array<{ title: string; snippet: string }>): string[] {
  return results.slice(0, MAX_ITEMS).map((r) => `${r.title}: ${r.snippet}`);
}

// ── DiscoveryEnricher ────────────────────────────────────────────────────────

export class DiscoveryEnricher {
  /**
   * Run the full enrichment flow: web search + optional WorkIQ.
   */
  async enrich(options: DiscoveryEnricherOptions): Promise<DiscoveryEnrichment> {
    const { companySummary, mcpManager, io, webSearchClient } = options;

    let webResult: Partial<DiscoveryEnrichment> = {};
    let workiqResult: Partial<DiscoveryEnrichment> = {};

    // Run web search if client provided
    if (webSearchClient) {
      io.writeActivity('Searching for recent company and industry context...');
      webResult = await this.enrichFromWebSearch(companySummary, webSearchClient);
    }

    // Run WorkIQ if available
    if (mcpManager.isAvailable('workiq')) {
      workiqResult = await this.enrichFromWorkIQ(companySummary, mcpManager, io);
    }

    // Merge results
    const sourcesUsed = [...(webResult.sourcesUsed ?? []), ...(workiqResult.sourcesUsed ?? [])];

    const enrichment: DiscoveryEnrichment = {
      ...webResult,
      ...workiqResult,
      sourcesUsed: sourcesUsed.length > 0 ? sourcesUsed : undefined,
      enrichedAt: new Date().toISOString(),
    };

    return enrichment;
  }

  /**
   * Run only the web search enrichment step.
   */
  async enrichFromWebSearch(
    companySummary: string,
    webSearchClient: WebSearchClient,
  ): Promise<Partial<DiscoveryEnrichment>> {
    const companyName = extractCompanyName(companySummary);

    const queries = [
      `${companyName} recent news 2024 2025`,
      `${companyName} competitors market 2024`,
      `${companyName} industry AI trends 2025`,
    ];

    const allSnippets: string[] = [];
    let companyNews: string[] = [];
    let competitorInfo: string[] = [];
    let industryTrends: string[] = [];

    for (let i = 0; i < queries.length; i++) {
      try {
        const result: WebSearchResult = await webSearchClient.search(queries[i]);
        if (result.degraded) continue;

        const mapped = mapResults(result.results);
        allSnippets.push(...result.results.map((r) => r.snippet));

        if (i === 0) companyNews = mapped;
        else if (i === 1) competitorInfo = mapped;
        else if (i === 2) industryTrends = mapped;
      } catch {
        // Individual query failure — continue with remaining queries
        continue;
      }
    }

    // If no results at all, return minimal object
    if (allSnippets.length === 0) {
      return {};
    }

    return {
      companyNews,
      competitorInfo,
      industryTrends,
      webSearchResults: allSnippets.join('\n'),
      sourcesUsed: ['websearch'],
      enrichedAt: new Date().toISOString(),
    };
  }

  /**
   * Run only the WorkIQ enrichment step.
   * Prompts the user for consent before making any WorkIQ calls.
   */
  async enrichFromWorkIQ(
    companySummary: string,
    mcpManager: McpManager,
    io: LoopIO,
  ): Promise<Partial<DiscoveryEnrichment>> {
    // Prompt for consent (default No)
    const answer = await io.readInput('May sofIA access WorkIQ for team insights? (y/N) ');
    if (!answer || answer.trim().toLowerCase() !== 'y') {
      return {};
    }

    try {
      const response = (await mcpManager.callTool(
        'workiq',
        'analyze_team',
        {
          summary: companySummary,
          focus: ['expertise', 'collaboration', 'documentation'],
        },
        { timeoutMs: 30_000 },
      )) as Record<string, unknown>;

      // Extract structured fields or fallback to insights string
      let teamExpertise: string[] | undefined;
      let collaborationPatterns: string[] | undefined;
      let documentationGaps: string[] | undefined;

      if (Array.isArray(response.teamExpertise)) {
        teamExpertise = response.teamExpertise as string[];
        collaborationPatterns = (response.collaborationPatterns ?? []) as string[];
        documentationGaps = (response.documentationGaps ?? []) as string[];
      } else if (typeof response.insights === 'string') {
        // Fallback: split by newline
        const lines = (response.insights as string).split('\n').filter(Boolean);
        teamExpertise = lines.length > 0 ? [lines[0]] : [];
        collaborationPatterns = lines.length > 1 ? [lines[1]] : [];
        documentationGaps = lines.length > 2 ? [lines[2]] : [];
      }

      if (!teamExpertise) {
        return {};
      }

      return {
        workiqInsights: {
          teamExpertise,
          collaborationPatterns,
          documentationGaps,
        },
        sourcesUsed: ['workiq'],
      };
    } catch {
      // Graceful degradation — return empty on any error
      return {};
    }
  }
}
