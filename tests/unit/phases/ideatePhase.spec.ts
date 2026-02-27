import { describe, it, expect, vi } from 'vitest';
import { runIdeatePhase } from '../../../src/phases/ideatePhase';

describe('Ideate Phase', () => {
  it('presents cards and generates ranked ideas', async () => {
    const fakeCards = [
      { cardId: 'C1', title: 'Predictive Maintenance', category: 'Automation', description: 'Predict failures' },
      { cardId: 'C2', title: 'Customer Insights', category: 'Insights', description: 'Know your customer' },
    ];
    const cardsLoader = { loadCardsDataset: vi.fn().mockResolvedValue({ cards: fakeCards, categories: [] }) };
    const fakeCopilot = { streamConversation: vi.fn().mockReturnValue([{ type: 'text-delta', content: 'Idea 1' }]) };
    const state: any = { workflow: { activities: [] }, cards: undefined };
    const result = await runIdeatePhase({ state, copilot: fakeCopilot as any, cardsLoader: cardsLoader as any });
    const messages = fakeCopilot.streamConversation.mock.calls[0]?.[0] ?? [];
    expect(messages.some((m: any) => (m.content ?? '').includes('src/originalPrompts'))).toBe(true);
    expect(result.cards?.length).toBe(2);
    expect(result.ideas?.length).toBeGreaterThan(0);
    expect(result.artifacts?.ideate?.length ?? 0).toBeGreaterThan(0);
  });

  it('asks clarifying questions when context quality insufficient', async () => {
    const cardsLoader = { loadCardsDataset: vi.fn().mockResolvedValue({ cards: [], categories: [] }) };
    const events = [
      { type: 'text-delta', content: 'I need more detail about your workflow.' },
      { type: 'text-delta', content: 'Which activities are most painful?' },
    ];
    const fakeCopilot = { streamConversation: vi.fn().mockReturnValue(events) };
    const state: any = { workflow: null };
    const result = await runIdeatePhase({ state, copilot: fakeCopilot as any, cardsLoader: cardsLoader as any });
    expect(result.promptsAsked?.length).toBeGreaterThan(0);
  });
});
