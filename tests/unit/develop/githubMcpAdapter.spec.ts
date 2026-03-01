/**
 * T032: Unit tests for GitHubMcpAdapter.
 *
 * Verifies:
 * - isAvailable() checks McpManager.isAvailable('github')
 * - createRepository() calls MCP tool
 * - pushFiles() commits and pushes
 * - Graceful fallback returns { available: false } when MCP unavailable
 */
import { describe, it, expect, vi } from 'vitest';

import { GitHubMcpAdapter } from '../../../src/develop/githubMcpAdapter.js';
import type { McpManager } from '../../../src/mcp/mcpManager.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMcpManager(
  githubAvailable: boolean,
  callToolImpl?: (
    server: string,
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>,
): McpManager {
  return {
    isAvailable: (name: string) => name === 'github' && githubAvailable,
    listServers: () => [],
    getServerConfig: () => undefined,
    markConnected: () => {},
    markDisconnected: () => {},
    getAllConfigs: () => [],
    callTool: callToolImpl
      ? vi.fn(callToolImpl)
      : vi.fn().mockRejectedValue(new Error('not wired')),
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
    it('calls mcpManager.callTool with create_repository and returns parsed result', async () => {
      const callTool = vi.fn().mockResolvedValue({
        html_url: 'https://github.com/acme/poc-route-optimizer',
        name: 'poc-route-optimizer',
      });
      const mgr = makeMcpManager(true, callTool);
      const adapter = new GitHubMcpAdapter(mgr);
      const result = await adapter.createRepository({
        name: 'poc-route-optimizer',
        description: 'AI route optimization PoC',
      });

      expect(result.available).toBe(true);
      if (result.available) {
        expect(result.repoUrl).toBe('https://github.com/acme/poc-route-optimizer');
        expect(result.repoName).toBe('poc-route-optimizer');
      }
      expect(callTool).toHaveBeenCalledWith('github', 'create_repository', {
        name: 'poc-route-optimizer',
        description: 'AI route optimization PoC',
        private: true,
      });
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

    it('returns { available: false } when callTool throws', async () => {
      const callTool = vi.fn().mockRejectedValue(new Error('MCP callTool not yet wired'));
      const adapter = new GitHubMcpAdapter(makeMcpManager(true, callTool));
      const result = await adapter.createRepository({ name: 'poc-fail' });

      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason).toContain('not yet wired');
      }
    });

    it('stores repo URL after successful creation', async () => {
      const callTool = vi.fn().mockResolvedValue({
        html_url: 'https://github.com/acme/my-poc',
        name: 'my-poc',
      });
      const adapter = new GitHubMcpAdapter(makeMcpManager(true, callTool));
      await adapter.createRepository({ name: 'my-poc' });

      expect(adapter.getRepoUrl()).toBe('https://github.com/acme/my-poc');
    });

    it('returns { available: false } when response has no URL', async () => {
      const callTool = vi.fn().mockResolvedValue({ id: 123 });
      const adapter = new GitHubMcpAdapter(makeMcpManager(true, callTool));
      const result = await adapter.createRepository({ name: 'no-url' });

      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason).toContain('missing repository URL');
      }
    });
  });

  describe('pushFiles()', () => {
    it('calls mcpManager.callTool with push_files and returns commitSha', async () => {
      const callTool = vi.fn().mockResolvedValue({ sha: 'abc123ff' });
      const mgr = makeMcpManager(true, callTool);
      const adapter = new GitHubMcpAdapter(mgr);
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
        expect(result.commitSha).toBe('abc123ff');
      }
      expect(callTool).toHaveBeenCalledWith('github', 'push_files', {
        repoUrl: 'https://github.com/acme/my-poc',
        files: [
          { path: 'src/index.ts', content: 'export function main() {}' },
          { path: 'package.json', content: '{"name":"my-poc"}' },
        ],
        message: 'chore: initial scaffold',
        branch: 'main',
      });
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

    it('returns { available: false } when callTool throws', async () => {
      const callTool = vi.fn().mockRejectedValue(new Error('push failed'));
      const adapter = new GitHubMcpAdapter(makeMcpManager(true, callTool));
      const result = await adapter.pushFiles({
        repoUrl: 'https://github.com/acme/my-poc',
        files: [{ path: 'a.ts', content: '' }],
        commitMessage: 'boom',
      });

      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.reason).toContain('push failed');
      }
    });

    it('handles empty files array', async () => {
      const callTool = vi.fn().mockResolvedValue({ sha: 'empty00' });
      const adapter = new GitHubMcpAdapter(makeMcpManager(true, callTool));
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
      const callTool = vi.fn().mockResolvedValue({
        html_url: 'https://github.com/acme/test-poc',
        name: 'test-poc',
      });
      const adapter = new GitHubMcpAdapter(makeMcpManager(true, callTool));
      await adapter.createRepository({ name: 'test-poc' });
      expect(adapter.getRepoUrl()).toBe('https://github.com/acme/test-poc');
    });
  });
});
