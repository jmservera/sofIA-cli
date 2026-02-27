import { describe, it, expect } from 'vitest';
import { runWorkshop } from '../../src/cli/workshopCommand';

// This integration test describes the desired behavior; it will initially fail until implemented.
describe('New Session Flow (integration)', () => {
  it('runs Discover→Plan with decision gates and persists artifacts', async () => {
    const result = await runWorkshop({ mode: 'new', inputs: { sessionName: 'IntegrationTest' } });
    expect(result.sessionId).toBeTruthy();
    expect(result.phasesCompleted).toEqual(['Discover', 'Ideate', 'Design', 'Select', 'Plan']);
    expect(result.artifacts).toBeDefined();
    // Discover should have prompted at least once
    expect(result.artifacts?.discover?.length ?? 0).toBeGreaterThan(0);
    // Ideate should have selected at least one card/idea
    expect(result.artifacts?.ideate?.length ?? 0).toBeGreaterThan(0);
  });
});
