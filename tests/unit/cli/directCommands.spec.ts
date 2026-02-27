/**
 * Unit tests for directCommands module (T052).
 *
 * Covers:
 * - Input validation (missing session, missing phase in non-interactive)
 * - Phase validation
 * - JSON error output format
 * - ioContext TTY/non-TTY detection
 * - JSON output separation (stdout vs stderr)
 * - Retry behavior and backoff
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable, Writable } from 'node:stream';

import type { LoopIO, DecisionGateResult } from '../../../src/loop/conversationLoop.js';
import { createFakeCopilotClient } from '../../../src/shared/copilotClient.js';
import type { WorkshopSession, PhaseValue } from '../../../src/shared/schemas/session.js';
import { SessionStore } from '../../../src/sessions/sessionStore.js';
import { runDirectCommand } from '../../../src/cli/directCommands.js';
import { createLoopIO } from '../../../src/cli/ioContext.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTestSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  const now = new Date().toISOString();
  return {
    sessionId: 'unit-direct-test',
    schemaVersion: '1.0.0',
    createdAt: now,
    updatedAt: now,
    phase: 'Discover',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    turns: [],
    ...overrides,
  };
}

function createTestIO(opts: {
  isTTY?: boolean;
  isJsonMode?: boolean;
  inputs?: (string | null)[];
  gateChoice?: DecisionGateResult;
} = {}): LoopIO & { output: string[]; activityLog: string[] } {
  let inputIdx = 0;
  const output: string[] = [];
  const activityLog: string[] = [];
  const inputs = opts.inputs ?? [null];
  const gateChoice = opts.gateChoice ?? { choice: 'exit' as const };

  return {
    write(text: string) { output.push(text); },
    writeActivity(text: string) { activityLog.push(text); },
    writeToolSummary(_toolName: string, _summary: string) {},
    async readInput(_prompt?: string): Promise<string | null> {
      if (inputIdx >= inputs.length) return null;
      return inputs[inputIdx++];
    },
    async showDecisionGate(_phase: PhaseValue): Promise<DecisionGateResult> {
      return gateChoice;
    },
    isJsonMode: opts.isJsonMode ?? false,
    isTTY: opts.isTTY ?? false,
    output,
    activityLog,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('directCommands validation', () => {
  let tmpDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-unit-dc-'));
    store = new SessionStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects undefined sessionId', async () => {
    const io = createTestIO();
    const client = createFakeCopilotClient([]);

    const result = await runDirectCommand({
      sessionId: undefined as unknown as string,
      phase: 'Discover',
      store, client, io,
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('session');
  });

  it('rejects empty sessionId', async () => {
    const io = createTestIO();
    const client = createFakeCopilotClient([]);

    const result = await runDirectCommand({
      sessionId: '',
      phase: 'Discover',
      store, client, io,
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('session');
  });

  it('rejects missing phase in non-interactive mode', async () => {
    const session = createTestSession();
    await store.save(session);
    const io = createTestIO();
    const client = createFakeCopilotClient([]);

    const result = await runDirectCommand({
      sessionId: session.sessionId,
      phase: undefined as unknown as PhaseValue,
      store, client, io,
      nonInteractive: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('phase');
  });

  it('rejects invalid phase name', async () => {
    const session = createTestSession();
    await store.save(session);
    const io = createTestIO();
    const client = createFakeCopilotClient([]);

    const result = await runDirectCommand({
      sessionId: session.sessionId,
      phase: 'Brainstorm' as PhaseValue,
      store, client, io,
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('Invalid phase');
    expect(result.error).toContain('Brainstorm');
  });

  it('rejects nonexistent session', async () => {
    const io = createTestIO();
    const client = createFakeCopilotClient([]);

    const result = await runDirectCommand({
      sessionId: 'does-not-exist',
      phase: 'Discover',
      store, client, io,
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('not found');
  });
});

describe('directCommands JSON output', () => {
  let tmpDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-unit-dc-json-'));
    store = new SessionStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('emits error as JSON when json=true', async () => {
    const io = createTestIO({ isJsonMode: true });
    const client = createFakeCopilotClient([]);

    await runDirectCommand({
      sessionId: 'missing',
      phase: 'Discover',
      store, client, io,
      json: true,
    });

    const jsonLines = io.output.filter(l => {
      try { JSON.parse(l); return true; } catch { return false; }
    });
    expect(jsonLines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(jsonLines[0]);
    expect(parsed.error).toBeDefined();
    expect(typeof parsed.error).toBe('string');
    expect(parsed.error).toContain('not found');
  });

  it('emits result summary as JSON on success', async () => {
    const session = createTestSession();
    await store.save(session);
    const io = createTestIO({ isJsonMode: true, inputs: ['hello', null] });
    const client = createFakeCopilotClient([
      { role: 'assistant', content: 'I understand.' },
    ]);

    await runDirectCommand({
      sessionId: session.sessionId,
      phase: 'Discover',
      store, client, io,
      json: true,
    });

    // Should contain at least the result summary
    const jsonLines = io.output
      .filter(l => { try { const o = JSON.parse(l); return o.sessionId; } catch { return false; } });
    expect(jsonLines.length).toBeGreaterThan(0);
    const result = JSON.parse(jsonLines[0]);
    expect(result.sessionId).toBe(session.sessionId);
    expect(result.phase).toBe('Discover');
  });
});

describe('ioContext', () => {
  it('creates TTY IO when input stream has isTTY', () => {
    const input = new Readable({ read() {} }) as NodeJS.ReadableStream & { isTTY?: boolean };
    (input as NodeJS.ReadableStream & { isTTY?: boolean }).isTTY = true;
    const output = new Writable({ write(_c, _e, cb) { cb(); } });

    const io = createLoopIO({ input, output });
    expect(io.isTTY).toBe(true);
    expect(io.isJsonMode).toBe(false);
  });

  it('creates non-TTY IO when nonInteractive is true', () => {
    const input = new Readable({ read() {} }) as NodeJS.ReadableStream & { isTTY?: boolean };
    (input as NodeJS.ReadableStream & { isTTY?: boolean }).isTTY = true;
    const output = new Writable({ write(_c, _e, cb) { cb(); } });

    const io = createLoopIO({ input, output, nonInteractive: true });
    expect(io.isTTY).toBe(false);
  });

  it('sets isJsonMode when json option is true', () => {
    const io = createLoopIO({ json: true });
    expect(io.isJsonMode).toBe(true);
  });

  it('non-interactive readInput returns null', async () => {
    const io = createLoopIO({ nonInteractive: true });
    const result = await io.readInput('prompt: ');
    expect(result).toBeNull();
  });
});

describe('directCommands retry', () => {
  let tmpDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-unit-dc-retry-'));
    store = new SessionStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('does not retry non-recoverable errors', async () => {
    const session = createTestSession();
    await store.save(session);

    let callCount = 0;
    const client = createFakeCopilotClient([], {
      onChat: async () => {
        callCount++;
        // Auth errors are not recoverable
        const err = new Error('Unauthorized') as Error & { statusCode: number };
        err.statusCode = 401;
        throw err;
      },
    });

    const io = createTestIO({ inputs: ['test', 'test', 'test'] });

    await runDirectCommand({
      sessionId: session.sessionId,
      phase: 'Discover',
      store, client, io,
      retry: 3,
    });

    // Should only attempt once — auth errors are not retried
    expect(callCount).toBe(1);
  });

  it('logs retry activity messages', async () => {
    const session = createTestSession();
    await store.save(session);

    let callCount = 0;
    const client = createFakeCopilotClient([], {
      onChat: async () => {
        callCount++;
        if (callCount <= 1) {
          throw Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' });
        }
        return { role: 'assistant' as const, content: 'OK' };
      },
    });

    const io = createTestIO({ inputs: ['test', 'test', null] });

    await runDirectCommand({
      sessionId: session.sessionId,
      phase: 'Discover',
      store, client, io,
      retry: 2,
    });

    // Should have logged retry activity
    const retryLogs = io.activityLog.filter(l => l.includes('Retrying'));
    expect(retryLogs.length).toBeGreaterThan(0);
  });
});
