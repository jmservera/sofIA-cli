import { describe, it, expect } from 'vitest';
import { runPlanPhase } from '../../../src/phases/planPhase';

describe('Plan Phase', () => {
  it('produces an implementation roadmap with milestones, risks, metrics, and PoC intent fields', async () => {
    const state: any = { selection: { ideaId: 'idea-1' } };
    const result = await runPlanPhase({ state });
    expect(result.plan?.milestones?.length ?? 0).toBeGreaterThan(0);
    expect(result.plan?.risks?.length ?? 0).toBeGreaterThan(0);
    expect(result.plan?.successMetrics?.length ?? 0).toBeGreaterThan(0);
    expect(result.poc?.repoPath).toBeUndefined(); // intent only
    expect(result.pocIntent).toBeDefined();
    expect(result.artifacts?.plan?.length ?? 0).toBeGreaterThan(0);
  });
});
