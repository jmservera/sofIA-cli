import { describe, it, expect } from 'vitest';
import { runWorkshop } from '../../src/cli/workshopCommand';
import { SessionManager } from '../../src/sessions/sessionManager';

describe('Resume and Backtrack (integration)', () => {
  it('resumes an existing session and backtracks invalidating downstream artifacts', async () => {
    const first = await runWorkshop({ mode: 'new', inputs: { sessionName: 'BacktrackTest' } });
    const sessionId = first.sessionId;
    const manager = new SessionManager();
    const resumed = await manager.resume(sessionId);
    expect(resumed?.sessionId).toBe(sessionId);
    // Backtrack to Ideate
    const backtracked = await manager.backtrack(sessionId, 'Ideate');
    expect(backtracked?.phase).toBe('Ideate');
    // Downstream artifacts should be cleared
    expect(backtracked?.artifacts?.design).toBeUndefined();
    expect(backtracked?.artifacts?.select).toBeUndefined();
  });
});
