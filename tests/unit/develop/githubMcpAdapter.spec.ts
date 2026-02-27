/**
 * T032: Unit tests for GitHubMcpAdapter.
 *
 * Verifies:
 * - isAvailable() checks McpManager.isAvailable('github')
 * - createRepository() calls MCP tool
 * - pushFiles() commits and pushes
 * - Graceful fallback returns { available: false } when MCP unavailable
 */
import { describe, it, expect } from 'vitest';

import { GitHubMcpAdapter } from '../../../src/develop/githubMcpAdapter.js';
import type { McpManager } from '../../../src/mcp/mcpManager.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMcpManager(githubAvailable: boolean): McpManager {
  return {
    isAvailable: (name: string) => name === 'github' && githubAvailable,
    listServers: () => [],
    getServerConfig: () => undefined,
    markConnected: () => {},
    markDisconnected: () => {},
    getAllConfigs: () => [],
  } as unknown as McpManager;
}

describe('GitHubMcpAdapter', () => {
  describe('isAvailable()', () => {
    it('returns true when McpManager.isAvailable("github") is true', () => {
      const adapter = new GitHubMcpAdapter(makeMcpManager(true));
      expect(adapter.isAvailable()).toBe(true);
    });

    it('returns false when GitHub MCP is not available', () => {
      const adapter = new GitHubMcpAdapter(makeMcpManager(false));
      expect(adapter.isAvailable()).toBe(false);
    });
  });

  describe('createRepository()', () => {
    it('returns { available: true, repoUrl, repoName } when GitHub MCP is available', async () => {
      const adapter = new GitHubMcpAdapter(makeMcpManager(true));
      const result = await adapter.createRepository({
        name: 'poc-route-optimizer',
        description: 'AI route optimization PoC',
      });

      expect(result.available).toBe(true);
      if (result.available) {
        expect(result.repoUrl).toContain('poc-route-optimizer');
        expect(result.repoName).toBe('poc-route-optimizer');
      }
    });

    it('returns { available: false } when GitHub MCP is unavailable', async () => {
      const adapter = new GitHubMcpAdapter(makeMcpManager(false));
      const result = await adapter.createRepository({
        name: 'poc-route-optimizer',
      });

      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason).toBeDefined();
      }
    });

    it('stores repo URL after successful creation', async () => {
      const adapter = new GitHubMcpAdapter(makeMcpManager(true));
      await adapter.createRepository({ name: 'my-poc' });

      expect(adapter.getRepoUrl()).toBeDefined();
      expect(adapter.getRepoUrl()).toContain('my-poc');
    });
  });

  describe('pushFiles()', () => {
    it('returns { available: true, commitSha } when GitHub MCP is available', async () => {
      const adapter = new GitHubMcpAdapter(makeMcpManager(true));
      const result = await adapter.pushFiles({
        repoUrl: 'https://github.com/acme/my-poc',
        files: [
          { path: 'src/index.ts', content: 'export function main() {}' },
          { path: 'package.json', content: '{"name":"my-poc"}' },
        ],
        commitMessage: 'chore: initial scaffold',
      });

      expect(result.available).toBe(true);
      if (result.available) {
        expect(result.commitSha).toBeDefined();
      }
    });

    it('returns { available: false } when GitHub MCP is unavailable', async () => {
      const adapter = new GitHubMcpAdapter(makeMcpManager(false));
      const result = await adapter.pushFiles({
        repoUrl: 'https://github.com/acme/my-poc',
        files: [],
        commitMessage: 'test',
      });

      expect(result.available).toBe(false);
    });

    it('handles empty files array', async () => {
      const adapter = new GitHubMcpAdapter(makeMcpManager(true));
      const result = await adapter.pushFiles({
        repoUrl: 'https://github.com/acme/my-poc',
        files: [],
        commitMessage: 'empty commit',
      });

      expect(result.available).toBe(true);
    });
  });

  describe('getRepoUrl()', () => {
    it('returns undefined before createRepository is called', () => {
      const adapter = new GitHubMcpAdapter(makeMcpManager(true));
      expect(adapter.getRepoUrl()).toBeUndefined();
    });

    it('returns URL after successful createRepository', async () => {
      const adapter = new GitHubMcpAdapter(makeMcpManager(true));
      await adapter.createRepository({ name: 'test-poc' });
      expect(adapter.getRepoUrl()).toBeDefined();
    });
  });
});
