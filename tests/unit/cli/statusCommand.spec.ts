/**
 * T064: Unit tests for statusCommand — session name display.
 *
 * Verifies that statusCommand displays the session name in both
 * TTY table and JSON output formats.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { WorkshopSession } from '../../../src/shared/schemas/session.js';

function makeSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  return {
    sessionId: 'test-session-001',
    schemaVersion: '1.0.0',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T01:00:00Z',
    phase: 'Discover',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    turns: [],
    ...overrides,
  };
}

// Mock sessionStore
const mockStore = {
  load: vi.fn(),
  save: vi.fn(),
  exists: vi.fn(),
  list: vi.fn(),
};

vi.mock('../../../src/sessions/sessionStore.js', () => ({
  createDefaultStore: () => mockStore,
  SessionStore: vi.fn(),
}));

describe('statusCommand', () => {
  let stdoutChunks: string[];
  let stderrChunks: string[];
  const originalWrite = process.stdout.write;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeEach(() => {
    stdoutChunks = [];
    stderrChunks = [];
    process.stdout.write = vi.fn((chunk: string | Uint8Array) => {
      stdoutChunks.push(chunk.toString());
      return true;
    }) as typeof process.stdout.write;
    console.log = vi.fn((...args: unknown[]) => {
      stdoutChunks.push(args.map(String).join(' '));
    });
    console.error = vi.fn((...args: unknown[]) => {
      stderrChunks.push(args.map(String).join(' '));
    });
    process.exitCode = undefined;
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exitCode = undefined;
  });

  describe('session name display (T064)', () => {
    it('displays session name in JSON output for single session', async () => {
      const session = makeSession({ name: 'Logistics AI Workshop' } as Partial<WorkshopSession>);
      mockStore.exists.mockResolvedValue(true);
      mockStore.load.mockResolvedValue(session);

      const { statusCommand } = await import('../../../src/cli/statusCommand.js');
      await statusCommand({ session: 'test-session-001', json: true });

      const output = stdoutChunks.join('');
      const parsed = JSON.parse(output);
      expect(parsed.name).toBe('Logistics AI Workshop');
    });

    it('omits name from JSON output when session has no name', async () => {
      const session = makeSession();
      mockStore.exists.mockResolvedValue(true);
      mockStore.load.mockResolvedValue(session);

      const { statusCommand } = await import('../../../src/cli/statusCommand.js');
      await statusCommand({ session: 'test-session-001', json: true });

      const output = stdoutChunks.join('');
      const parsed = JSON.parse(output);
      expect(parsed.name).toBeUndefined();
    });

    it('displays session name in TTY output for single session', async () => {
      const session = makeSession({ name: 'Retail AI Insights' } as Partial<WorkshopSession>);
      mockStore.exists.mockResolvedValue(true);
      mockStore.load.mockResolvedValue(session);

      const { statusCommand } = await import('../../../src/cli/statusCommand.js');
      await statusCommand({ session: 'test-session-001', json: false });

      const output = stdoutChunks.join(' ');
      expect(output).toContain('Retail AI Insights');
    });

    it('displays session name in session list JSON output', async () => {
      const session = makeSession({ name: 'Supply Chain AI' } as Partial<WorkshopSession>);
      mockStore.list.mockResolvedValue(['test-session-001']);
      mockStore.load.mockResolvedValue(session);

      const { statusCommand } = await import('../../../src/cli/statusCommand.js');
      await statusCommand({ json: true });

      const output = stdoutChunks.join('');
      const parsed = JSON.parse(output);
      expect(parsed.sessions[0].name).toBe('Supply Chain AI');
    });

    it('displays session name in session list TTY table', async () => {
      const session = makeSession({ name: 'HR Automation' } as Partial<WorkshopSession>);
      mockStore.list.mockResolvedValue(['test-session-001']);
      mockStore.load.mockResolvedValue(session);

      const { statusCommand } = await import('../../../src/cli/statusCommand.js');
      await statusCommand({ json: false });

      const output = stdoutChunks.join(' ');
      expect(output).toContain('HR Automation');
    });
  });
});
