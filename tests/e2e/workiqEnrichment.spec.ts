/**
 * T043: Live WorkIQ enrichment validation (SC-003-006).
 *
 * Validates that WorkIQ enrichment completes within 10 seconds and
 * persists workiqInsights in the enrichment result.
 * Gated behind SOFIA_LIVE_MCP_TESTS=true.
 *
 * Requires:
 * - WorkIQ MCP server accessible (Microsoft 365 tenant with admin consent)
 * - SOFIA_LIVE_MCP_TESTS=true
 */
import { describe, it, expect } from 'vitest';

const LIVE = process.env.SOFIA_LIVE_MCP_TESTS === 'true';

describe.skipIf(!LIVE)('WorkIQ enrichment validation (T043 / SC-003-006)', () => {
  it('WorkIQ enrichment completes within 10s and returns insights', async () => {
    const { DiscoveryEnricher } = await import('../../src/phases/discoveryEnricher.js');
    const { McpManager, loadMcpConfig } = await import('../../src/mcp/mcpManager.js');

    const config = await loadMcpConfig('.vscode/mcp.json');
    const mcpManager = new McpManager(config);

    // Skip if WorkIQ is not configured
    if (!mcpManager.isAvailable('workiq')) {
      console.log('WorkIQ not available — skipping T043');
      return;
    }

    const enricher = new DiscoveryEnricher();
    const io = {
      write: () => {},
      writeActivity: () => {},
      readInput: async () => 'y', // Auto-consent for live test
    };

    const start = Date.now();

    const result = await enricher.enrich({
      companySummary:
        'Contoso Corp is a technology company developing cloud-based enterprise solutions.',
      mcpManager,
      io: io as never,
    });

    const elapsed = Date.now() - start;

    const wi = result.workiqInsights;
    console.log('=== T043 WorkIQ Enrichment Validation ===');
    console.log(`Elapsed: ${elapsed}ms`);
    console.log(`Sources used: ${result.sourcesUsed?.join(', ') ?? 'none'}`);
    console.log(`Team expertise items: ${wi?.teamExpertise?.length ?? 0}`);
    console.log(`Collaboration patterns: ${wi?.collaborationPatterns?.length ?? 0}`);
    console.log(`Documentation gaps: ${wi?.documentationGaps?.length ?? 0}`);

    // Must complete within 10 seconds
    expect(elapsed).toBeLessThan(10_000);

    // Must include WorkIQ as a source
    expect(result.sourcesUsed).toContain('workiq');

    // Must have at least some insight data
    const hasInsights =
      (wi?.teamExpertise?.length ?? 0) > 0 ||
      (wi?.collaborationPatterns?.length ?? 0) > 0 ||
      (wi?.documentationGaps?.length ?? 0) > 0;

    expect(hasInsights).toBe(true);

    await mcpManager.disconnectAll();
  }, 30_000);
});
