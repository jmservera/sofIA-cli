/**
 * T023: Integration test for Ralph loop with fakes.
 *
 * Uses a fake CopilotClient and fake test runner:
 * scaffold → fail tests → LLM generates fix → tests pass → loop terminates with success.
 * Verifies at least one iteration where failing test guides a fix (SC-002-003).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
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

const require = createRequire(import.meta.url);
const fixtureSession: WorkshopSession = require('../fixtures/completedSession.json') as WorkshopSession;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function makeFakeScaffolder(outputDir: string): PocScaffolder {
  return {
    scaffold: vi.fn().mockImplementation(async () => {
      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(join(outputDir, 'src'), { recursive: true });
      await mkdir(join(outputDir, 'tests'), { recursive: true });
      await writeFile(join(outputDir, 'package.json'), JSON.stringify({
        name: 'route-optimizer-poc',
        scripts: { test: 'vitest run' },
        dependencies: {},
        devDependencies: { vitest: '^3.0.0' },
      }), 'utf-8');
      await writeFile(join(outputDir, 'src', 'index.ts'),
        '// TODO: implement\nexport function optimize() { return []; }',
        'utf-8',
      );
      await writeFile(join(outputDir, 'tests', 'index.test.ts'),
        'import { describe, it, expect } from "vitest";\nimport { optimize } from "../src/index.js";\ndescribe("optimizer", () => { it("should return stops", () => { expect(optimize().length).toBeGreaterThan(0); }); });',
        'utf-8',
      );
      return {
        createdFiles: ['package.json', 'src/index.ts', 'tests/index.test.ts'],
        skippedFiles: [],
        context: {
          projectName: 'route-optimizer-poc',
          ideaTitle: 'AI-Powered Route Optimizer',
          ideaDescription: 'Optimize routes',
          techStack: { language: 'TypeScript', runtime: 'Node.js 20', testRunner: 'npm test' },
          planSummary: 'Route optimization',
          sessionId: fixtureSession.sessionId,
          outputDir,
        },
      };
    }),
    getTemplateFiles: () => ['package.json', 'src/index.ts', 'tests/index.test.ts'],
  } as unknown as PocScaffolder;
}

// ── SC-002-003: Iterative refinement test ────────────────────────────────────

describe('RalphLoop integration — iterative refinement (SC-002-003)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-ralph-flow-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('scaffold → fail tests → LLM fix → tests pass → success', async () => {
    const io = makeIo();
    const scaffolder = makeFakeScaffolder(tmpDir);

    // Test runner: fails first, passes second
    let testCallCount = 0;
    const testRunner: TestRunner = {
      run: vi.fn().mockImplementation(async (): Promise<TestResults> => {
        testCallCount++;
        if (testCallCount === 1) {
          // First run: fails
          return {
            passed: 0,
            failed: 1,
            skipped: 0,
            total: 1,
            durationMs: 400,
            failures: [
              {
                testName: 'optimizer > should return stops',
                message: 'Expected length to be greater than 0',
                file: 'tests/index.test.ts',
                line: 3,
              },
            ],
            rawOutput: 'FAIL tests/index.test.ts',
          };
        }
        // Subsequent runs: pass
        return {
          passed: 1,
          failed: 0,
          skipped: 0,
          total: 1,
          durationMs: 300,
          failures: [],
          rawOutput: 'PASS tests/index.test.ts',
        };
      }),
    } as unknown as TestRunner;

    // LLM response: generates a fix for the failing test
    const client: CopilotClient = {
      createSession: vi.fn().mockResolvedValue({
        send: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {
            yield {
              type: 'TextDelta',
              text: [
                '```typescript file=src/index.ts',
                '// Fixed implementation',
                'export function optimize(): string[] {',
                '  return ["stop-1", "stop-2", "stop-3"];',
                '}',
                '```',
              ].join('\n') + '\n',
              timestamp: '',
            };
          },
        }),
        getHistory: () => [],
      }),
    };

    const sessionUpdates: WorkshopSession[] = [];

    const ralph = new RalphLoop({
      client,
      io,
      session: fixtureSession,
      outputDir: tmpDir,
      maxIterations: 5,
      testRunner,
      scaffolder,
      onSessionUpdate: async (session) => {
        sessionUpdates.push({ ...session });
      },
    });

    const result = await ralph.run();

    // Loop should succeed
    expect(result.finalStatus).toBe('success');
    expect(result.terminationReason).toBe('tests-passing');

    // Verify at least 2 iterations happened (scaffold + test + fix + pass)
    expect(result.iterationsCompleted).toBeGreaterThanOrEqual(2);

    // Verify session was persisted
    expect(sessionUpdates.length).toBeGreaterThan(0);

    // Verify the fix was applied
    const fixedContent = await readFile(join(tmpDir, 'src', 'index.ts'), 'utf-8');
    expect(fixedContent).toContain('stop-1'); // LLM fix was applied

    // Verify iteration history
    const poc = result.session.poc!;
    expect(poc.iterations[0].outcome).toBe('scaffold');
    const lastIter = poc.iterations[poc.iterations.length - 1];
    expect(lastIter.outcome).toBe('tests-passing');
  });

  it('verifies failing tests are passed to LLM in iteration prompt (SC-002-003)', async () => {
    const io = makeIo();
    const scaffolder = makeFakeScaffolder(tmpDir);

    let testCallCount = 0;
    const testRunner: TestRunner = {
      run: vi.fn().mockImplementation(async (): Promise<TestResults> => {
        testCallCount++;
        if (testCallCount === 1) {
          return {
            passed: 0,
            failed: 1,
            skipped: 0,
            total: 1,
            durationMs: 400,
            failures: [{ testName: 'unique-failure-name', message: 'specific-error-message' }],
            rawOutput: '',
          };
        }
        return {
          passed: 1,
          failed: 0,
          skipped: 0,
          total: 1,
          durationMs: 300,
          failures: [],
          rawOutput: '',
        };
      }),
    } as unknown as TestRunner;

    // Capture the prompt sent to LLM
    let capturedPrompt = '';
    const client: CopilotClient = {
      createSession: vi.fn().mockResolvedValue({
        send: vi.fn().mockImplementation((msg: { content: string }) => {
          capturedPrompt = msg.content;
          return {
            async *[Symbol.asyncIterator]() {
              yield {
                type: 'TextDelta',
                text: '```typescript file=src/index.ts\nexport function optimize() { return [1]; }\n```\n',
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
      maxIterations: 3,
      testRunner,
      scaffolder,
    });

    await ralph.run();

    // Verify the LLM received the failure context
    expect(capturedPrompt).toContain('unique-failure-name');
    expect(capturedPrompt).toContain('specific-error-message');
  });
});
