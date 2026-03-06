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
    summary: '"Nestlé" is a global food and beverage company headquartered in Switzerland.',
    keywords: ['food', 'beverage', 'switzerland', 'global', 'company'],
  },
  {
    summary: '"Zara" is a global retail company headquartered in Spain.',
    keywords: ['retail', 'fashion', 'spain', 'global', 'company'],
  },
  {
    summary:
      '"Microsoft Corporation" is a global technology company headquartered in Redmond, Washington.',
    keywords: ['technology', 'software', 'hardware', 'cloud', 'global'],
  },
  {
    summary:
      '"Maersk" is a global shipping and logistics company headquartered in Copenhagen, Denmark.',
    keywords: ['shipping', 'logistics', 'denmark', 'global', 'company'],
  },
  {
    summary:
      '"Hasbro" is a global toy and entertainment company headquartered in Pawtucket, Rhode Island.',
    keywords: ['toy', 'entertainment', 'rhode island', 'global', 'company'],
  },
];

describe.skipIf(!LIVE)('Discovery web search relevance validation (T041 / SC-003-005)', () => {
  it('at least 3/5 company descriptions return keyword-relevant results', async () => {
    const { DiscoveryEnricher } = await import('../../src/phases/discoveryEnricher.js');
    const { createWebSearchTool } = await import('../../src/mcp/webSearch.js');

    const webSearchFn = createWebSearchTool({
      projectEndpoint: process.env.FOUNDRY_PROJECT_ENDPOINT!,
      modelDeploymentName: process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME!,
    });

    const webSearchClient = {
      search: async (query: string) => webSearchFn(query),
    };

    const enricher = new DiscoveryEnricher();
    let relevantCount = 0;

    const results: Array<{ company: string; relevant: boolean; snippetCount: number }> = [];

    for (let ci = 0; ci < TEST_COMPANIES.length; ci++) {
      // Delay between companies to avoid rate-limit bursts
      if (ci > 0) await new Promise((r) => setTimeout(r, 5000));
      const company = TEST_COMPANIES[ci];
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
  }, 300_000); // 5 minute timeout for multiple web searches with rate-limit delays
});
