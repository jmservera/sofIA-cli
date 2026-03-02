/**
 * T075: Integration test for auto-start conversation wiring.
 *
 * Verifies that the workshop flow sends an initial message at phase start
 * so the LLM speaks first, and the user never has to initiate.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ConversationLoop } from '../../src/loop/conversationLoop.js';
import type { LoopIO, DecisionGateResult } from '../../src/loop/conversationLoop.js';
import { createFakeCopilotClient } from '../../src/shared/copilotClient.js';
import type { WorkshopSession, PhaseValue } from '../../src/shared/schemas/session.js';
import { SessionStore } from '../../src/sessions/sessionStore.js';
import { createPhaseHandler } from '../../src/phases/phaseHandlers.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTestSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  const now = new Date().toISOString();
  return {
    sessionId: 'test-autostart',
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
  decisionGateChoice: DecisionGateResult = { choice: 'continue' },
): LoopIO & { output: string[]; activityLog: string[] } {
  let inputIdx = 0;
  const output: string[] = [];
  const activityLog: string[] = [];

  return {
    write(text: string) {
      output.push(text);
    },
    writeActivity(text: string) {
      activityLog.push(text);
    },
    writeToolSummary(_toolName: string, _summary: string) {
      // no-op
    },
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

describe('Auto-start conversation integration (T075)', () => {
  let tmpDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-autostart-'));
    store = new SessionStore(tmpDir);
    process.removeAllListeners('SIGINT');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('workshop flow sends initial message at phase start, LLM speaks first', async () => {
    const session = createTestSession();
    await store.save(session);

    const client = createFakeCopilotClient([
      { role: 'assistant', content: 'Welcome! Tell me about your business and challenges.' },
      { role: 'assistant', content: 'Thanks for sharing. Let me identify key topics.' },
    ]);

    const io = createScriptedIO(['We sell widgets online']);

    const handler = createPhaseHandler('Discover');
    await handler._preload();

    // Get initial message from handler
    const initialMessage = handler.getInitialMessage!(session);
    expect(initialMessage).toBeDefined();

    const loop = new ConversationLoop({
      client,
      io,
      session,
      phaseHandler: handler,
      initialMessage,
      onSessionUpdate: async (s) => {
        await store.save(s);
      },
    });

    const result = await loop.run();

    // First turn should be the auto-start initial message, not user input
    expect(result.turns).toBeDefined();
    expect(result.turns!.length).toBeGreaterThanOrEqual(2);
    expect(result.turns![0].role).toBe('user');
    expect(result.turns![0].content).toBe(initialMessage);
    expect(result.turns![1].role).toBe('assistant');
    expect(result.turns![1].content).toBe('Welcome! Tell me about your business and challenges.');

    // LLM greeting should appear in output
    const allOutput = io.output.join('');
    expect(allOutput).toContain('Welcome!');
  });

  it('auto-start with resumed session includes progress context', async () => {
    const session = createTestSession({
      turns: [
        {
          phase: 'Discover',
          sequence: 1,
          role: 'user',
          content: 'Previous input',
          timestamp: '2025-01-01T00:00:00Z',
        },
        {
          phase: 'Discover',
          sequence: 2,
          role: 'assistant',
          content: 'Previous response',
          timestamp: '2025-01-01T00:00:00Z',
        },
      ],
    });
    const originalTurnCount = session.turns!.length;
    await store.save(session);

    const client = createFakeCopilotClient([
      {
        role: 'assistant',
        content: 'Welcome back! Last time we discussed your business. Let me continue.',
      },
    ]);

    const io = createScriptedIO([]);

    const handler = createPhaseHandler('Discover');
    await handler._preload();

    const initialMessage = handler.getInitialMessage!(session);
    expect(initialMessage).toBeDefined();
    // Resumed session message should be different from new session message
    const newSessionMsg = handler.getInitialMessage!(createTestSession());
    expect(initialMessage).not.toBe(newSessionMsg);

    const loop = new ConversationLoop({
      client,
      io,
      session,
      phaseHandler: handler,
      initialMessage,
    });

    const result = await loop.run();

    // Should have the auto-start turns appended to existing turns
    // Note: the loop mutates the turns array in-place, so we compare against the captured count
    expect(result.turns!.length).toBeGreaterThan(originalTurnCount);
  });
});
