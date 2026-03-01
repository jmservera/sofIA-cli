/**
 * T050: E2E failure/recovery test.
 *
 * Verifies graceful termination; verifies `finalStatus` is "failed" or "partial"
 * in session state; verifies `terminationReason: "max-iterations"`;
 * verifies user-facing output includes recovery guidance (Constitution VI compliance).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

import { RalphLoop } from '../../src/develop/ralphLoop.js';
import { PocScaffolder } from '../../src/develop/pocScaffolder.js';
import { TestRunner } from '../../src/develop/testRunner.js';
import type { WorkshopSession } from '../../src/shared/schemas/session.js';
import type { LoopIO } from '../../src/loop/conversationLoop.js';
import type { CopilotClient } from '../../src/shared/copilotClient.js';
import type { TestResults } from '../../src/shared/schemas/session.js';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args.includes('install')) {
        return {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event: string, cb: (code: number) => void) => {
            if (event === 'close') cb(0);
          }),
          kill: vi.fn(),
          killed: false,
        };
      }
      return actual.spawn(cmd, args);
    }),
  };
});

const require = createRequire(import.meta.url);
const fixtureSession: WorkshopSession = require('../fixtures/completedSession.json') as WorkshopSession;

describe('E2E: failure/recovery (T050)', () => {
  let tmpDir: string;
  let originalExitCode: number | undefined;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-e2e-failure-'));
    originalExitCode = process.exitCode as number | undefined;
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  function makeIo(): LoopIO & { writtenLines: string[]; activityLines: string[] } {
    const writtenLines: string[] = [];
    const activityLines: string[] = [];
    return {
      writtenLines,
      activityLines,
      write: vi.fn((text: string) => { writtenLines.push(text); }),
      writeActivity: vi.fn((text: string) => { activityLines.push(text); }),
      writeToolSummary: vi.fn(),
      readInput: vi.fn().mockResolvedValue(null),
      showDecisionGate: vi.fn(),
      isJsonMode: false,
      isTTY: false,
    };
  }

  function makeFakeScaffolder(outputDir: string): PocScaffolder {
    return {
      scaffold: vi.fn().mockImplementation(async () => {
        const { writeFile, mkdir } = await import('node:fs/promises');
        await mkdir(join(outputDir, 'src'), { recursive: true });
        await writeFile(join(outputDir, 'package.json'), JSON.stringify({
          name: 'test-poc',
          scripts: { test: 'vitest run' },
          dependencies: {},
          devDependencies: {},
        }), 'utf-8');
        await writeFile(join(outputDir, 'src', 'index.ts'), 'export function main() {}', 'utf-8');
        return {
          createdFiles: ['package.json', 'src/index.ts'],
          skippedFiles: [],
          context: {
            projectName: 'test-poc',
            ideaTitle: 'Test',
            ideaDescription: 'Test',
            techStack: { language: 'TypeScript', runtime: 'Node.js 20', testRunner: 'npm test' },
            planSummary: 'Test',
            sessionId: fixtureSession.sessionId,
            outputDir,
          },
        };
      }),
      getTemplateFiles: () => [],
    } as unknown as PocScaffolder;
  }

  function makeAlwaysFailingClient(): CopilotClient {
    return {
      createSession: vi.fn().mockResolvedValue({
        send: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            yield { type: 'TextDelta', text: '', timestamp: '' };
          },
        }),
        getHistory: () => [],
      }),
    };
  }

  function makeAlwaysFailingTestRunner(): TestRunner {
    return {
      run: vi.fn().mockResolvedValue({
        passed: 0,
        failed: 1,
        skipped: 0,
        total: 1,
        durationMs: 400,
        failures: [{ testName: 'test', message: 'always fails' }],
        rawOutput: '',
      } satisfies TestResults),
    } as unknown as TestRunner;
  }

  it('terminates with max-iterations when all tests keep failing', async () => {
    const io = makeIo();
    const scaffolder = makeFakeScaffolder(tmpDir);
    const client = makeAlwaysFailingClient();
    const testRunner = makeAlwaysFailingTestRunner();

    const ralph = new RalphLoop({
      client,
      io,
      session: fixtureSession,
      outputDir: tmpDir,
      maxIterations: 2,
      testRunner,
      scaffolder,
    });

    const result = await ralph.run();

    expect(result.terminationReason).toBe('max-iterations');
    expect(['failed', 'partial']).toContain(result.finalStatus);
  });

  it('verifies terminationReason=max-iterations in session state', async () => {
    const io = makeIo();
    const scaffolder = makeFakeScaffolder(tmpDir);
    const client = makeAlwaysFailingClient();
    const testRunner = makeAlwaysFailingTestRunner();

    const ralph = new RalphLoop({
      client,
      io,
      session: fixtureSession,
      outputDir: tmpDir,
      maxIterations: 2,
      testRunner,
      scaffolder,
    });

    const result = await ralph.run();
    expect(result.session.poc?.terminationReason).toBe('max-iterations');
    expect(result.session.poc?.finalStatus).toBeDefined();
  });

  it('session has iteration history after failed loop', async () => {
    const io = makeIo();
    const scaffolder = makeFakeScaffolder(tmpDir);
    const client = makeAlwaysFailingClient();
    const testRunner = makeAlwaysFailingTestRunner();

    const ralph = new RalphLoop({
      client,
      io,
      session: fixtureSession,
      outputDir: tmpDir,
      maxIterations: 2,
      testRunner,
      scaffolder,
    });

    const result = await ralph.run();

    // Should have at least scaffold iteration
    expect(result.session.poc?.iterations.length).toBeGreaterThan(0);
    expect(result.session.poc?.iterations[0].outcome).toBe('scaffold');
  });

  it('shows recovery guidance in non-JSON output for failed status (Constitution VI)', async () => {
    const { developCommand } = await import('../../src/cli/developCommand.js');

    const devIo = makeIo();
    const client = makeAlwaysFailingClient();

    const store = {
      load: vi.fn().mockResolvedValue(fixtureSession),
      save: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([fixtureSession.sessionId]),
    };

    // Mock RalphLoop.prototype.run to return failed immediately
    const originalRun = RalphLoop.prototype.run;
    const sessionWithFailedPoc: WorkshopSession = {
      ...fixtureSession,
      poc: {
        repoSource: 'local' as const,
        repoPath: tmpDir,
        iterations: [],
        finalStatus: 'failed' as const,
        terminationReason: 'max-iterations' as const,
      },
    };
    RalphLoop.prototype.run = vi.fn().mockResolvedValue({
      session: sessionWithFailedPoc,
      finalStatus: 'failed' as const,
      terminationReason: 'max-iterations' as const,
      iterationsCompleted: 2,
      outputDir: tmpDir,
    });

    try {
      await developCommand(
        { session: fixtureSession.sessionId, maxIterations: 1, output: tmpDir },
        { store, io: devIo, client },
      );
    } finally {
      RalphLoop.prototype.run = originalRun;
    }

    const allOutput = devIo.writtenLines.join('\n');
    // developCommand should show recovery guidance for non-success status
    expect(allOutput).toMatch(/resume|retry|force|more.*iter/i);
  });

  it('sets process.exitCode=1 when loop terminates with failed status', async () => {
    const { developCommand } = await import('../../src/cli/developCommand.js');
    const devIo = makeIo();
    const client = makeAlwaysFailingClient();

    const store = {
      load: vi.fn().mockResolvedValue(fixtureSession),
      save: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([fixtureSession.sessionId]),
    };

    const sessionWithFailedPoc: WorkshopSession = {
      ...fixtureSession,
      poc: {
        repoSource: 'local' as const,
        repoPath: tmpDir,
        iterations: [],
        finalStatus: 'failed' as const,
        terminationReason: 'max-iterations' as const,
      },
    };

    const originalRun = RalphLoop.prototype.run;
    RalphLoop.prototype.run = vi.fn().mockResolvedValue({
      session: sessionWithFailedPoc,
      finalStatus: 'failed' as const,
      terminationReason: 'max-iterations' as const,
      iterationsCompleted: 2,
      outputDir: tmpDir,
    });

    try {
      await developCommand(
        { session: fixtureSession.sessionId },
        { store, io: devIo, client },
      );
    } finally {
      RalphLoop.prototype.run = originalRun;
    }

    expect(process.exitCode).toBe(1);
  });
});
