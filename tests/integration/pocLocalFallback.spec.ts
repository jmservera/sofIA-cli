/**
 * T033: Integration test for local fallback flow.
 *
 * Mock McpManager to report GitHub unavailable;
 * run Ralph loop; verify repoSource: "local", repoPath set, no repoUrl;
 * verify log message explains fallback.
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
const fixtureSession: WorkshopSession =
  require('../fixtures/completedSession.json') as WorkshopSession;

function makeIo(): LoopIO & { activityMessages: string[] } {
  const activityMessages: string[] = [];
  return {
    activityMessages,
    write: vi.fn(),
    writeActivity: vi.fn((msg: string) => {
      activityMessages.push(msg);
    }),
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
    await writeFile(
      join(outputDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        scripts: { test: 'vitest run' },
        dependencies: {},
        devDependencies: {},
      }),
      'utf-8',
    );
    await writeFile(join(outputDir, 'src', 'index.ts'), 'export function main() {}', 'utf-8');
    return {
      createdFiles: ['package.json', 'src/index.ts'],
      techStack: { language: 'TypeScript', runtime: 'Node.js 20', testRunner: 'npm test' },
    };
  });
}

function makePassingClient(): CopilotClient {
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

function makePassingTestRunner(): TestRunner {
  return {
    run: vi.fn().mockResolvedValue({
      passed: 1,
      failed: 0,
      skipped: 0,
      total: 1,
      durationMs: 200,
      failures: [],
      rawOutput: '',
    } satisfies TestResults),
  } as unknown as TestRunner;
}

describe('RalphLoop — local fallback (T033)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-local-fallback-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('sets repoSource=local when GitHub MCP unavailable', async () => {
    const io = makeIo();
    const client = makePassingClient();
    const testRunner = makePassingTestRunner();
    setupDynamicScaffoldMock(tmpDir);

    const ralph = new RalphLoop({
      client,
      io,
      session: fixtureSession,
      outputDir: tmpDir,
      maxIterations: 3,
      testRunner,
    });

    const result = await ralph.run();

    expect(result.session.poc?.repoSource).toBe('local');
    expect(result.session.poc?.repoUrl).toBeUndefined();
    expect(result.session.poc?.repoPath).toBeDefined();
  });

  it('sets repoPath to outputDir when local', async () => {
    const io = makeIo();
    const client = makePassingClient();
    const testRunner = makePassingTestRunner();
    setupDynamicScaffoldMock(tmpDir);

    const ralph = new RalphLoop({
      client,
      io,
      session: fixtureSession,
      outputDir: tmpDir,
      maxIterations: 3,
      testRunner,
    });

    const result = await ralph.run();

    expect(result.session.poc?.repoPath).toBe(tmpDir);
  });

  it('logs fallback message when GitHub MCP unavailable', async () => {
    const io = makeIo();
    const client = makePassingClient();
    const testRunner = makePassingTestRunner();
    setupDynamicScaffoldMock(tmpDir);

    const ralph = new RalphLoop({
      client,
      io,
      session: fixtureSession,
      outputDir: tmpDir,
      maxIterations: 3,
      testRunner,
    });

    await ralph.run();

    // Should log message about local output
    const ioWithMessages = io as typeof io & { activityMessages: string[] };
    const fallbackMsg = ioWithMessages.activityMessages.find((m) =>
      m.toLowerCase().includes('local'),
    );
    expect(fallbackMsg).toBeDefined();
  });
});
