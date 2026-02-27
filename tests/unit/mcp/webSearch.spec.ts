/**
 * Web search tool tests (T060).
 *
 * Tests for the web.search tool backed by Azure AI Foundry Bing Search agent.
 *
 * Covers:
 * - Successful search returning structured results
 * - Graceful degradation when Foundry is not configured
 * - Graceful degradation when Foundry returns an error
 * - Environment variable validation
 * - Response format (title, url, snippet, sources)
 * - Tool definition shape for Copilot SDK registration
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  createWebSearchTool,
  isWebSearchConfigured,
  WEB_SEARCH_TOOL_DEFINITION,
} from '../../../src/mcp/webSearch.js';

describe('web.search tool', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isWebSearchConfigured', () => {
    it('returns true when both endpoint and key are set', () => {
      process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT = 'https://foundry.example.com';
      process.env.SOFIA_FOUNDRY_AGENT_KEY = 'test-key-123';
      expect(isWebSearchConfigured()).toBe(true);
    });

    it('returns false when endpoint is missing', () => {
      delete process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT;
      process.env.SOFIA_FOUNDRY_AGENT_KEY = 'test-key-123';
      expect(isWebSearchConfigured()).toBe(false);
    });

    it('returns false when key is missing', () => {
      process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT = 'https://foundry.example.com';
      delete process.env.SOFIA_FOUNDRY_AGENT_KEY;
      expect(isWebSearchConfigured()).toBe(false);
    });

    it('returns false when both are missing', () => {
      delete process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT;
      delete process.env.SOFIA_FOUNDRY_AGENT_KEY;
      expect(isWebSearchConfigured()).toBe(false);
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
    it('returns structured results on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { title: 'AI in Retail', url: 'https://example.com/ai-retail', snippet: 'How AI transforms retail' },
          ],
          sources: ['https://example.com/ai-retail'],
        }),
      });

      const tool = createWebSearchTool({
        endpoint: 'https://foundry.example.com',
        apiKey: 'test-key',
        fetchFn: mockFetch,
      });

      const result = await tool('AI in retail industry');

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('AI in Retail');
      expect(result.results[0].url).toBe('https://example.com/ai-retail');
      expect(result.results[0].snippet).toBe('How AI transforms retail');
      expect(result.sources).toContain('https://example.com/ai-retail');
    });

    it('returns empty results when Foundry returns non-ok status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const tool = createWebSearchTool({
        endpoint: 'https://foundry.example.com',
        apiKey: 'test-key',
        fetchFn: mockFetch,
      });

      const result = await tool('test query');

      expect(result.results).toHaveLength(0);
      expect(result.degraded).toBe(true);
      expect(result.error).toContain('500');
    });

    it('degrades gracefully when fetch throws', async () => {
      const mockFetch = vi.fn().mockRejectedValue(
        Object.assign(new Error('Network error'), { code: 'ECONNREFUSED' }),
      );

      const tool = createWebSearchTool({
        endpoint: 'https://foundry.example.com',
        apiKey: 'test-key',
        fetchFn: mockFetch,
      });

      const result = await tool('test query');

      expect(result.results).toHaveLength(0);
      expect(result.degraded).toBe(true);
      expect(result.error).toContain('Network error');
    });

    it('sends correct headers including API key', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [], sources: [] }),
      });

      const tool = createWebSearchTool({
        endpoint: 'https://foundry.example.com/search',
        apiKey: 'secret-key-abc',
        fetchFn: mockFetch,
      });

      await tool('test query');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://foundry.example.com/search');
      expect(options.headers).toHaveProperty('Authorization', 'Bearer secret-key-abc');
      expect(options.method).toBe('POST');
    });

    it('sends query in request body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [], sources: [] }),
      });

      const tool = createWebSearchTool({
        endpoint: 'https://foundry.example.com',
        apiKey: 'key',
        fetchFn: mockFetch,
      });

      await tool('AI automation in manufacturing');

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.query).toBe('AI automation in manufacturing');
    });

    it('handles empty results array from Foundry', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [], sources: [] }),
      });

      const tool = createWebSearchTool({
        endpoint: 'https://foundry.example.com',
        apiKey: 'key',
        fetchFn: mockFetch,
      });

      const result = await tool('very specific niche query');

      expect(result.results).toHaveLength(0);
      expect(result.degraded).toBeUndefined();
    });

    it('handles malformed response from Foundry', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: 'format' }),
      });

      const tool = createWebSearchTool({
        endpoint: 'https://foundry.example.com',
        apiKey: 'key',
        fetchFn: mockFetch,
      });

      const result = await tool('test query');

      expect(result.results).toHaveLength(0);
      expect(result.degraded).toBe(true);
    });
  });
});
