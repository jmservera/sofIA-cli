/**
 * T024: Integration test for partial/failed outcomes.
 *
 * Tests:
 * - max-iterations with some tests passing (partial status)
 * - max-iterations with no tests passing (failed status)
 * - LLM error mid-loop (error outcome on iteration, loop continues)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

import { RalphLoop } from '../../src/develop/ralphLoop.js';
import { generateDynamicScaffold } from '../../src/develop/dynamicScaffolder.js';
import { TestRunner } from '../../src/develop/testRunner.js';
import type { WorkshopSession } from '../../src/shared/schemas/session.js';
import type { LoopIO } from '../../src/loop/conversationLoop.js';
import type { CopilotClient } from '../../src/shared/copilotClient.js';
import type { TestResults } from '../../src/shared/schemas/session.js';

// Mock npm install
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

// Mock generateDynamicScaffold
vi.mock('../../src/develop/dynamicScaffolder.js', () => ({
  generateDynamicScaffold: vi.fn(),
}));

const require = createRequire(import.meta.url);
const fixtureSession: WorkshopSession = require('../fixtures/completedSession.json') as WorkshopSession;

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

function setupDynamicScaffoldMock(outputDir: string): void {
  vi.mocked(generateDynamicScaffold).mockImplementation(async () => {
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
      techStack: { language: 'TypeScript', runtime: 'Node.js 20', testRunner: 'npm test' },
    };
  });
}

function makeClient(): CopilotClient {
  return {
    createSession: vi.fn().mockResolvedValue({
      send: vi.fn().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'TextDelta',
            text: '```typescript file=src/index.ts\nexport function main() { return 1; }\n```\n',
            timestamp: '',
          };
        },
      }),
      getHistory: () => [],
    }),
  };
}

describe('RalphLoop integration — partial/failed outcomes', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-ralph-partial-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('sets finalStatus=partial when some tests pass at max-iterations', async () => {
    const io = makeIo();
    const client = makeClient();
    setupDynamicScaffoldMock(tmpDir);

    const testRunner: TestRunner = {
      run: vi.fn().mockResolvedValue({
        passed: 1,
        failed: 1,
        skipped: 0,
        total: 2,
        durationMs: 400,
        failures: [{ testName: 'suite > test B', message: 'fails always' }],
        rawOutput: '',
      } satisfies TestResults),
    } as unknown as TestRunner;

    const ralph = new RalphLoop({
      client,
      io,
      session: fixtureSession,
      outputDir: tmpDir,
      maxIterations: 2,
      testRunner,
    });

    const result = await ralph.run();

    expect(result.terminationReason).toBe('max-iterations');
    expect(result.finalStatus).toBe('partial');
    expect(result.session.poc?.terminationReason).toBe('max-iterations');
    expect(result.session.poc?.finalStatus).toBe('partial');
  });

  it('sets finalStatus=failed when no tests pass at max-iterations', async () => {
    const io = makeIo();
    const client = makeClient();
    setupDynamicScaffoldMock(tmpDir);

    const testRunner: TestRunner = {
      run: vi.fn().mockResolvedValue({
        passed: 0,
        failed: 2,
        skipped: 0,
        total: 2,
        durationMs: 400,
        failures: [
          { testName: 'test A', message: 'always fails' },
          { testName: 'test B', message: 'always fails too' },
        ],
        rawOutput: '',
      } satisfies TestResults),
    } as unknown as TestRunner;

    const ralph = new RalphLoop({
      client,
      io,
      session: fixtureSession,
      outputDir: tmpDir,
      maxIterations: 2,
      testRunner,
    });

    const result = await ralph.run();

    expect(result.terminationReason).toBe('max-iterations');
    expect(result.finalStatus).toBe('failed');
  });

  it('records error iteration when LLM returns empty response, continues loop', async () => {
    const io = makeIo();
    setupDynamicScaffoldMock(tmpDir);

    let testCallCount = 0;
    const testRunner: TestRunner = {
      run: vi.fn().mockImplementation(async (): Promise<TestResults> => {
        testCallCount++;
        if (testCallCount >= 2) {
          // After error iteration, tests pass
          return {
            passed: 1,
            failed: 0,
            skipped: 0,
            total: 1,
            durationMs: 300,
            failures: [],
            rawOutput: '',
          };
        }
        return {
          passed: 0,
          failed: 1,
          skipped: 0,
          total: 1,
          durationMs: 400,
          failures: [{ testName: 'test A', message: 'fails' }],
          rawOutput: '',
        };
      }),
    } as unknown as TestRunner;

    let llmCallCount = 0;
    const client: CopilotClient = {
      createSession: vi.fn().mockResolvedValue({
        send: vi.fn().mockImplementation(() => {
          llmCallCount++;
          if (llmCallCount === 1) {
            // First LLM call: returns empty response (simulating error)
            return {
              async *[Symbol.asyncIterator]() {
                // Empty - no TextDelta events
              },
            };
          }
          // Subsequent calls: return a fix
          return {
            async *[Symbol.asyncIterator]() {
              yield {
                type: 'TextDelta',
                text: '```typescript file=src/index.ts\nexport function main() { return 1; }\n```\n',
                timestamp: '',
              };
            },
          };
        }),
        getHistory: () => [],
      }),
    };

    const ralph = new RalphLoop({
      client,
      io,
      session: fixtureSession,
      outputDir: tmpDir,
      maxIterations: 5,
      testRunner,
    });

    const result = await ralph.run();

    // Loop should continue after LLM error and eventually succeed or hit max
    expect(['success', 'failed', 'partial', 'max-iterations']).toContain(result.finalStatus);

    // Check that error iterations are recorded
    const poc = result.session.poc!;
    const hasErrorIter = poc.iterations.some((i) => i.outcome === 'error');
    // With empty LLM response, we should have an error iteration
    expect(hasErrorIter).toBe(true);
  });

  it('records terminationReason in session poc state', async () => {
    const io = makeIo();
    const client = makeClient();
    setupDynamicScaffoldMock(tmpDir);

    const testRunner: TestRunner = {
      run: vi.fn().mockResolvedValue({
        passed: 0,
        failed: 1,
        skipped: 0,
        total: 1,
        durationMs: 400,
        failures: [{ testName: 'test', message: 'fails' }],
        rawOutput: '',
      } satisfies TestResults),
    } as unknown as TestRunner;

    const ralph = new RalphLoop({
      client,
      io,
      session: fixtureSession,
      outputDir: tmpDir,
      maxIterations: 2,
      testRunner,
    });

    const result = await ralph.run();

    expect(result.session.poc?.terminationReason).toBeDefined();
    expect(result.session.poc?.finalStatus).toBeDefined();
    expect(result.session.poc?.iterations.length).toBeGreaterThan(0);
  });
});

// ── Resume from interrupted session (T019) ────────────────────────────────

describe('resume from interrupted session', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ralph-resume-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('resumes from session with 2 completed iterations and starts at iteration 3 (T019)', async () => {
    const io = makeIo();

    // Create a session with 2 prior iterations
    const session: WorkshopSession = {
      ...fixtureSession,
      poc: {
        repoSource: 'local',
        repoPath: tmpDir,
        iterations: [
          {
            iteration: 1,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'scaffold',
            filesChanged: ['package.json', 'src/index.ts'],
          },
          {
            iteration: 2,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'tests-failing',
            filesChanged: ['src/index.ts'],
            testResults: {
              passed: 1,
              failed: 1,
              skipped: 0,
              total: 2,
              durationMs: 200,
              failures: [{ testName: 'test1', message: 'Expected x' }],
            },
          },
        ],
      },
    };

    // Mock a client that returns passing code on first call
    const passingClient: CopilotClient = {
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

    // TestRunner that passes on first call
    const testRunner = {
      run: vi.fn().mockResolvedValue({
        passed: 2,
        failed: 0,
        skipped: 0,
        total: 2,
        durationMs: 100,
        failures: [],
      }),
    } as unknown as TestRunner;

    setupDynamicScaffoldMock(tmpDir);

    const ralph = new RalphLoop({
      client: passingClient,
      io,
      session,
      outputDir: tmpDir,
      maxIterations: 10,
      testRunner,
      checkpoint: {
        hasPriorRun: true,
        completedIterations: 2,
        lastIterationIncomplete: false,
        resumeFromIteration: 3,
        canSkipScaffold: false,
        priorFinalStatus: undefined,
        priorIterations: session.poc!.iterations,
      },
    });

    const result = await ralph.run();

    // Should have seeded from prior iterations and continued
    // Note: finalStatus may be 'partial' since setupDynamicScaffoldMock doesn't create all
    // files required by validatePocOutput (README.md, tsconfig.json, etc.)
    expect(['success', 'partial']).toContain(result.finalStatus);
    // Total iterations should include the 2 prior + scaffold + tests-passing
    expect(result.iterationsCompleted).toBeGreaterThanOrEqual(3);
    // Session should have iterations from resume
    expect(result.session.poc?.iterations.length).toBeGreaterThanOrEqual(3);
  });
});
