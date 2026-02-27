import { describe, it, expect } from 'vitest';
import { runSelectPhase } from '../../../src/phases/selectPhase';

describe('Select Phase', () => {
  it('scores ideas using BXT and recommends one idea with rationale', async () => {
    const ideas = [
      { title: 'Idea A' },
      { title: 'Idea B' },
    ];
    const state: any = { ideas };
    const result = await runSelectPhase({ state });
    expect(result.evaluation?.items?.length).toBe(2);
    expect(result.selection?.ideaId).toBeDefined();
    expect(result.selection?.selectionRationale).toMatch(/business/i);
  });
});
