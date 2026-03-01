/**
 * T022: Unit tests for RalphLoop orchestrator.
 *
 * Verifies:
 * - Lifecycle (validate → scaffold → install → iterate)
 * - Termination on tests-passing
 * - Termination on max-iterations
 * - Iteration count tracking
 * - Session persistence callback called after each iteration
 * - Ctrl+C handling sets user-stopped
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { RalphLoop } from '../../../src/develop/ralphLoop.js';
import { PocScaffolder, validatePocOutput } from '../../../src/develop/pocScaffolder.js';
import { TestRunner } from '../../../src/develop/testRunner.js';
import { GitHubMcpAdapter } from '../../../src/develop/githubMcpAdapter.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';
import type { LoopIO } from '../../../src/loop/conversationLoop.js';
import type { CopilotClient } from '../../../src/shared/copilotClient.js';
import type { TestResults } from '../../../src/shared/schemas/session.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock npm install to always succeed
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args.includes('install')) {
        // Simulate successful npm install
        const emitter = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event: string, cb: (code: number) => void) => {
            if (event === 'close') cb(0);
          }),
          kill: vi.fn(),
          killed: false,
        };
        return emitter;
      }
      return actual.spawn(cmd, args);
    }),
  };
});

// Mock validatePocOutput — default: valid
vi.mock('../../../src/develop/pocScaffolder.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/develop/pocScaffolder.js')>();
  return {
    ...actual,
    validatePocOutput: vi.fn().mockResolvedValue({ valid: true, missingFiles: [], errors: [] }),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  const now = new Date().toISOString();
  return {
    sessionId: 'ralph-test-session',
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
        title: 'Test AI App',
        description: 'A test AI application.',
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
    showDecisionGate: vi.fn(),
    isJsonMode: false,
    isTTY: false,
  };
}

function makePassingClient(): CopilotClient {
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

function makePassingTestRunner(): TestRunner {
  return {
    run: vi.fn().mockResolvedValue({
      passed: 2,
      failed: 0,
      skipped: 0,
      total: 2,
      durationMs: 300,
      failures: [],
      rawOutput: 'All tests pass',
    } satisfies TestResults),
  } as unknown as TestRunner;
}

function _makeFailingTestRunner(failCount = 1): TestRunner {
  let callCount = 0;
  return {
    run: vi.fn().mockImplementation(async (): Promise<TestResults> => {
      callCount++;
      if (callCount > failCount) {
        return {
          passed: 2,
          failed: 0,
          skipped: 0,
          total: 2,
          durationMs: 300,
          failures: [],
          rawOutput: 'All pass',
        };
      }
      return {
        passed: 0,
        failed: 1,
        skipped: 0,
        total: 1,
        durationMs: 400,
        failures: [{ testName: 'suite > test A', message: 'Expected 1 but got 0' }],
        rawOutput: 'FAIL tests/index.test.ts',
      };
    }),
  } as unknown as TestRunner;
}

function makeAlwaysFailingTestRunner(): TestRunner {
  return {
    run: vi.fn().mockResolvedValue({
      passed: 0,
      failed: 1,
      skipped: 0,
      total: 1,
      durationMs: 400,
      failures: [{ testName: 'suite > always fail', message: 'always fails' }],
      rawOutput: 'FAIL',
    } satisfies TestResults),
  } as unknown as TestRunner;
}

function makeFakeScaffolder(outputDir: string): PocScaffolder {
  return {
    scaffold: vi.fn().mockImplementation(async () => {
      // Create minimal required files
      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(join(outputDir, 'src'), { recursive: true });
      await mkdir(join(outputDir, 'tests'), { recursive: true });
      await writeFile(
        join(outputDir, 'package.json'),
        JSON.stringify({
          name: 'test-poc',
          scripts: { test: 'vitest run' },
          dependencies: {},
          devDependencies: {},
        }),
        'utf-8',
      );
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
          sessionId: 'ralph-test-session',
          outputDir,
        },
      };
    }),
    getTemplateFiles: () => ['package.json', 'src/index.ts'],
  } as unknown as PocScaffolder;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RalphLoop', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-ralph-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('throws when session has no selection', async () => {
      const session = makeSession({ selection: undefined });
      const io = makeIo();
      const client = makePassingClient();

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 1,
      });

      await expect(ralph.run()).rejects.toThrow(/selection/i);
    });

    it('throws when session has no plan', async () => {
      const session = makeSession({ plan: undefined });
      const io = makeIo();
      const client = makePassingClient();

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 1,
      });

      await expect(ralph.run()).rejects.toThrow(/plan/i);
    });
  });

  describe('lifecycle with passing tests', () => {
    it('terminates with tests-passing when all tests pass immediately', async () => {
      const session = makeSession();
      const io = makeIo();
      const client = makePassingClient();
      const testRunner = makePassingTestRunner();
      const scaffolder = makeFakeScaffolder(tmpDir);

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 5,
        testRunner,
        scaffolder,
      });

      const result = await ralph.run();

      expect(result.finalStatus).toBe('success');
      expect(result.terminationReason).toBe('tests-passing');
    });

    it('tracks iteration count', async () => {
      const session = makeSession();
      const io = makeIo();
      const client = makePassingClient();
      const testRunner = makePassingTestRunner();
      const scaffolder = makeFakeScaffolder(tmpDir);

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 5,
        testRunner,
        scaffolder,
      });

      const result = await ralph.run();

      // Iteration 1 (scaffold) + Iteration 2 (test run, passing)
      expect(result.iterationsCompleted).toBeGreaterThanOrEqual(2);
    });

    it('calls onSessionUpdate after each iteration', async () => {
      const session = makeSession();
      const io = makeIo();
      const client = makePassingClient();
      const testRunner = makePassingTestRunner();
      const scaffolder = makeFakeScaffolder(tmpDir);
      const onSessionUpdate = vi.fn().mockResolvedValue(undefined);

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 3,
        testRunner,
        scaffolder,
        onSessionUpdate,
      });

      await ralph.run();

      // Should be called at least once (after scaffold, after passing tests)
      expect(onSessionUpdate).toHaveBeenCalled();
    });

    it('returns updated session with poc state', async () => {
      const session = makeSession();
      const io = makeIo();
      const client = makePassingClient();
      const testRunner = makePassingTestRunner();
      const scaffolder = makeFakeScaffolder(tmpDir);

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 5,
        testRunner,
        scaffolder,
      });

      const result = await ralph.run();

      expect(result.session.poc).toBeDefined();
      expect(result.session.poc!.iterations.length).toBeGreaterThan(0);
      expect(result.session.poc!.iterations[0].outcome).toBe('scaffold');
      expect(result.session.poc!.finalStatus).toBe('success');
    });
  });

  describe('termination on max-iterations', () => {
    it('terminates with max-iterations when all tests keep failing', async () => {
      const session = makeSession();
      const io = makeIo();
      const client = makePassingClient();
      const testRunner = makeAlwaysFailingTestRunner();
      const scaffolder = makeFakeScaffolder(tmpDir);

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 3,
        testRunner,
        scaffolder,
      });

      const result = await ralph.run();

      expect(result.terminationReason).toBe('max-iterations');
      expect(result.iterationsCompleted).toBe(3); // 1 scaffold + 2 test iterations
    });

    it('sets finalStatus=partial when some tests pass at max-iterations', async () => {
      const session = makeSession();
      const io = makeIo();
      const client = makePassingClient();

      // Partially passing test runner
      const testRunner: TestRunner = {
        run: vi.fn().mockResolvedValue({
          passed: 1,
          failed: 1,
          skipped: 0,
          total: 2,
          durationMs: 400,
          failures: [{ testName: 'test B', message: 'fails' }],
          rawOutput: '',
        } satisfies TestResults),
      } as unknown as TestRunner;

      const scaffolder = makeFakeScaffolder(tmpDir);

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 2,
        testRunner,
        scaffolder,
      });

      const result = await ralph.run();

      expect(result.terminationReason).toBe('max-iterations');
      expect(result.finalStatus).toBe('partial');
    });

    it('sets finalStatus=failed when no tests pass at max-iterations', async () => {
      const session = makeSession();
      const io = makeIo();
      const client = makePassingClient();
      const testRunner = makeAlwaysFailingTestRunner();
      const scaffolder = makeFakeScaffolder(tmpDir);

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 2,
        testRunner,
        scaffolder,
      });

      const result = await ralph.run();

      expect(result.terminationReason).toBe('max-iterations');
      expect(result.finalStatus).toBe('failed');
    });
  });

  describe('event emission', () => {
    it('emits events during loop lifecycle', async () => {
      const session = makeSession();
      const io = makeIo();
      const client = makePassingClient();
      const testRunner = makePassingTestRunner();
      const scaffolder = makeFakeScaffolder(tmpDir);
      const events: string[] = [];

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 3,
        testRunner,
        scaffolder,
        onEvent: (e) => events.push(e.type),
      });

      await ralph.run();

      expect(events).toContain('Activity');
    });
  });

  describe('output directory', () => {
    it('returns outputDir in result', async () => {
      const session = makeSession();
      const io = makeIo();
      const client = makePassingClient();
      const testRunner = makePassingTestRunner();
      const scaffolder = makeFakeScaffolder(tmpDir);

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 3,
        testRunner,
        scaffolder,
      });

      const result = await ralph.run();
      expect(result.outputDir).toBe(tmpDir);
    });
  });

  describe('final test run after max iterations (F006)', () => {
    it('runs a final test after the last LLM iteration and returns success when tests pass', async () => {
      const session = makeSession();
      const io = makeIo();
      const client = makePassingClient();
      const scaffolder = makeFakeScaffolder(tmpDir);

      // First test run fails, second (final run after loop) passes
      let runCount = 0;
      const testRunner: TestRunner = {
        run: vi.fn().mockImplementation(async (): Promise<TestResults> => {
          runCount++;
          if (runCount <= 1) {
            return {
              passed: 0,
              failed: 1,
              skipped: 0,
              total: 1,
              durationMs: 100,
              failures: [{ testName: 'test A', message: 'fails' }],
              rawOutput: 'FAIL',
            };
          }
          return {
            passed: 1,
            failed: 0,
            skipped: 0,
            total: 1,
            durationMs: 100,
            failures: [],
            rawOutput: 'PASS',
          };
        }),
      } as unknown as TestRunner;

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 2, // scaffold + 1 iterate = 2 iterations, then final test
        testRunner,
        scaffolder,
      });

      const result = await ralph.run();

      // The final test run detected the fix, so status should be success
      expect(result.finalStatus).toBe('success');
      expect(result.terminationReason).toBe('tests-passing');
    });
  });

  describe('SIGINT handler stale session (F009)', () => {
    it('persists latest session with iteration data when SIGINT fires after iterations', async () => {
      const session = makeSession();
      const io = makeIo();
      const client = makePassingClient();
      const scaffolder = makeFakeScaffolder(tmpDir);
      let persistedSession: WorkshopSession | null = null;

      // Slow test runner: yields after first call so SIGINT can fire
      let runCount = 0;
      const testRunner: TestRunner = {
        run: vi.fn().mockImplementation(async (): Promise<TestResults> => {
          runCount++;
          // After first iteration completes, delay so SIGINT can fire
          if (runCount >= 2) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          return {
            passed: 0,
            failed: 1,
            skipped: 0,
            total: 1,
            durationMs: 100,
            failures: [{ testName: 'test A', message: 'fails' }],
            rawOutput: 'FAIL',
          };
        }),
      } as unknown as TestRunner;

      const onSessionUpdate = vi.fn().mockImplementation(async (s: WorkshopSession) => {
        persistedSession = s;
      });

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 10,
        testRunner,
        scaffolder,
        onSessionUpdate,
      });

      // Start the loop, then fire SIGINT after enough time for first iteration
      const runPromise = ralph.run();

      // Wait for at least scaffold + first test run iteration
      await new Promise((resolve) => setTimeout(resolve, 300));
      process.emit('SIGINT', 'SIGINT');

      const result = await runPromise;

      expect(result.terminationReason).toBe('user-stopped');
      // The persisted session should have iteration data from completed iterations
      expect(persistedSession).not.toBeNull();
      expect(persistedSession!.poc).toBeDefined();
      expect(persistedSession!.poc!.iterations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('user-stopped status (F011)', () => {
    it('returns finalStatus=partial when user stops and some tests were passing', async () => {
      const session = makeSession();
      const io = makeIo();
      const client = makePassingClient();
      const scaffolder = makeFakeScaffolder(tmpDir);

      // Partially passing test runner that delays so SIGINT can fire
      let runCount = 0;
      const testRunner: TestRunner = {
        run: vi.fn().mockImplementation(async (): Promise<TestResults> => {
          runCount++;
          if (runCount >= 2) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          return {
            passed: 1,
            failed: 1,
            skipped: 0,
            total: 2,
            durationMs: 100,
            failures: [{ testName: 'test B', message: 'fails' }],
            rawOutput: 'PARTIAL',
          };
        }),
      } as unknown as TestRunner;

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 10,
        testRunner,
        scaffolder,
      });

      const runPromise = ralph.run();

      await new Promise((resolve) => setTimeout(resolve, 300));
      process.emit('SIGINT', 'SIGINT');

      const result = await runPromise;

      expect(result.terminationReason).toBe('user-stopped');
      expect(result.finalStatus).toBe('partial');
    });
  });

  describe('GitHub MCP adapter integration', () => {
    it('reads written files from disk and passes their content to pushFiles', async () => {
      const session = makeSession();
      const io = makeIo();

      // LLM returns a file with known content
      const knownContent = 'export function main() { return "hello"; }\n';
      const client: CopilotClient = {
        createSession: vi.fn().mockResolvedValue({
          send: vi.fn().mockReturnValue({
            async *[Symbol.asyncIterator]() {
              yield {
                type: 'TextDelta',
                text: `\`\`\`typescript file=src/index.ts\n${knownContent}\`\`\``,
                timestamp: '',
              };
            },
          }),
          getHistory: () => [],
        }),
      };

      // Fail on first run so the LLM turn (and pushFiles) is reached; pass on second
      let runCount = 0;
      const testRunner: TestRunner = {
        run: vi.fn().mockImplementation(async (): Promise<TestResults> => {
          runCount++;
          if (runCount === 1) {
            return {
              passed: 0,
              failed: 1,
              skipped: 0,
              total: 1,
              durationMs: 100,
              failures: [{ testName: 'main > works', message: 'not implemented' }],
              rawOutput: 'FAIL',
            };
          }
          return {
            passed: 1,
            failed: 0,
            skipped: 0,
            total: 1,
            durationMs: 100,
            failures: [],
            rawOutput: 'OK',
          };
        }),
      } as unknown as TestRunner;

      const scaffolder = makeFakeScaffolder(tmpDir);

      // Create a mock GitHub adapter that captures pushFiles calls
      const pushFilesMock = vi.fn().mockResolvedValue({ available: true, commitSha: 'abc123' });
      const githubAdapter = {
        isAvailable: () => true,
        getRepoUrl: () => 'https://github.com/acme/poc-test',
        pushFiles: pushFilesMock,
        createRepository: vi
          .fn()
          .mockResolvedValue({
            available: true,
            repoUrl: 'https://github.com/acme/poc-test',
            repoName: 'poc-test',
          }),
      } as unknown as GitHubMcpAdapter;

      const ralph = new RalphLoop({
        client,
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 5,
        testRunner,
        scaffolder,
        githubAdapter,
      });

      await ralph.run();

      // pushFiles should have been called with the real file content written by applyChanges
      expect(pushFilesMock).toHaveBeenCalled();
      const callArgs = pushFilesMock.mock.calls[0][0] as {
        files: Array<{ path: string; content: string }>;
      };
      const pushedFile = callArgs.files.find((f) => f.path === 'src/index.ts');
      expect(pushedFile).toBeDefined();
      expect(pushedFile!.content).toBe(knownContent);
      expect(pushedFile!.content).not.toBe('');
    });
  });

  describe('validatePocOutput integration (F027)', () => {
    it('downgrades success to partial when validatePocOutput reports missing files', async () => {
      // Mock validatePocOutput to fail
      vi.mocked(validatePocOutput).mockResolvedValueOnce({
        valid: false,
        missingFiles: ['README.md'],
        errors: [],
      });

      const session = makeSession();
      const io = makeIo();
      const testRunner = {
        run: vi.fn().mockResolvedValue({
          passed: 3,
          failed: 0,
          skipped: 0,
          total: 3,
          durationMs: 100,
          failures: [],
          rawOutput: 'ALL PASS',
        }),
      } as unknown as TestRunner;

      const ralph = new RalphLoop({
        client: makePassingClient(),
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 5,
        testRunner,
        scaffolder: makeFakeScaffolder(tmpDir),
      });

      const result = await ralph.run();

      expect(result.finalStatus).toBe('partial');
      expect(result.terminationReason).toBe('tests-passing');
      // validatePocOutput should have been called
      expect(validatePocOutput).toHaveBeenCalledWith(tmpDir);
    });

    it('keeps success when validatePocOutput reports valid', async () => {
      vi.mocked(validatePocOutput).mockResolvedValueOnce({
        valid: true,
        missingFiles: [],
        errors: [],
      });

      const session = makeSession();
      const io = makeIo();
      const testRunner = {
        run: vi.fn().mockResolvedValue({
          passed: 3,
          failed: 0,
          skipped: 0,
          total: 3,
          durationMs: 100,
          failures: [],
          rawOutput: 'ALL PASS',
        }),
      } as unknown as TestRunner;

      const ralph = new RalphLoop({
        client: makePassingClient(),
        io,
        session,
        outputDir: tmpDir,
        maxIterations: 5,
        testRunner,
        scaffolder: makeFakeScaffolder(tmpDir),
      });

      const result = await ralph.run();

      expect(result.finalStatus).toBe('success');
      expect(validatePocOutput).toHaveBeenCalledWith(tmpDir);
    });
  });
});
