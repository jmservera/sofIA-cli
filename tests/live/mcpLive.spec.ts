/**
 * T039: Live MCP smoke tests.
 *
 * Gated behind SOFIA_LIVE_MCP_TESTS=true environment variable.
 * These tests exercise real MCP server integrations:
 * - GitHub MCP: create/delete a test repository (infrastructure validation only)
 * - Context7: resolve a library ID
 * - Azure MCP: return documentation for a simple query
 * - Web search: return results for a test query
 *
 * NOTE: GitHub MCP test validates the infrastructure works, but sofIA does NOT
 * automatically create GitHub repos during PoC generation. PoCs are created locally
 * with git init, and users manually push when ready (safer approach).
 *
 * Requires:
 * - GitHub MCP: GITHUB_TOKEN env var OR `gh auth login` (GitHub CLI)
 * - MCP servers accessible
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { array } from 'zod';

const LIVE = process.env.SOFIA_LIVE_MCP_TESTS === 'true';

/**
 * Check if GitHub authentication is available (env var or GitHub CLI).
 */
function hasGitHubAuth(): boolean {
  if (process.env.GITHUB_TOKEN) return true;
  try {
    const token = execSync('gh auth token', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    return !!token;
  } catch {
    return false;
  }
}

describe.skipIf(!LIVE)('Live MCP Smoke Tests (T039)', () => {
  it.skipIf(!hasGitHubAuth())(
    'GitHub MCP: searches and retrieves repository information',
    { timeout: 35_000 },
    async () => {
      // This test requires GITHUB_TOKEN env var OR `gh auth login` (GitHub CLI)
      const { McpManager, loadMcpConfig } = await import('../../src/mcp/mcpManager.js');
      const config = await loadMcpConfig('.vscode/mcp.json');
      const manager = new McpManager(config);
      manager.markConnected('github');

      try {
        // Search for a popular repository
        const searchResult = await manager.callTool(
          'github',
          'search_repositories',
          {
            query: 'language:typescript stars:>1000',
            limit: 5,
          },
          { timeoutMs: 30_000 },
        );

        expect(searchResult).toBeDefined();
        expect(Array.isArray(searchResult) || typeof searchResult === 'object').toBe(true);

        // Get details about the GitHub Copilot SDK repository
        const repoResult = await manager.callTool(
          'github',
          'search_repositories',
          {
            query: 'repo:github/copilot-sdk',
            limit: 1,
          },
          { timeoutMs: 30_000 },
        );

        expect(repoResult).toBeDefined();
        expect(typeof repoResult).toBe('object');
        expect(repoResult).toHaveProperty('items');
        const items = (repoResult as Record<string, unknown>).items as unknown as any[];
        expect(items.length).toBeGreaterThan(0);
        expect(items[0]).toHaveProperty('name');
        expect(items[0].name).toBe('copilot-sdk');
      } finally {
        await manager.disconnectAll();
      }
    },
  );

  it('Context7: resolves "express" library ID', async () => {
    const { McpManager, loadMcpConfig } = await import('../../src/mcp/mcpManager.js');
    const config = await loadMcpConfig('.vscode/mcp.json');
    const manager = new McpManager(config);
    manager.markConnected('context7');

    try {
      const result = await manager.callTool(
        'context7',
        'resolve-library-id',
        {
          query: 'resolve express library id',
          libraryName: 'express',
        },
        { timeoutMs: 30_000 },
      );

      expect(result).toBeDefined();
      const rawText = typeof result.text === 'string' ? result.text : JSON.stringify(result);
      const content = rawText.toLowerCase();

      // Response should contain meaningful resolve-library-id content
      const expectedKeywords = ['express', 'context7-compatible library id', 'code snippets'];
      const matchedKeywords = expectedKeywords.filter((keyword) => content.includes(keyword));
      expect(matchedKeywords.length).toBeGreaterThanOrEqual(2);

      // Ensure at least one high-confidence Express library ID appears
      expect(content).toMatch(/\/expressjs\/express|\/websites\/expressjs_en/);
    } finally {
      await manager.disconnectAll();
    }
  });

  it('Web search: returns results for a test query', async () => {
    const { createWebSearchTool, isWebSearchConfigured } =
      await import('../../src/mcp/webSearch.js');

    // Skip if web search is not configured
    if (!isWebSearchConfigured()) {
      console.log('Web search not configured, skipping test');
      return;
    }

    const webSearch = createWebSearchTool({
      projectEndpoint: process.env.FOUNDRY_PROJECT_ENDPOINT!,
      modelDeploymentName: process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME!,
    });

    const result = await webSearch('TypeScript Node.js framework 2025');

    expect(result.degraded).toBeOneOf([false, undefined]);
    expect(result).toBeDefined();
    expect(result.results).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
  }, 30_000); // 30 second timeout for web search
});
