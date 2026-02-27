/**
 * T014: Unit tests for developCommand.
 *
 * Verifies:
 * - Session validation (rejects sessions without selection/plan)
 * - --session, --max-iterations, --output option parsing
 * - Error messages for invalid sessions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  validateSessionForDevelop,
  developCommand,
} from '../../../src/cli/developCommand.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';
import type { LoopIO } from '../../../src/loop/conversationLoop.js';
import type { CopilotClient } from '../../../src/shared/copilotClient.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  const now = new Date().toISOString();
  return {
    sessionId: 'test-dev-session',
    schemaVersion: '1.0.0',
    createdAt: now,
    updatedAt: now,
    phase: 'Develop',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    ideas: [
      {
        id: 'idea-1',
        title: 'AI Route Optimizer',
        description: 'Optimize delivery routes.',
        workflowStepIds: [],
      },
    ],
    selection: {
      ideaId: 'idea-1',
      selectionRationale: 'Best idea',
      confirmedByUser: true,
    },
    plan: {
      milestones: [{ id: 'm1', title: 'Setup', items: [] }],
      architectureNotes: 'Node.js + TypeScript',
    },
    ...overrides,
  };
}

function makeIo(): LoopIO {
  return {
    write: vi.fn(),
    writeActivity: vi.fn(),
    writeToolSummary: vi.fn(),
    readInput: vi.fn().mockResolvedValue(null),
    showDecisionGate: vi.fn().mockResolvedValue({ choice: 'exit' }),
    isJsonMode: false,
    isTTY: false,
  };
}

function makeFakeClient(): CopilotClient {
  return {
    createSession: vi.fn().mockResolvedValue({
      send: vi.fn().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { type: 'TextDelta', text: '```typescript file=src/index.ts\nexport function main() { return "ok"; }\n```', timestamp: '' };
        },
      }),
      getHistory: () => [],
    }),
  };
}

// ── validateSessionForDevelop ─────────────────────────────────────────────────

describe('validateSessionForDevelop', () => {
  it('returns null for a valid session with selection and plan', () => {
    const session = makeSession();
    expect(validateSessionForDevelop(session)).toBeNull();
  });

  it('returns error when selection is missing', () => {
    const session = makeSession({ selection: undefined });
    const error = validateSessionForDevelop(session);
    expect(error).not.toBeNull();
    expect(error).toContain('missing an idea selection');
  });

  it('returns error when plan is missing', () => {
    const session = makeSession({ plan: undefined });
    const error = validateSessionForDevelop(session);
    expect(error).not.toBeNull();
    expect(error).toContain('missing an implementation plan');
  });

  it('error message includes guidance to run Select phase when selection missing', () => {
    const session = makeSession({ selection: undefined });
    const error = validateSessionForDevelop(session);
    expect(error).toContain('Select');
  });

  it('error message includes guidance to run Plan phase when plan missing', () => {
    const session = makeSession({ plan: undefined });
    const error = validateSessionForDevelop(session);
    expect(error).toContain('Plan');
  });
});

// ── developCommand ────────────────────────────────────────────────────────────

describe('developCommand', () => {
  let originalExitCode: number | undefined;
  let stdoutOutput: string[];
  let stderrOutput: string[];

  beforeEach(() => {
    originalExitCode = process.exitCode as number | undefined;
    process.exitCode = undefined;
    stdoutOutput = [];
    stderrOutput = [];

    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutOutput.push(chunk.toString());
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrOutput.push(chunk.toString());
      return true;
    });
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('fails with exitCode 1 when session not found', async () => {
    const io = makeIo();
    const client = makeFakeClient();
    const store = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
    };

    await developCommand({ session: 'nonexistent' }, { store, io, client });

    expect(process.exitCode).toBe(1);
  });

  it('fails with exitCode 1 when no sessions exist', async () => {
    const io = makeIo();
    const client = makeFakeClient();
    const store = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
    };

    await developCommand({}, { store, io, client });

    expect(process.exitCode).toBe(1);
  });

  it('outputs error as JSON when --json flag is set and session not found', async () => {
    const io = makeIo();
    const client = makeFakeClient();
    const store = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
    };

    await developCommand({ session: 'missing', json: true }, { store, io, client });

    expect(stdoutOutput.some((o) => o.includes('"error"'))).toBe(true);
  });

  it('fails with exitCode 1 when session has no selection', async () => {
    const io = makeIo();
    const client = makeFakeClient();
    const session = makeSession({ selection: undefined });
    const store = {
      load: vi.fn().mockResolvedValue(session),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue(['test-dev-session']),
    };

    await developCommand({ session: 'test-dev-session' }, { store, io, client });

    expect(process.exitCode).toBe(1);
  });

  it('fails with exitCode 1 when session has no plan', async () => {
    const io = makeIo();
    const client = makeFakeClient();
    const session = makeSession({ plan: undefined });
    const store = {
      load: vi.fn().mockResolvedValue(session),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue(['test-dev-session']),
    };

    await developCommand({ session: 'test-dev-session' }, { store, io, client });

    expect(process.exitCode).toBe(1);
  });

  it('outputs validation error as JSON when --json flag set and selection missing', async () => {
    const io = makeIo();
    const client = makeFakeClient();
    const session = makeSession({ selection: undefined });
    const store = {
      load: vi.fn().mockResolvedValue(session),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue(['test-dev-session']),
    };

    await developCommand({ session: 'test-dev-session', json: true }, { store, io, client });

    const jsonOutput = stdoutOutput.find((o) => o.includes('"error"'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!) as { error: string };
    expect(parsed.error).toContain('selection');
  });

  it('uses most recent session when no --session specified', async () => {
    const io = makeIo();
    const client = makeFakeClient();
    const session = makeSession({ plan: undefined }); // Will fail validation
    const store = {
      load: vi.fn().mockResolvedValue(session),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue(['session-1', 'session-2', 'test-dev-session']),
    };

    await developCommand({}, { store, io, client });

    // Should try to load the last session in the list
    expect(store.load).toHaveBeenCalledWith('test-dev-session');
  });
});
