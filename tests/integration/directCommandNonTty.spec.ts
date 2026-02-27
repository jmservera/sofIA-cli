/**
 * Integration test: Direct command non-TTY mode (T046)
 *
 * Tests the direct command entrypoint in non-TTY / automation contexts.
 *
 * Verifies:
 * - Fails fast with non-zero exit code when --session is missing
 * - Fails fast when --phase is missing in non-interactive mode
 * - JSON-only stdout when --json specified (no human text leaks)
 * - Activity/telemetry goes to the activity log (stderr equivalent), not stdout
 * - Retry flag retries transient failures the specified number of times
 * - Actionable error messages in JSON format
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { LoopIO, DecisionGateResult } from '../../src/loop/conversationLoop.js';
import { createFakeCopilotClient } from '../../src/shared/copilotClient.js';
import type { WorkshopSession, PhaseValue } from '../../src/shared/schemas/session.js';
import { SessionStore } from '../../src/sessions/sessionStore.js';
import {
  runDirectCommand,
} from '../../src/cli/directCommands.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTestSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  const now = new Date().toISOString();
  return {
    sessionId: 'test-direct-nontty',
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

function createNonTtyIO(
  decisionGateChoice: DecisionGateResult = { choice: 'continue' },
  inputs: (string | null)[] = [null],
): LoopIO & { output: string[]; activityLog: string[] } {
  let inputIdx = 0;
  const output: string[] = [];
  const activityLog: string[] = [];

  return {
    write(text: string) { output.push(text); },
    writeActivity(text: string) { activityLog.push(text); },
    async readInput(_prompt?: string): Promise<string | null> {
      if (inputIdx >= inputs.length) return null;
      return inputs[inputIdx++];
    },
    async showDecisionGate(_phase: PhaseValue): Promise<DecisionGateResult> {
      return decisionGateChoice;
    },
    isJsonMode: true,
    isTTY: false,
    output,
    activityLog,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Direct command non-TTY mode', () => {
  let tmpDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-direct-nontty-'));
    store = new SessionStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('fails with exit code 1 when session is missing', async () => {
    const io = createNonTtyIO();
    const client = createFakeCopilotClient([]);

    const result = await runDirectCommand({
      sessionId: undefined as unknown as string,
      phase: 'Discover',
      store,
      client,
      io,
      nonInteractive: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('session');
  });

  it('fails with exit code 1 when phase is missing in non-interactive mode', async () => {
    const session = createTestSession();
    await store.save(session);
    const io = createNonTtyIO();
    const client = createFakeCopilotClient([]);

    const result = await runDirectCommand({
      sessionId: session.sessionId,
      phase: undefined as unknown as PhaseValue,
      store,
      client,
      io,
      nonInteractive: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('phase');
  });

  it('outputs JSON-only on stdout with --json', async () => {
    const session = createTestSession({ phase: 'Discover' });
    await store.save(session);

    const io = createNonTtyIO({ choice: 'exit' });
    const client = createFakeCopilotClient([
      { role: 'assistant', content: '{"businessContext": {"company": "Test Corp"}}' },
    ]);

    await runDirectCommand({
      sessionId: session.sessionId,
      phase: 'Discover',
      store,
      client,
      io,
      json: true,
    });

    // All stdout output should be valid JSON lines
    for (const line of io.output.filter(l => l.trim())) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('sends activity to activityLog, not stdout', async () => {
    const session = createTestSession({ phase: 'Discover' });
    await store.save(session);

    const io = createNonTtyIO({ choice: 'exit' });
    const client = createFakeCopilotClient([
      { role: 'assistant', content: 'Analyzing your business context.' },
    ]);

    await runDirectCommand({
      sessionId: session.sessionId,
      phase: 'Discover',
      store,
      client,
      io,
      json: true,
      debug: true,
    });

    // Output should not contain activity markers
    const stdoutText = io.output.join('');
    expect(stdoutText).not.toContain('[activity]');
  });

  it('returns actionable error as JSON', async () => {
    const io = createNonTtyIO();
    const client = createFakeCopilotClient([]);

    const result = await runDirectCommand({
      sessionId: 'missing-session',
      phase: 'Discover',
      store,
      client,
      io,
      json: true,
      nonInteractive: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toBeDefined();
    // When json mode, the IO output should have JSON error
    const jsonErrors = io.output.filter(l => {
      try { const o = JSON.parse(l); return o.error; } catch { return false; }
    });
    expect(jsonErrors.length).toBeGreaterThan(0);
  });

  it('retries transient failures when --retry specified', async () => {
    const session = createTestSession({ phase: 'Discover' });
    await store.save(session);

    let callCount = 0;
    const client = createFakeCopilotClient([], {
      onChat: async () => {
        callCount++;
        if (callCount <= 2) {
          throw Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' });
        }
        return { role: 'assistant' as const, content: 'Business context captured.' };
      },
    });

    // Each retry attempt consumes one input (the error thrown by onChat breaks the
    // loop before readInput is called again). Provide one input per attempt, then
    // null to end the successful run.
    const io = createNonTtyIO({ choice: 'exit' }, [
      'attempt 1',   // consumed by attempt 1 (fails)
      'attempt 2',   // consumed by attempt 2 (fails)
      'attempt 3',   // consumed by attempt 3 (succeeds, then loop reads again)
      null,          // ends the successful loop iteration
    ]);

    await runDirectCommand({
      sessionId: session.sessionId,
      phase: 'Discover',
      store,
      client,
      io,
      retry: 3,
    });

    // Should have retried and eventually succeeded
    expect(callCount).toBeGreaterThan(1);
  });

  it('fails after exhausting retries', async () => {
    const session = createTestSession({ phase: 'Discover' });
    await store.save(session);

    const client = createFakeCopilotClient([], {
      onChat: async () => {
        throw Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' });
      },
    });

    // Each retry attempt consumes one input. retry=2 means 3 total attempts.
    const io = createNonTtyIO({ choice: 'exit' }, [
      'attempt 1',   // attempt 1 (fails)
      'attempt 2',   // attempt 2/retry 1 (fails)
      'attempt 3',   // attempt 3/retry 2 (fails, exhausted)
    ]);

    const result = await runDirectCommand({
      sessionId: session.sessionId,
      phase: 'Discover',
      store,
      client,
      io,
      retry: 2,
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('Connection refused');
  });
});
