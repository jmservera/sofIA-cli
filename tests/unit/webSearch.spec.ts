import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchWeb } from '../../src/mcp/webSearch';

const env = process.env;

describe('web.search', () => {
  beforeEach(() => {
    process.env = { ...env };
  });
  afterEach(() => {
    process.env = env;
  });

  it('throws a clear error when Foundry agent config is missing', async () => {
    delete process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT;
    delete process.env.SOFIA_FOUNDRY_AGENT_KEY;
    await expect(searchWeb('acme corp', { transport: vi.fn() as any })).rejects.toThrow(/Foundry agent.*not configured/i);
  });

  it('returns structured results when agent responds', async () => {
    process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT = 'https://foundry.example.com/agent';
    process.env.SOFIA_FOUNDRY_AGENT_KEY = 'fake-key';
    const mockTransport = vi.fn().mockResolvedValue({
      results: [
        { title: 'Acme Corp', url: 'https://example.com', snippet: 'A company profile' },
      ],
    });
    const out = await searchWeb('acme corp', { transport: mockTransport as any });
    expect(out.results && out.results[0]?.title).toBe('Acme Corp');
    expect(mockTransport).toHaveBeenCalled();
  });

  it('degrades gracefully when the agent fails', async () => {
    process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT = 'https://foundry.example.com/agent';
    process.env.SOFIA_FOUNDRY_AGENT_KEY = 'fake-key';
    const mockTransport = vi.fn().mockRejectedValue(new Error('network down'));
    const out = await searchWeb('acme corp', { transport: mockTransport as any, allowFallback: true });
    expect(out.fallback).toBe(true);
    expect(out.message).toMatch(/guided research/i);
  });
});
