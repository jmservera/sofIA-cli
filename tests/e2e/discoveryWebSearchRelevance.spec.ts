/**
 * T041: Discovery web search enrichment relevance validation (SC-003-005).
 *
 * Validates that discovery web search enrichment retrieves keyword-relevant
 * context for at least 3 out of 5 test company descriptions.
 * Gated behind SOFIA_LIVE_MCP_TESTS=true because it requires real web search.
 *
 * Acceptance criteria:
 * - Run enrichFromWebSearch() for 5 different company descriptions
 * - At least 3/5 must return results with keyword-relevant content
 * - "Keyword-relevant" = at least one result snippet contains a word from the company/industry
 */
import { describe, it, expect } from 'vitest';

const LIVE = process.env.SOFIA_LIVE_MCP_TESTS === 'true';

const TEST_COMPANIES = [
  {
    summary:
      '"Contoso Healthcare" is a mid-sized healthcare company specializing in telemedicine and patient management software.',
    keywords: ['health', 'tele', 'patient', 'medical', 'care'],
  },
  {
    summary:
      '"Northwind Traders" is a global food distribution company managing supply chains across 30 countries.',
    keywords: ['food', 'supply', 'trade', 'distribution', 'logistics'],
  },
  {
    summary:
      '"Fabrikam Financial" provides fintech solutions for small business lending and payment processing.',
    keywords: ['fintech', 'financial', 'lending', 'payment', 'bank'],
  },
  {
    summary:
      '"AdventureWorks Cycles" manufactures premium bicycles and cycling accessories for professional athletes.',
    keywords: ['bicycle', 'cycling', 'sport', 'adventure', 'manufactur'],
  },
  {
    summary: '"Tailspin Toys" designs and sells educational STEM toys for children ages 5-12.',
    keywords: ['toy', 'education', 'STEM', 'children', 'learn'],
  },
];

describe.skipIf(!LIVE)('Discovery web search relevance validation (T041 / SC-003-005)', () => {
  it('at least 3/5 company descriptions return keyword-relevant results', async () => {
    const { DiscoveryEnricher } = await import('../../src/phases/discoveryEnricher.js');
    const { createWebSearchTool } = await import('../../src/mcp/webSearch.js');

    const webSearchFn = createWebSearchTool({
      endpoint: process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT!,
      apiKey: process.env.SOFIA_FOUNDRY_AGENT_KEY!,
    });

    const webSearchClient = {
      search: async (query: string) => webSearchFn(query),
    };

    const enricher = new DiscoveryEnricher();
    let relevantCount = 0;

    const results: Array<{ company: string; relevant: boolean; snippetCount: number }> = [];

    for (const company of TEST_COMPANIES) {
      const enrichment = await enricher.enrichFromWebSearch(company.summary, webSearchClient);

      // Collect all result strings from enrichment
      const allText = [
        ...(enrichment.companyNews ?? []),
        ...(enrichment.competitorInfo ?? []),
        ...(enrichment.industryTrends ?? []),
      ]
        .join(' ')
        .toLowerCase();

      const snippetCount =
        (enrichment.companyNews?.length ?? 0) +
        (enrichment.competitorInfo?.length ?? 0) +
        (enrichment.industryTrends?.length ?? 0);

      // Check if any keyword appears in the results
      const hasRelevantKeyword = company.keywords.some((kw) => allText.includes(kw.toLowerCase()));

      if (hasRelevantKeyword && snippetCount > 0) {
        relevantCount++;
      }

      results.push({
        company: company.summary.split('"')[1] || company.summary.slice(0, 30),
        relevant: hasRelevantKeyword && snippetCount > 0,
        snippetCount,
      });
    }

    // Log outcomes for manual review
    console.log('=== T041 Web Search Relevance Validation ===');
    for (const r of results) {
      console.log(`  ${r.relevant ? '✓' : '✗'} ${r.company}: ${r.snippetCount} snippets`);
    }
    console.log(`Result: ${relevantCount}/5 companies have relevant results`);

    // Acceptance: at least 3 out of 5
    expect(relevantCount).toBeGreaterThanOrEqual(3);
  }, 120_000); // 2 minute timeout for multiple web searches
});
