/**
 * T041 focused: Discovery enricher repeated calls (simplified live test).
 *
 * Reproduces the exact scenario from T041 but with detailed logging
 * to isolate web search behavior across repeated enrichFromWebSearch() calls.
 *
 * Gated behind SOFIA_LIVE_MCP_TESTS=true to skip in CI.
 *
 * Run with:
 *   SOFIA_LIVE_MCP_TESTS=true \
 *   FOUNDRY_PROJECT_ENDPOINT=... \
 *   FOUNDRY_MODEL_DEPLOYMENT_NAME=... \
 *   npm test -- tests/unit/phases/discoveryEnricher.repeatCalls.spec.ts
 */
import { describe, it, expect } from 'vitest';

const LIVE = process.env.SOFIA_LIVE_MCP_TESTS === 'true';

const TEST_COMPANIES = [
  {
    summary: '"Nestlé" is a global food and beverage company headquartered in Switzerland.',
    keywords: ['food', 'beverage', 'switzerland'],
  },
  {
    summary: '"Zara" is a global retail company headquartered in Spain.',
    keywords: ['retail', 'fashion', 'spain'],
  },
  {
    summary:
      '"Microsoft Corporation" is a global technology company headquartered in Redmond, Washington.',
    keywords: ['technology', 'software', 'cloud'],
  },
];

describe.skipIf(!LIVE)('DiscoveryEnricher repeated web search calls (T041 focused)', () => {
  it('enrichFromWebSearch returns results for each company when called sequentially', async () => {
    const { DiscoveryEnricher } = await import('../../../src/phases/discoveryEnricher.js');
    const { createWebSearchTool } = await import('../../../src/mcp/webSearch.js');

    const webSearchFn = createWebSearchTool({
      projectEndpoint: process.env.FOUNDRY_PROJECT_ENDPOINT!,
      modelDeploymentName: process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME!,
    });

    const webSearchClient = {
      search: async (query: string) => {
        console.log(`  [WebSearch] Query: "${query}"`);
        const result = await webSearchFn(query);
        console.log(
          `  [WebSearch] Results: ${result.results.length} items, degraded=${result.degraded}`,
        );
        if (result.error) {
          console.log(`  [WebSearch] Error: ${result.error}`);
        }
        return result;
      },
    };

    const enricher = new DiscoveryEnricher();

    console.log('\n=== T041 Focused: Sequential enrichFromWebSearch Calls ===\n');

    const allResults: Array<{
      company: string;
      snippetCount: number;
      hasRelevantKeyword: boolean;
      rawContent: string[];
    }> = [];

    for (let idx = 0; idx < TEST_COMPANIES.length; idx++) {
      const company = TEST_COMPANIES[idx];
      console.log(
        `\n[${idx + 1}/${TEST_COMPANIES.length}] Processing: ${company.summary.split('"')[1]}`,
      );

      const enrichment = await enricher.enrichFromWebSearch(company.summary, webSearchClient);

      const content = [
        ...(enrichment.companyNews ?? []),
        ...(enrichment.competitorInfo ?? []),
        ...(enrichment.industryTrends ?? []),
      ];

      const allText = content.join(' ').toLowerCase();
      const hasRelevant = company.keywords.some((kw) => allText.includes(kw.toLowerCase()));

      console.log(`  [Enrichment] companyNews: ${enrichment.companyNews?.length ?? 0}`);
      console.log(`  [Enrichment] competitorInfo: ${enrichment.competitorInfo?.length ?? 0}`);
      console.log(`  [Enrichment] industryTrends: ${enrichment.industryTrends?.length ?? 0}`);
      console.log(`  [Enrichment] Total snippets: ${content.length}`);
      console.log(`  [Enrichment] Has relevant keyword: ${hasRelevant}`);

      if (content.length > 0) {
        console.log(`  [Enrichment] First snippet: ${content[0].slice(0, 80)}...`);
      }

      allResults.push({
        company: company.summary.split('"')[1],
        snippetCount: content.length,
        hasRelevantKeyword: hasRelevant,
        rawContent: content,
      });
    }

    console.log('\n=== Summary ===\n');
    let relevantCount = 0;
    for (const r of allResults) {
      const status = r.hasRelevantKeyword && r.snippetCount > 0 ? '✓' : '✗';
      console.log(
        `${status} ${r.company}: ${r.snippetCount} snippets, relevant=${r.hasRelevantKeyword}`,
      );
      if (r.hasRelevantKeyword && r.snippetCount > 0) {
        relevantCount++;
      }
    }

    console.log(
      `\nResult: ${relevantCount}/${TEST_COMPANIES.length} companies have relevant results`,
    );
    console.log(`Expected: >= 2 for pass (simplified from T041's 3/5 threshold)\n`);

    // Simplified threshold: at least 2/3
    expect(relevantCount).toBeGreaterThanOrEqual(2);
  }, 180_000); // 3 minute timeout for live queries
});
