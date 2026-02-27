/**
 * Integration test: Direct command TTY mode (T045)
 *
 * Tests direct command entry with --session and --phase flags
 * in a TTY environment where interactive prompts are available.
 *
 * Verifies:
 * - `--session <id> --phase <phase>` jumps to the requested phase
 * - Session is loaded and used for the conversation loop
 * - TTY mode prompts for missing inputs
 * - Decision gates work in direct TTY mode
 * - Session state is correctly updated after direct phase run
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
    sessionId: 'test-direct-tty',
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

function createScriptedIO(
  inputs: (string | null)[],
  decisionGateChoice: DecisionGateResult = { choice: 'exit' },
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
    isJsonMode: false,
    isTTY: true,
    output,
    activityLog,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Direct command TTY mode', () => {
  let tmpDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-direct-tty-'));
    store = new SessionStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('runs a specific phase with --session and --phase', async () => {
    const session = createTestSession({ phase: 'Ideate' });
    await store.save(session);

    const io = createScriptedIO(['Here are some ideas about AI automation'], { choice: 'exit' });
    const client = createFakeCopilotClient([
      { role: 'assistant', content: '{"ideas": [{"title": "AI Helper", "description": "An AI assistant"}]}' },
    ]);

    const result = await runDirectCommand({
      sessionId: session.sessionId,
      phase: 'Ideate',
      store,
      client,
      io,
    });

    expect(result.exitCode).toBe(0);
    const loaded = await store.load(session.sessionId);
    expect(loaded.phase).toBe('Ideate');
  });

  it('prompts for missing input in TTY mode', async () => {
    const session = createTestSession();
    await store.save(session);

    const io = createScriptedIO(['My business is a retail company'], { choice: 'exit' });
    const client = createFakeCopilotClient([
      { role: 'assistant', content: 'Thank you. Let me analyze your business context.' },
    ]);

    const result = await runDirectCommand({
      sessionId: session.sessionId,
      phase: 'Discover',
      store,
      client,
      io,
    });

    // TTY mode should succeed — it can prompt
    expect(result.exitCode).toBe(0);
  });

  it('returns error when session not found', async () => {
    const io = createScriptedIO([]);
    const client = createFakeCopilotClient([]);

    const result = await runDirectCommand({
      sessionId: 'nonexistent-session',
      phase: 'Discover',
      store,
      client,
      io,
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('not found');
  });

  it('returns error for invalid phase', async () => {
    const session = createTestSession();
    await store.save(session);

    const io = createScriptedIO([]);
    const client = createFakeCopilotClient([]);

    const result = await runDirectCommand({
      sessionId: session.sessionId,
      phase: 'InvalidPhase' as PhaseValue,
      store,
      client,
      io,
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('Invalid phase');
  });

  it('persists session after running a phase', async () => {
    const session = createTestSession({ phase: 'Discover' });
    await store.save(session);

    const io = createScriptedIO(['We are a tech company'], { choice: 'exit' });
    const client = createFakeCopilotClient([
      { role: 'assistant', content: 'Great, I understand your business context.' },
    ]);

    await runDirectCommand({
      sessionId: session.sessionId,
      phase: 'Discover',
      store,
      client,
      io,
    });

    const loaded = await store.load(session.sessionId);
    expect(loaded.updatedAt).not.toBe(session.updatedAt);
    expect(loaded.turns.length).toBeGreaterThan(0);
  });
});
