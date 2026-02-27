import { describe, it, expect } from 'vitest';
import { runDirect } from '../../../src/cli/directCommands';
import { runWorkshop } from '../../../src/cli/workshopCommand';

describe('Direct Commands', () => {
  it('fails fast in non-TTY mode without session', async () => {
    await expect(runDirect({ isTTY: false })).rejects.toThrow(/Missing required --session/i);
  });

  it('returns status for provided session id', async () => {
    const { sessionId } = await runWorkshop({ mode: 'new', inputs: {} });
    const status = await runDirect({ isTTY: false, sessionId, json: true });
    expect((status as any).sessionId).toBe(sessionId);
  });
});
