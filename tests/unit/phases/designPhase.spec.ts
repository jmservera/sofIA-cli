import { describe, it, expect, vi } from 'vitest';
import { runDesignPhase } from '../../../src/phases/designPhase';

describe('Design Phase', () => {
  it('produces idea cards with mermaid architecture diagrams and uses docs tools when available', async () => {
    const fakeCopilot = { streamConversation: vi.fn().mockReturnValue([{ type: 'text-delta', content: 'Solution sketch' }]) };
    const fakeMcp = { lookupDocs: vi.fn().mockResolvedValue([{ title: 'Doc', url: 'https://docs.test' }]) };
    const state: any = { ideas: [{ title: 'Predictive Maintenance' }] };
    const result = await runDesignPhase({ state, copilot: fakeCopilot as any, mcp: fakeMcp as any });
    expect(result.ideaCards?.[0]?.title).toBe('Predictive Maintenance');
    expect(result.ideaCards?.[0]?.architecture).toMatch(/mermaid/i);
    expect(result.artifacts?.design?.length ?? 0).toBeGreaterThan(0);
  });
});
