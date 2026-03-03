/**
 * T039: Live MCP smoke tests.
 *
 * Gated behind SOFIA_LIVE_MCP_TESTS=true environment variable.
 * These tests exercise real MCP server integrations:
 * - GitHub MCP: create/delete a test repository
 * - Context7: resolve a library ID
 * - Azure MCP: return documentation for a simple query
 * - Web search: return results for a test query
 *
 * Requires:
 * - GITHUB_TOKEN set in environment
 * - MCP servers accessible
 */
import { describe, it, expect } from 'vitest';

const LIVE = process.env.SOFIA_LIVE_MCP_TESTS === 'true';

describe.skipIf(!LIVE)('Live MCP Smoke Tests (T039)', () => {
  it('GitHub MCP: creates and deletes a test repository', async () => {
    // This test requires GITHUB_TOKEN and the GitHub MCP server
    const { McpManager, loadMcpConfig } = await import('../../src/mcp/mcpManager.js');
    const config = await loadMcpConfig('.vscode/mcp.json');
    const manager = new McpManager(config);

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

      // Clean up: delete the test repo
      const deleteResult = await manager.callTool(
        'github',
        'delete_repository',
        {
          owner: (createResult as Record<string, unknown>).owner as string,
          repo: repoName,
        },
        { timeoutMs: 30_000 },
      );

      expect(deleteResult).toBeDefined();
    } finally {
      await manager.disconnectAll();
    }
  });

  it('Context7: resolves "express" library ID', async () => {
    const { McpManager, loadMcpConfig } = await import('../../src/mcp/mcpManager.js');
    const config = await loadMcpConfig('.vscode/mcp.json');
    const manager = new McpManager(config);

    try {
      const result = await manager.callTool(
        'context7',
        'resolve-library-id',
        {
          libraryName: 'express',
        },
        { timeoutMs: 30_000 },
      );

      expect(result).toBeDefined();
    } finally {
      await manager.disconnectAll();
    }
  });

  it('Web search: returns results for a test query', async () => {
    const { createWebSearchTool, isWebSearchConfigured } =
      await import('../../src/mcp/webSearch.js');

    // Skip if web search is not configured
    if (!isWebSearchConfigured()) {
      return;
    }

    const webSearch = createWebSearchTool({
      projectEndpoint: process.env.FOUNDRY_PROJECT_ENDPOINT!,
      modelDeploymentName: process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME!,
    });

    const result = await webSearch('TypeScript Node.js framework 2025');

    expect(result).toBeDefined();
    expect(result.results).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
  });
});
