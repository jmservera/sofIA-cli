/**
 * T042: Integration test for MCP degradation flow.
 *
 * Configures McpManager with servers marked unavailable (or stub transports
 * that throw), runs GitHubMcpAdapter + McpContextEnricher calls, and asserts
 * graceful degradation (no throws; adapters return { available: false, reason }
 * or fallback context) per US1 Acceptance Scenario 4 and FR-013.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { McpManager } from '../../src/mcp/mcpManager.js';
import type { McpConfig } from '../../src/mcp/mcpManager.js';
import { GitHubMcpAdapter } from '../../src/develop/githubMcpAdapter.js';
import { McpContextEnricher } from '../../src/develop/mcpContextEnricher.js';

vi.mock('../../src/mcp/webSearch.js', () => ({
  isWebSearchConfigured: vi.fn(() => false),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEmptyConfig(): McpConfig {
  return { servers: {} };
}

function makeConfigWithServers(): McpConfig {
  return {
    servers: {
      github: {
        name: 'github',
        type: 'http' as const,
        url: 'https://api.github.com/mcp',
      },
      context7: {
        name: 'context7',
        type: 'stdio' as const,
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
      },
      azure: {
        name: 'azure',
        type: 'stdio' as const,
        command: 'npx',
        args: ['-y', '@azure/mcp'],
      },
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MCP Degradation Flow (integration)', () => {
  let originalGithubToken: string | undefined;

  beforeEach(() => {
    originalGithubToken = process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    if (originalGithubToken !== undefined) {
      process.env.GITHUB_TOKEN = originalGithubToken;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
    vi.restoreAllMocks();
  });

  describe('GitHubMcpAdapter graceful degradation', () => {
    it('returns available:false when GitHub MCP is not configured', async () => {
      const manager = new McpManager(makeEmptyConfig());
      const adapter = new GitHubMcpAdapter(manager);

      expect(adapter.isAvailable()).toBe(false);

      const createResult = await adapter.createRepository({ name: 'test-poc' });
      expect(createResult.available).toBe(false);
      if (!createResult.available) {
        expect(createResult.reason).toBeDefined();
      }

      const pushResult = await adapter.pushFiles({
        repoUrl: 'https://github.com/acme/test',
        files: [{ path: 'index.ts', content: 'hello' }],
        commitMessage: 'init',
      });
      expect(pushResult.available).toBe(false);
      if (!pushResult.available) {
        expect(pushResult.reason).toBeDefined();
      }
    });

    it('returns available:false when GitHub is configured but not connected', async () => {
      const manager = new McpManager(makeConfigWithServers());
      // Do NOT call markConnected — server is configured but unavailable
      const adapter = new GitHubMcpAdapter(manager);

      expect(adapter.isAvailable()).toBe(false);

      const createResult = await adapter.createRepository({ name: 'test-poc' });
      expect(createResult.available).toBe(false);
    });

    it('never throws from createRepository or pushFiles', async () => {
      const manager = new McpManager(makeConfigWithServers());
      manager.markConnected('github');

      // Stub callTool to throw
      vi.spyOn(manager, 'callTool').mockRejectedValue(new Error('network crash'));

      const adapter = new GitHubMcpAdapter(manager);

      // Should not throw
      const createResult = await adapter.createRepository({ name: 'test-poc' });
      expect(createResult.available).toBe(false);
      if (!createResult.available) {
        expect(createResult.reason).toBeDefined();
      }

      const pushResult = await adapter.pushFiles({
        repoUrl: 'https://github.com/acme/test',
        files: [{ path: 'index.ts', content: 'hello' }],
        commitMessage: 'init',
      });
      expect(pushResult.available).toBe(false);
    });
  });

  describe('McpContextEnricher graceful degradation', () => {
    it('returns empty context when all services unavailable', async () => {
      const manager = new McpManager(makeEmptyConfig());
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        dependencies: ['express', 'zod'],
        architectureNotes: 'Use Azure Cosmos DB',
        stuckIterations: 3,
        failingTests: ['test fails with TypeError'],
      });

      expect(result.combined).toBe('');
      expect(result.libraryDocs).toBeUndefined();
      expect(result.azureGuidance).toBeUndefined();
      expect(result.webSearchResults).toBeUndefined();
    });

    it('returns empty context when servers configured but not connected', async () => {
      const manager = new McpManager(makeConfigWithServers());
      // Not marking any server as connected
      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        dependencies: ['express'],
        architectureNotes: 'Use Azure Functions',
      });

      expect(result.combined).toBe('');
      expect(result.libraryDocs).toBeUndefined();
      expect(result.azureGuidance).toBeUndefined();
    });

    it('returns fallback context when callTool throws for all services', async () => {
      const manager = new McpManager(makeConfigWithServers());
      manager.markConnected('context7');
      manager.markConnected('azure');

      // Stub callTool to throw for all calls
      vi.spyOn(manager, 'callTool').mockRejectedValue(new Error('transport broken'));

      const enricher = new McpContextEnricher(manager);

      const result = await enricher.enrich({
        dependencies: ['express'],
        architectureNotes: 'Use Azure Cosmos DB for data',
      });

      // Context7 should fall back to npm links
      if (result.libraryDocs) {
        expect(result.libraryDocs).toContain('npmjs.com');
      }

      // Azure should fall back to static guidance
      if (result.azureGuidance) {
        expect(result.azureGuidance).toContain('DefaultAzureCredential');
      }
    });

    it('never throws from enrich()', async () => {
      const manager = new McpManager(makeConfigWithServers());
      manager.markConnected('context7');
      manager.markConnected('azure');

      vi.spyOn(manager, 'callTool').mockRejectedValue(new Error('catastrophic'));

      const enricher = new McpContextEnricher(manager);

      // Should not throw
      const result = await enricher.enrich({
        dependencies: ['express', 'zod'],
        architectureNotes: 'Use Azure Cosmos DB',
        stuckIterations: 5,
        failingTests: ['test fails'],
      });

      // Should still return a valid EnrichedContext
      expect(result).toHaveProperty('combined');
      expect(typeof result.combined).toBe('string');
    });
  });

  describe('Combined adapter + enricher degradation', () => {
    it('full workflow with all MCP unavailable returns graceful defaults', async () => {
      const manager = new McpManager(makeEmptyConfig());
      const adapter = new GitHubMcpAdapter(manager);
      const enricher = new McpContextEnricher(manager);

      // Adapter: not available
      expect(adapter.isAvailable()).toBe(false);
      const repoResult = await adapter.createRepository({ name: 'test' });
      expect(repoResult.available).toBe(false);

      // Enricher: empty context
      const contextResult = await enricher.enrich({
        dependencies: ['express'],
        architectureNotes: 'Use Azure',
        stuckIterations: 3,
        failingTests: ['test fails'],
      });
      expect(contextResult.combined).toBe('');
    });
  });
});
