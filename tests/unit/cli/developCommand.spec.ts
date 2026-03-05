/**
 * T014: Unit tests for developCommand.
 *
 * Verifies:
 * - Session validation (rejects sessions without selection/plan)
 * - --session, --max-iterations, --output option parsing
 * - Error messages for invalid sessions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Mock RalphLoop so tests don't run the real loop
vi.mock('../../../src/develop/ralphLoop.js');

import { validateSessionForDevelop, developCommand } from '../../../src/cli/developCommand.js';
import { RalphLoop } from '../../../src/develop/ralphLoop.js';
import type { RalphLoopOptions, RalphLoopResult } from '../../../src/develop/ralphLoop.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';
import type { LoopIO } from '../../../src/loop/conversationLoop.js';
import type { CopilotClient } from '../../../src/shared/copilotClient.js';
import type { McpManager } from '../../../src/mcp/mcpManager.js';

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
          yield {
            type: 'TextDelta',
            text: '```typescript file=src/index.ts\nexport function main() { return "ok"; }\n```',
            timestamp: '',
          };
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

// ── McpManager wiring ─────────────────────────────────────────────────────────

describe('developCommand — MCP wiring', () => {
  let capturedOptions: RalphLoopOptions | undefined;
  let savedExitCode: number | undefined;

  beforeEach(() => {
    capturedOptions = undefined;
    savedExitCode = process.exitCode as number | undefined;
    process.exitCode = undefined;

    vi.mocked(RalphLoop).mockImplementation(function (options: RalphLoopOptions) {
      capturedOptions = options;
      const fakeResult: RalphLoopResult = {
        session: makeSession(),
        finalStatus: 'success',
        terminationReason: 'tests-passing',
        iterationsCompleted: 1,
        outputDir: '/tmp/poc-test',
      };
      return { run: vi.fn().mockResolvedValue(fakeResult) } as Partial<RalphLoop> as RalphLoop;
    });
  });

  afterEach(() => {
    process.exitCode = savedExitCode;
    capturedOptions = undefined;
    vi.mocked(RalphLoop).mockReset();
  });

  it('passes non-undefined enricher to RalphLoop when mcpManager provided', async () => {
    const io = makeIo();
    const client = makeFakeClient();
    const mockMcpManager: McpManager = {
      isAvailable: (name: string) => name === 'github',
      listServers: () => ['github'],
      getServerConfig: () => undefined,
      markConnected: vi.fn(),
      markDisconnected: vi.fn(),
      getAllConfigs: () => [],
    } as unknown as McpManager;

    const session = makeSession(); // valid — has both selection and plan
    const store = {
      load: vi.fn().mockResolvedValue(session),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue(['test-dev-session']),
    };

    await developCommand(
      { session: 'test-dev-session' },
      { store, io, client, mcpManager: mockMcpManager },
    );

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions?.enricher).toBeDefined();
  });

  it('passes undefined enricher to RalphLoop when no mcpManager provided', async () => {
    const io = makeIo();
    const client = makeFakeClient();

    const session = makeSession(); // valid
    const store = {
      load: vi.fn().mockResolvedValue(session),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue(['test-dev-session']),
    };

    await developCommand({ session: 'test-dev-session' }, { store, io, client });

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions?.enricher).toBeUndefined();
  });
});

// ── --force option ────────────────────────────────────────────────────────────

describe('developCommand — --force option', () => {
  let tmpDir: string;
  let relOutput: string;
  let _capturedOptions: RalphLoopOptions | undefined;
  let savedExitCode: number | undefined;

  beforeEach(() => {
    _capturedOptions = undefined;
    savedExitCode = process.exitCode as number | undefined;
    process.exitCode = undefined;
    relOutput = `tmp/sofia-dev-test-${Date.now()}`;
    tmpDir = join(process.cwd(), relOutput);

    vi.mocked(RalphLoop).mockImplementation(function (options: RalphLoopOptions) {
      _capturedOptions = options;
      const fakeResult: RalphLoopResult = {
        session: makeSession(),
        finalStatus: 'success',
        terminationReason: 'tests-passing',
        iterationsCompleted: 1,
        outputDir: options.outputDir ?? tmpDir,
      };
      return { run: vi.fn().mockResolvedValue(fakeResult) } as Partial<RalphLoop> as RalphLoop;
    });

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.exitCode = savedExitCode;
    _capturedOptions = undefined;
    vi.mocked(RalphLoop).mockReset();
    vi.restoreAllMocks();
    // Clean up temp dir
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('resumes from existing directory when --force is not set', async () => {
    // Create output directory with metadata matching the session
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, '.sofia-metadata.json'),
      JSON.stringify({ sessionId: 'test-dev-session' }),
    );

    const io = makeIo();
    const client = makeFakeClient();
    // Session with prior iterations to trigger resume
    const session = makeSession({
      poc: {
        repoSource: 'local',
        repoPath: tmpDir,
        iterations: [
          {
            iteration: 1,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'scaffold',
            filesChanged: [],
          },
        ],
      },
    });
    const store = {
      load: vi.fn().mockResolvedValue(session),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue(['test-dev-session']),
    };

    await developCommand({ session: 'test-dev-session', output: relOutput }, { store, io, client });

    // Should have called writeActivity with "Resuming" message
    expect(io.writeActivity).toHaveBeenCalledWith(expect.stringContaining('Resuming'));
    // Directory should still exist
    expect(existsSync(tmpDir)).toBe(true);
    expect(existsSync(join(tmpDir, '.sofia-metadata.json'))).toBe(true);
  });

  it('clears directory when --force is set', async () => {
    // Create output directory with some files
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, '.sofia-metadata.json'), JSON.stringify({ scaffold: true }));
    writeFileSync(join(tmpDir, 'old-file.ts'), 'old code');

    const io = makeIo();
    const client = makeFakeClient();
    const session = makeSession();
    const store = {
      load: vi.fn().mockResolvedValue(session),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue(['test-dev-session']),
    };

    await developCommand(
      { session: 'test-dev-session', output: relOutput, force: true },
      { store, io, client },
    );

    // Should have called writeActivity with "Cleared" message
    expect(io.writeActivity).toHaveBeenCalledWith(expect.stringContaining('Cleared'));
    // Old file was removed (RalphLoop mock doesn't recreate it)
    expect(existsSync(join(tmpDir, 'old-file.ts'))).toBe(false);
  });

  it('--force clears session.poc and calls store.save() before creating RalphLoop (T027, FR-008)', async () => {
    const io = makeIo();
    const client = makeFakeClient();
    const session = makeSession({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 1,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'scaffold',
            filesChanged: [],
          },
        ],
        finalStatus: 'failed',
      },
    });
    const store = {
      load: vi.fn().mockResolvedValue(session),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue(['test-dev-session']),
    };

    await developCommand(
      { session: 'test-dev-session', output: relOutput, force: true },
      { store, io, client },
    );

    // store.save should have been called with poc cleared
    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({ poc: undefined }),
    );
  });

  it('--force on a success session clears status and starts fresh (T028, FR-010)', async () => {
    const io = makeIo();
    const client = makeFakeClient();
    const session = makeSession({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 1,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'tests-passing',
            filesChanged: [],
            testResults: {
              passed: 2,
              failed: 0,
              skipped: 0,
              total: 2,
              durationMs: 100,
              failures: [],
            },
          },
        ],
        finalStatus: 'success',
      },
    });
    const store = {
      load: vi.fn().mockResolvedValue(session),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue(['test-dev-session']),
    };

    await developCommand(
      { session: 'test-dev-session', output: relOutput, force: true },
      { store, io, client },
    );

    // Should have cleared poc before running loop
    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({ poc: undefined }),
    );
    // RalphLoop should have been constructed and run
    expect(RalphLoop).toHaveBeenCalled();
  });

  it('--force on a session with no prior poc behaves identically to first run (T029)', async () => {
    const io = makeIo();
    const client = makeFakeClient();
    const session = makeSession(); // No poc
    const store = {
      load: vi.fn().mockResolvedValue(session),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue(['test-dev-session']),
    };

    await developCommand(
      { session: 'test-dev-session', output: relOutput, force: true },
      { store, io, client },
    );

    // store.save should have been called (poc was already undefined)
    expect(store.save).toHaveBeenCalled();
    // RalphLoop should have been created
    expect(RalphLoop).toHaveBeenCalled();
  });
});

// ── Resume behavior (US1) ─────────────────────────────────────────────────

describe('developCommand — resume behavior', () => {
  let savedExitCode: number | undefined;

  beforeEach(() => {
    savedExitCode = process.exitCode as number | undefined;
    process.exitCode = undefined;

    vi.mocked(RalphLoop).mockImplementation(function (options: RalphLoopOptions) {
      const fakeResult: RalphLoopResult = {
        session: makeSession(),
        finalStatus: 'success',
        terminationReason: 'tests-passing',
        iterationsCompleted: 1,
        outputDir: options.outputDir ?? '/tmp/poc-test',
      };
      return { run: vi.fn().mockResolvedValue(fakeResult) } as Partial<RalphLoop> as RalphLoop;
    });

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.exitCode = savedExitCode;
    vi.mocked(RalphLoop).mockReset();
    vi.restoreAllMocks();
  });

  it('exits with completion message when poc.finalStatus is success (T016, FR-005)', async () => {
    const io = makeIo();
    const client = makeFakeClient();
    const session = makeSession({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 1,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'tests-passing',
            filesChanged: [],
            testResults: {
              passed: 2,
              failed: 0,
              skipped: 0,
              total: 2,
              durationMs: 100,
              failures: [],
            },
          },
        ],
        finalStatus: 'success',
      },
    });
    const store = {
      load: vi.fn().mockResolvedValue(session),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue(['test-dev-session']),
    };

    await developCommand({ session: 'test-dev-session' }, { store, io, client });

    // Should NOT have created a RalphLoop
    expect(RalphLoop).not.toHaveBeenCalled();
    // Should have displayed completion message
    expect(io.writeActivity).toHaveBeenCalledWith(
      expect.stringContaining('already complete'),
    );
  });

  it('defaults to resume when poc.finalStatus is failed (T017, FR-006)', async () => {
    const io = makeIo();
    const client = makeFakeClient();
    const session = makeSession({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 1,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'scaffold',
            filesChanged: [],
          },
        ],
        finalStatus: 'failed',
      },
    });
    const store = {
      load: vi.fn().mockResolvedValue(session),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue(['test-dev-session']),
    };

    await developCommand({ session: 'test-dev-session' }, { store, io, client });

    // Should have displayed resume message
    expect(io.writeActivity).toHaveBeenCalledWith(
      expect.stringContaining('Resuming session'),
    );
    // RalphLoop should have been created
    expect(RalphLoop).toHaveBeenCalled();
  });

  it('defaults to resume when poc.finalStatus is partial (T017, FR-006)', async () => {
    const io = makeIo();
    const client = makeFakeClient();
    const session = makeSession({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 1,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'tests-failing',
            filesChanged: [],
            testResults: {
              passed: 1,
              failed: 1,
              skipped: 0,
              total: 2,
              durationMs: 100,
              failures: [{ testName: 'test1', message: 'fail' }],
            },
          },
        ],
        finalStatus: 'partial',
      },
    });
    const store = {
      load: vi.fn().mockResolvedValue(session),
      save: vi.fn(),
      list: vi.fn().mockResolvedValue(['test-dev-session']),
    };

    await developCommand({ session: 'test-dev-session' }, { store, io, client });

    expect(io.writeActivity).toHaveBeenCalledWith(
      expect.stringContaining('Resuming session'),
    );
    expect(RalphLoop).toHaveBeenCalled();
  });
});
