import { describe, it, expect, vi } from 'vitest';
import { runDiscoverPhase } from '../../../src/phases/discoverPhase';

const fakeCopilot = {
  streamConversation: vi.fn(),
};
const fakeMcp = {
  callWorkIQ: vi.fn(),
  webSearch: vi.fn(),
};

describe('Discover Phase', () => {
  it('asks clarifying questions when contextSummary empty and uses WorkIQ when available', async () => {
    const events = [
      { type: 'text-delta', content: 'Let me ask a few questions about your business.' },
      { type: 'text-delta', content: 'What is your primary challenge right now?' },
    ];
    const captured: any[] = [];
    fakeCopilot.streamConversation.mockReturnValue(events);
    fakeMcp.callWorkIQ.mockResolvedValue({ summary: 'WorkIQ summary' });

    const state = { businessContext: undefined } as any;
    const result = await runDiscoverPhase({ state, copilot: fakeCopilot as any, mcp: fakeMcp as any });
    const messages = fakeCopilot.streamConversation.mock.calls[0]?.[0] ?? [];
    expect(messages.some((m: any) => (m.content ?? '').includes('src/originalPrompts'))).toBe(true);

    expect(fakeMcp.callWorkIQ).toHaveBeenCalled();
    expect(result.businessContext?.summary).toContain('WorkIQ summary');
    expect(result.artifacts?.discover?.length ?? 0).toBeGreaterThan(0);
  });

  it('falls back to web.search when WorkIQ unavailable', async () => {
    fakeCopilot.streamConversation.mockReturnValue([{ type: 'text-delta', content: 'Fallback' }]);
    fakeMcp.callWorkIQ.mockRejectedValue(new Error('no workiq'));
    fakeMcp.webSearch.mockResolvedValue({ results: [{ title: 'Acme', url: 'https://acme.test' }] });
    const state = { businessContext: undefined } as any;
    const result = await runDiscoverPhase({ state, copilot: fakeCopilot as any, mcp: fakeMcp as any });
    expect(fakeMcp.webSearch).toHaveBeenCalled();
    expect(result.businessContext?.research?.[0]?.title).toBe('Acme');
  });
});
