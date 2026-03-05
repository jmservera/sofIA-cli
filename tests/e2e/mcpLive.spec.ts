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
    'GitHub MCP: creates and deletes a test repository',
    { timeout: 35_000 },
    async () => {
      // This test requires GITHUB_TOKEN env var OR `gh auth login` (GitHub CLI)
      const { McpManager, loadMcpConfig } = await import('../../src/mcp/mcpManager.js');
      const config = await loadMcpConfig('.vscode/mcp.json');
      const manager = new McpManager(config);
      manager.markConnected('github');

      const repoName = `sofia-mcp-test-${Date.now()}`;
      try {
        const createResult = await manager.callTool(
          'github',
          'create_repository',
          {
            name: repoName,
            description: 'Automated MCP integration test — safe to delete',
            private: true,
          },
          { timeoutMs: 30_000 },
        );

        expect(createResult).toBeDefined();
        expect(typeof createResult).toBe('object');

        // Verify the repository was created - McpManager already parses the content
        expect(createResult).toHaveProperty('url');
        expect((createResult as { url: string }).url).toContain(repoName);

        // Best-effort cleanup: delete the test repo using GitHub CLI
        // Note: This requires delete_repo scope; if it fails, the repo will need manual cleanup
        try {
          const username = execSync('gh api user --jq .login', { encoding: 'utf8' }).trim();
          execSync(`gh repo delete ${username}/${repoName} --yes`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'], // capture all output
          });
        } catch (_cleanupError) {
          // Cleanup failure is not a test failure - just log it
          console.warn(
            `⚠️  Could not auto-delete test repo ${repoName}. Please delete manually or grant delete_repo scope.`,
          );
          console.warn(`   Command: gh repo delete <username>/${repoName} --yes`);
        }
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
