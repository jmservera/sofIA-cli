/**
 * Web search tool tests (T060, T018-T021).
 *
 * Tests for the web.search tool backed by Azure AI Foundry Agent Service.
 *
 * Covers:
 * - WebSearchConfig validation (T018)
 * - Legacy env var detection (T019)
 * - Graceful degradation scenarios (T020)
 * - Citation extraction from url_citation annotations (T021)
 * - Tool definition shape for Copilot SDK registration
 * - Successful search returning structured results
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  createWebSearchTool,
  isWebSearchConfigured,
  extractCitations,
  destroyWebSearchSession,
  WEB_SEARCH_TOOL_DEFINITION,
} from '../../../src/mcp/webSearch.js';
import type { AgentSessionDeps } from '../../../src/mcp/webSearch.js';

// ── Helper: Create fake agent session deps ──────────────────────────────────

function createFakeDeps(overrides?: Partial<AgentSessionDeps>): AgentSessionDeps {
  return {
    createClient: vi.fn().mockReturnValue({ fake: 'client' }),
    getOpenAIClient: vi.fn().mockResolvedValue({ fake: 'openai' }),
    createAgentVersion: vi.fn().mockResolvedValue({ name: 'sofia-web-search', version: 'v1' }),
    deleteAgentVersion: vi.fn().mockResolvedValue(undefined),
    createConversation: vi.fn().mockResolvedValue({ id: 'conv-123' }),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    createResponse: vi.fn().mockResolvedValue({
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Contoso is a healthcare AI company. See source.',
              annotations: [
                {
                  type: 'url_citation',
                  url: 'https://contoso.com/about',
                  title: 'Contoso Ltd - About',
                  start_index: 0,
                  end_index: 40,
                },
              ],
            },
          ],
        },
      ],
    }),
    ...overrides,
  };
}

describe('web.search tool', () => {
  const originalEnv = { ...process.env };

  afterEach(async () => {
    process.env = { ...originalEnv };
    await destroyWebSearchSession();
  });

  describe('isWebSearchConfigured', () => {
    it('returns true when both project endpoint and model deployment name are set', () => {
      process.env.FOUNDRY_PROJECT_ENDPOINT = 'https://sofia-foundry.services.ai.azure.com/api/projects/sofia-project';
      process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME = 'gpt-4.1-mini';
      expect(isWebSearchConfigured()).toBe(true);
    });

    it('returns false when project endpoint is missing', () => {
      delete process.env.FOUNDRY_PROJECT_ENDPOINT;
      process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME = 'gpt-4.1-mini';
      expect(isWebSearchConfigured()).toBe(false);
    });

    it('returns false when model deployment name is missing', () => {
      process.env.FOUNDRY_PROJECT_ENDPOINT = 'https://sofia-foundry.services.ai.azure.com/api/projects/sofia-project';
      delete process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME;
      expect(isWebSearchConfigured()).toBe(false);
    });

    it('returns false when both are missing', () => {
      delete process.env.FOUNDRY_PROJECT_ENDPOINT;
      delete process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME;
      expect(isWebSearchConfigured()).toBe(false);
    });

    it('returns false when only legacy vars are set (T019)', () => {
      process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT = 'https://foundry.example.com';
      process.env.SOFIA_FOUNDRY_AGENT_KEY = 'test-key-123';
      delete process.env.FOUNDRY_PROJECT_ENDPOINT;
      delete process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME;
      expect(isWebSearchConfigured()).toBe(false);
    });
  });

  describe('WebSearchConfig validation (T018)', () => {
    it('accepts valid config with projectEndpoint and modelDeploymentName', () => {
      const deps = createFakeDeps();
      const tool = createWebSearchTool({
        projectEndpoint: 'https://sofia-foundry.services.ai.azure.com/api/projects/sofia-project',
        modelDeploymentName: 'gpt-4.1-mini',
      }, deps);
      expect(tool).toBeTypeOf('function');
    });

    it('creates client with the provided projectEndpoint', async () => {
      const deps = createFakeDeps();
      const tool = createWebSearchTool({
        projectEndpoint: 'https://my-foundry.services.ai.azure.com/api/projects/proj',
        modelDeploymentName: 'gpt-4.1-mini',
      }, deps);
      await tool('test');
      expect(deps.createClient).toHaveBeenCalledWith(
        'https://my-foundry.services.ai.azure.com/api/projects/proj',
      );
    });

    it('passes modelDeploymentName to agent creation', async () => {
      const deps = createFakeDeps();
      const tool = createWebSearchTool({
        projectEndpoint: 'https://foundry.example.com',
        modelDeploymentName: 'my-model',
      }, deps);
      await tool('test');
      expect(deps.createAgentVersion).toHaveBeenCalledWith(
        expect.anything(),
        'sofia-web-search',
        expect.objectContaining({ model: 'my-model' }),
      );
    });
  });

  describe('tool definition', () => {
    it('has correct name and description', () => {
      expect(WEB_SEARCH_TOOL_DEFINITION.name).toBe('web.search');
      expect(WEB_SEARCH_TOOL_DEFINITION.description).toBeTruthy();
    });

    it('accepts a query parameter', () => {
      const params = WEB_SEARCH_TOOL_DEFINITION.parameters as Record<string, unknown>;
      expect(params).toBeDefined();
      expect((params.properties as Record<string, unknown>)?.query).toBeDefined();
    });
  });

  describe('createWebSearchTool', () => {
    it('returns structured results with citations on success', async () => {
      const deps = createFakeDeps();
      const tool = createWebSearchTool({
        projectEndpoint: 'https://foundry.example.com',
        modelDeploymentName: 'gpt-4.1-mini',
      }, deps);

      const result = await tool('Contoso healthcare');

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('Contoso Ltd - About');
      expect(result.results[0].url).toBe('https://contoso.com/about');
      expect(result.sources).toContain('https://contoso.com/about');
    });

    it('reuses agent on second call (lazy initialization)', async () => {
      const deps = createFakeDeps();
      const tool = createWebSearchTool({
        projectEndpoint: 'https://foundry.example.com',
        modelDeploymentName: 'gpt-4.1-mini',
      }, deps);

      await tool('first query');
      await tool('second query');

      // Agent created once, response called twice
      expect(deps.createAgentVersion).toHaveBeenCalledTimes(1);
      expect(deps.createResponse).toHaveBeenCalledTimes(2);
    });

    it('degrades gracefully when credential fails (T020)', async () => {
      const deps = createFakeDeps({
        getOpenAIClient: vi.fn().mockRejectedValue(new Error('Azure authentication failed — run `az login`')),
      });

      const tool = createWebSearchTool({
        projectEndpoint: 'https://foundry.example.com',
        modelDeploymentName: 'gpt-4.1-mini',
      }, deps);

      const result = await tool('test query');

      expect(result.results).toHaveLength(0);
      expect(result.degraded).toBe(true);
      expect(result.error).toContain('Azure authentication failed');
    });

    it('degrades gracefully when agent creation fails (T020)', async () => {
      const deps = createFakeDeps({
        createAgentVersion: vi.fn().mockRejectedValue(new Error('Failed to create web search agent: 403 Forbidden')),
      });

      const tool = createWebSearchTool({
        projectEndpoint: 'https://foundry.example.com',
        modelDeploymentName: 'gpt-4.1-mini',
      }, deps);

      const result = await tool('test query');

      expect(result.results).toHaveLength(0);
      expect(result.degraded).toBe(true);
      expect(result.error).toContain('Failed to create web search agent');
    });

    it('degrades gracefully on network error (T020)', async () => {
      const deps = createFakeDeps({
        createClient: vi.fn().mockImplementation(() => { throw new Error('Network error: ECONNREFUSED'); }),
      });

      const tool = createWebSearchTool({
        projectEndpoint: 'https://foundry.example.com',
        modelDeploymentName: 'gpt-4.1-mini',
      }, deps);

      const result = await tool('test query');

      expect(result.results).toHaveLength(0);
      expect(result.degraded).toBe(true);
      expect(result.error).toContain('Network error');
    });

    it('returns empty results with degraded flag when query fails', async () => {
      const deps = createFakeDeps({
        createResponse: vi.fn().mockRejectedValue(new Error('Web search query failed: 429 Rate limited')),
      });

      const tool = createWebSearchTool({
        projectEndpoint: 'https://foundry.example.com',
        modelDeploymentName: 'gpt-4.1-mini',
      }, deps);

      const result = await tool('test query');

      expect(result.results).toHaveLength(0);
      expect(result.degraded).toBe(true);
      expect(result.error).toContain('429');
    });
  });

  describe('extractCitations (T021)', () => {
    it('extracts url_citation annotations into results', () => {
      const output = [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Contoso is a leader in healthcare AI.',
              annotations: [
                {
                  type: 'url_citation',
                  url: 'https://contoso.com/about',
                  title: 'Contoso Ltd - Healthcare AI Solutions',
                  start_index: 0,
                  end_index: 37,
                },
              ],
            },
          ],
        },
      ];

      const { results, sources } = extractCitations(output);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Contoso Ltd - Healthcare AI Solutions');
      expect(results[0].url).toBe('https://contoso.com/about');
      expect(sources).toContain('https://contoso.com/about');
    });

    it('deduplicates sources by URL', () => {
      const output = [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'First ref. Second ref to same source.',
              annotations: [
                { type: 'url_citation', url: 'https://example.com', title: 'A', start_index: 0, end_index: 10 },
                { type: 'url_citation', url: 'https://example.com', title: 'B', start_index: 11, end_index: 37 },
              ],
            },
          ],
        },
      ];

      const { results, sources } = extractCitations(output);

      expect(results).toHaveLength(1);
      expect(sources).toHaveLength(1);
    });

    it('handles multiple distinct citations', () => {
      const output = [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Result text with multiple sources.',
              annotations: [
                { type: 'url_citation', url: 'https://a.com', title: 'Source A', start_index: 0, end_index: 10 },
                { type: 'url_citation', url: 'https://b.com', title: 'Source B', start_index: 11, end_index: 33 },
              ],
            },
          ],
        },
      ];

      const { results, sources } = extractCitations(output);

      expect(results).toHaveLength(2);
      expect(sources).toEqual(['https://a.com', 'https://b.com']);
    });

    it('returns empty results for output without citations', () => {
      const output = [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'No citations here.',
              annotations: [],
            },
          ],
        },
      ];

      const { results, sources } = extractCitations(output);

      expect(results).toHaveLength(0);
      expect(sources).toHaveLength(0);
    });

    it('ignores non-url_citation annotations', () => {
      const output = [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Some text',
              annotations: [
                { type: 'file_citation', url: 'file://local', title: 'File' },
                { type: 'url_citation', url: 'https://valid.com', title: 'Valid', start_index: 0, end_index: 9 },
              ],
            },
          ],
        },
      ];

      const { results } = extractCitations(output);

      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('https://valid.com');
    });

    it('ignores non-message output items', () => {
      const output = [
        { type: 'tool_call', name: 'web_search_preview' },
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Result text.',
              annotations: [
                { type: 'url_citation', url: 'https://found.com', title: 'Found', start_index: 0, end_index: 12 },
              ],
            },
          ],
        },
      ];

      const { results } = extractCitations(output);

      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('https://found.com');
    });
  });

  describe('destroyWebSearchSession', () => {
    it('cleans up agent and conversation on destroy', async () => {
      const deps = createFakeDeps();
      const tool = createWebSearchTool({
        projectEndpoint: 'https://foundry.example.com',
        modelDeploymentName: 'gpt-4.1-mini',
      }, deps);

      // Initialize the session
      await tool('trigger init');

      // Destroy
      await destroyWebSearchSession();

      expect(deps.deleteConversation).toHaveBeenCalledWith(expect.anything(), 'conv-123');
      expect(deps.deleteAgentVersion).toHaveBeenCalledWith(expect.anything(), 'sofia-web-search', 'v1');
    });

    it('is safe to call when not initialized', async () => {
      // Should not throw
      await destroyWebSearchSession();
    });

    it('logs warning but does not throw when cleanup fails', async () => {
      const deps = createFakeDeps({
        deleteConversation: vi.fn().mockRejectedValue(new Error('cleanup failed')),
        deleteAgentVersion: vi.fn().mockRejectedValue(new Error('cleanup failed')),
      });

      const tool = createWebSearchTool({
        projectEndpoint: 'https://foundry.example.com',
        modelDeploymentName: 'gpt-4.1-mini',
      }, deps);

      await tool('trigger init');

      // Should not throw
      await expect(destroyWebSearchSession()).resolves.toBeUndefined();
    });
  });
});
