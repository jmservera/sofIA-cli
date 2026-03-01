/**
 * Unit tests for workshopCommand — session name display, Plan→Develop
 * transition guidance (T052), and auto-transition prompt (T053).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { WorkshopSession } from '../../../src/shared/schemas/session.js';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockStore = {
  load: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn(),
  list: vi.fn(),
};

vi.mock('../../../src/sessions/sessionStore.js', () => ({
  createDefaultStore: () => mockStore,
  SessionStore: vi.fn(),
}));

// Minimal fake CopilotClient
const fakeClient = {
  async createSession() {
    return {
      send: async function* () {
        yield { type: 'TextDelta' as const, text: 'Hello!', timestamp: new Date().toISOString() };
      },
      getHistory: () => [],
    };
  },
};

vi.mock('../../../src/shared/copilotClient.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../../src/shared/copilotClient.js')>();
  return {
    ...orig,
    createCopilotClient: vi.fn().mockResolvedValue(fakeClient),
  };
});

vi.mock('../../../src/logging/logger.js', () => {
  const fakeLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    getLogger: vi.fn(() => fakeLogger),
    createLogger: vi.fn(() => fakeLogger),
    initGlobalLogger: vi.fn(() => fakeLogger),
  };
});

// Track LoopIO writes — decision gate is configurable per test
let ioWrites: string[] = [];
let ioReadResponses: (string | null)[] = [];
let ioReadIndex = 0;
let ioReadInputPrompts: string[] = [];
let decisionGateResponses: Array<{ choice: string }> = [];
let decisionGateIndex = 0;

vi.mock('../../../src/cli/ioContext.js', () => ({
  createLoopIO: () => ({
    write: (text: string) => {
      ioWrites.push(text);
    },
    writeActivity: () => {},
    readInput: async (prompt?: string) => {
      if (prompt) ioReadInputPrompts.push(prompt);
      if (ioReadIndex >= ioReadResponses.length) return null;
      return ioReadResponses[ioReadIndex++];
    },
    showDecisionGate: async () => {
      if (decisionGateIndex < decisionGateResponses.length) {
        return decisionGateResponses[decisionGateIndex++];
      }
      return { choice: 'exit' as const };
    },
    isJsonMode: false,
    isTTY: true,
  }),
}));

// Mock phaseHandlers to avoid loading prompts
vi.mock('../../../src/phases/phaseHandlers.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../../src/phases/phaseHandlers.js')>();
  return {
    ...orig,
    createPhaseHandler: () => ({
      phase: 'Discover',
      buildSystemPrompt: () => 'system prompt',
      getReferences: () => [],
      extractResult: () => ({}),
      isComplete: () => false,
      _preload: async () => {},
    }),
  };
});

describe('workshopCommand session name display (T064b)', () => {
  beforeEach(() => {
    ioWrites = [];
    ioReadResponses = [];
    ioReadIndex = 0;
    ioReadInputPrompts = [];
    decisionGateResponses = [];
    decisionGateIndex = 0;
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('displays session name on new session creation message', async () => {
    // Simulate: main menu → choose "new" (option 1) → session starts → exit
    ioReadResponses = ['1']; // Pick new session
    mockStore.list.mockResolvedValue([]);

    const { workshopCommand } = await import('../../../src/cli/workshopCommand.js');
    await workshopCommand({});

    const allOutput = ioWrites.join(' ');
    // New session should show session ID (timestamp format)
    expect(allOutput).toContain('New session');
  });

  it('displays session name when resuming a named session', async () => {
    const session: WorkshopSession = {
      sessionId: '2026-01-01_120000',
      schemaVersion: '1.0.0',
      createdAt: '2026-01-01T12:00:00Z',
      updatedAt: '2026-01-01T12:30:00Z',
      phase: 'Discover',
      status: 'Active',
      participants: [],
      artifacts: { generatedFiles: [] },
      turns: [],
      name: 'Logistics AI Workshop',
    } as WorkshopSession;

    mockStore.exists.mockResolvedValue(true);
    mockStore.load.mockResolvedValue(session);

    const { workshopCommand } = await import('../../../src/cli/workshopCommand.js');
    await workshopCommand({ session: '2026-01-01_120000' });

    // The session name should appear in the output somewhere
    const allOutput = ioWrites.join(' ');
    expect(allOutput).toContain('Logistics AI Workshop');
  });

  it('displays session name in pause message when session has a name', async () => {
    const session: WorkshopSession = {
      sessionId: '2026-01-01_120000',
      schemaVersion: '1.0.0',
      createdAt: '2026-01-01T12:00:00Z',
      updatedAt: '2026-01-01T12:30:00Z',
      phase: 'Discover',
      status: 'Active',
      participants: [],
      artifacts: { generatedFiles: [] },
      turns: [],
      name: 'Retail Insights',
    } as WorkshopSession;

    mockStore.exists.mockResolvedValue(true);
    mockStore.load.mockResolvedValue(session);

    const { workshopCommand } = await import('../../../src/cli/workshopCommand.js');
    // Direct session mode triggers run → decision gate returns exit → pauses
    await workshopCommand({ session: '2026-01-01_120000' });

    const allOutput = ioWrites.join(' ');
    expect(allOutput).toContain('Retail Insights');
  });

  it('shows only session ID when no name is set', async () => {
    const session: WorkshopSession = {
      sessionId: '2026-01-01_120000',
      schemaVersion: '1.0.0',
      createdAt: '2026-01-01T12:00:00Z',
      updatedAt: '2026-01-01T12:30:00Z',
      phase: 'Discover',
      status: 'Active',
      participants: [],
      artifacts: { generatedFiles: [] },
      turns: [],
    };

    mockStore.exists.mockResolvedValue(true);
    mockStore.load.mockResolvedValue(session);

    const { workshopCommand } = await import('../../../src/cli/workshopCommand.js');
    await workshopCommand({ session: '2026-01-01_120000' });

    const allOutput = ioWrites.join(' ');
    expect(allOutput).toContain('2026-01-01_120000');
  });

  it('shows session name in available sessions list when present', async () => {
    const namedSession: WorkshopSession = {
      sessionId: '2026-02-28_165120',
      schemaVersion: '1.0.0',
      createdAt: '2026-02-28T16:51:20Z',
      updatedAt: '2026-02-28T16:55:00Z',
      phase: 'Discover',
      status: 'Active',
      participants: [],
      artifacts: { generatedFiles: [] },
      turns: [],
      name: 'Inventory Insights',
    } as WorkshopSession;

    const unnamedSession: WorkshopSession = {
      sessionId: '2026-02-28_170457',
      schemaVersion: '1.0.0',
      createdAt: '2026-02-28T17:04:57Z',
      updatedAt: '2026-02-28T17:05:00Z',
      phase: 'Discover',
      status: 'Active',
      participants: [],
      artifacts: { generatedFiles: [] },
      turns: [],
    } as WorkshopSession;

    ioReadResponses = ['2', '1']; // Resume flow, choose first session
    mockStore.list.mockResolvedValue([namedSession.sessionId, unnamedSession.sessionId]);
    mockStore.load.mockImplementation(async (id: string) => {
      if (id === namedSession.sessionId) return namedSession;
      if (id === unnamedSession.sessionId) return unnamedSession;
      throw new Error('Unknown session');
    });

    const { workshopCommand } = await import('../../../src/cli/workshopCommand.js');
    await workshopCommand({});

    const allOutput = ioWrites.join(' ');
    expect(allOutput).toContain('Available sessions');
    expect(allOutput).toContain('Inventory Insights');
    expect(allOutput).toContain('2026-02-28_165120');
    expect(allOutput).toContain('2026-02-28_170457');
  });
});

// ── T052: Plan→Develop transition displays "sofia dev --session {id}" ─────

describe('workshopCommand Plan→Develop transition (T052)', () => {
  beforeEach(() => {
    ioWrites = [];
    ioReadResponses = [];
    ioReadIndex = 0;
    ioReadInputPrompts = [];
    decisionGateResponses = [];
    decisionGateIndex = 0;
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('displays "sofia dev --session {id}" after Plan phase completes (FR-020)', async () => {
    const session: WorkshopSession = {
      sessionId: 'plan-test-001',
      schemaVersion: '1.0.0',
      createdAt: '2026-01-01T12:00:00Z',
      updatedAt: '2026-01-01T12:30:00Z',
      phase: 'Plan',
      status: 'Active',
      participants: [],
      artifacts: { generatedFiles: [] },
      turns: [],
    };

    mockStore.exists.mockResolvedValue(true);
    mockStore.load.mockResolvedValue(session);

    // First gate (Plan): continue → triggers transition to Develop
    // Second gate (Develop): exit → stops the loop
    decisionGateResponses = [{ choice: 'continue' }, { choice: 'exit' }];

    const { workshopCommand } = await import('../../../src/cli/workshopCommand.js');
    await workshopCommand({ session: 'plan-test-001' });

    const allOutput = ioWrites.join(' ');
    expect(allOutput).toContain('sofia dev --session plan-test-001');
    expect(allOutput).toContain('Ready for PoC Generation');
  });
});

// ── T053: Workshop offers auto-transition prompt in interactive mode ──────

describe('workshopCommand auto-transition prompt (T053)', () => {
  beforeEach(() => {
    ioWrites = [];
    ioReadResponses = [];
    ioReadIndex = 0;
    ioReadInputPrompts = [];
    decisionGateResponses = [];
    decisionGateIndex = 0;
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('offers auto-transition prompt in interactive mode after Plan phase (FR-021)', async () => {
    const session: WorkshopSession = {
      sessionId: 'transition-test-001',
      schemaVersion: '1.0.0',
      createdAt: '2026-01-01T12:00:00Z',
      updatedAt: '2026-01-01T12:30:00Z',
      phase: 'Plan',
      status: 'Active',
      participants: [],
      artifacts: { generatedFiles: [] },
      turns: [],
    };

    mockStore.exists.mockResolvedValue(true);
    mockStore.load.mockResolvedValue(session);

    // Continue from Plan → Develop, then exit
    decisionGateResponses = [{ choice: 'continue' }, { choice: 'exit' }];

    const { workshopCommand } = await import('../../../src/cli/workshopCommand.js');
    await workshopCommand({ session: 'transition-test-001' });

    const allOutput = ioWrites.join(' ');
    // FR-021: The transition message includes tech stack info and scaffolding description
    expect(allOutput).toContain('scaffold a project');
    expect(allOutput).toContain('technology stack');
    expect(allOutput).toContain('install dependencies');

    // FR-021: readInput was called with the auto-transition prompt
    expect(ioReadInputPrompts.some((p) => p.includes('Would you like to start PoC development'))).toBe(true);
  });
});
