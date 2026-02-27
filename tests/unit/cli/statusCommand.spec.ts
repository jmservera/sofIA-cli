import { describe, it, expect } from 'vitest';
import { runWorkshop } from '../../../src/cli/workshopCommand';
import { runStatus } from '../../../src/cli/statusCommand';

describe('status command', () => {
  it('returns minimal status for session', async () => {
    const { sessionId } = await runWorkshop({ mode: 'new', inputs: {} });
    const status = await runStatus(sessionId);
    expect(status?.sessionId).toBe(sessionId);
    expect(status?.phase).toBeDefined();
  });
});
