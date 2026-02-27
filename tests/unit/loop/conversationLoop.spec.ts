/**
 * ConversationLoop tests.
 *
 * Validates the multi-turn conversation orchestration, streaming render,
 * event dispatching, phase handling, and shutdown behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConversationLoop,
  type LoopIO,
  type PhaseHandler,
  type ConversationLoopOptions,
} from '../../../src/loop/conversationLoop.js';
import { createFakeCopilotClient } from '../../../src/shared/copilotClient.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';
import type { SofiaEvent } from '../../../src/shared/events.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  return {
    sessionId: 'test-session-1',
    schemaVersion: '1.0.0',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    phase: 'Discover',
    status: 'Active',
    participants: [{ id: 'p1', displayName: 'Alice', role: 'Facilitator' }],
    artifacts: { generatedFiles: [] },
    ...overrides,
  };
}

/** Create a LoopIO that feeds predetermined inputs then returns null. */
function makeIO(inputs: (string | null)[], opts?: { json?: boolean; tty?: boolean }): LoopIO {
  let inputIndex = 0;
  const written: string[] = [];
  const activities: string[] = [];

  return {
    write(text: string) {
      written.push(text);
    },
    writeActivity(text: string) {
      activities.push(text);
    },
    async readInput(_prompt?: string): Promise<string | null> {
      if (inputIndex >= inputs.length) return null;
      return inputs[inputIndex++] ?? null;
    },
    async showDecisionGate(_phase) {
      return { choice: 'continue' as const };
    },
    isJsonMode: opts?.json ?? false,
    isTTY: opts?.tty ?? true,
    // Expose captured output for assertions
    get _written() {
      return written;
    },
    get _activities() {
      return activities;
    },
  } as LoopIO & { _written: string[]; _activities: string[] };
}

function makePhaseHandler(overrides?: Partial<PhaseHandler>): PhaseHandler {
  return {
    phase: 'Discover',
    buildSystemPrompt: () => 'You are a workshop facilitator.',
    extractResult: (session) => ({}),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ConversationLoop', () => {
  beforeEach(() => {
    // Remove any leftover SIGINT listeners from previous tests
    process.removeAllListeners('SIGINT');
  });

  describe('basic conversation flow', () => {
    it('sends user input to LLM and accumulates turns', async () => {
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'Tell me about your business.' },
        { role: 'assistant', content: 'Great, let us proceed.' },
      ]);

      const io = makeIO(['We sell widgets', 'We have 50 employees']);
      const handler = makePhaseHandler();
      const session = makeSession();

      const loop = new ConversationLoop({
        client,
        io,
        session,
        phaseHandler: handler,
      });

      const result = await loop.run();

      // Should have 4 turns: 2 user + 2 assistant
      expect(result.turns).toBeDefined();
      expect(result.turns!.length).toBe(4);
      expect(result.turns![0].role).toBe('user');
      expect(result.turns![0].content).toBe('We sell widgets');
      expect(result.turns![1].role).toBe('assistant');
      expect(result.turns![1].content).toBe('Tell me about your business.');
      expect(result.turns![2].role).toBe('user');
      expect(result.turns![2].content).toBe('We have 50 employees');
      expect(result.turns![3].role).toBe('assistant');
      expect(result.turns![3].content).toBe('Great, let us proceed.');
    });

    it('terminates on null input (EOF/Ctrl+D)', async () => {
      const client = createFakeCopilotClient([]);
      const io = makeIO([null]);
      const handler = makePhaseHandler();

      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: handler,
      });

      const result = await loop.run();
      expect(result.turns ?? []).toHaveLength(0);
    });

    it('updates session after each turn via onSessionUpdate callback', async () => {
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'Response one' },
      ]);

      const io = makeIO(['hello']);
      const updates: WorkshopSession[] = [];
      const onSessionUpdate = vi.fn(async (s: WorkshopSession) => {
        updates.push({ ...s });
      });

      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: makePhaseHandler(),
        onSessionUpdate,
      });

      await loop.run();

      expect(onSessionUpdate).toHaveBeenCalledTimes(1);
      expect(updates[0].turns).toHaveLength(2);
    });
  });

  describe('event dispatching', () => {
    it('emits events for TextDelta and Activity', async () => {
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'Hello!' },
      ]);

      const io = makeIO(['hi']);
      const events: SofiaEvent[] = [];

      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: makePhaseHandler(),
        onEvent: (e) => events.push(e),
      });

      await loop.run();

      // Should have at least: Activity (starting phase) + TextDelta
      const activityEvents = events.filter((e) => e.type === 'Activity');
      const textEvents = events.filter((e) => e.type === 'TextDelta');
      expect(activityEvents.length).toBeGreaterThanOrEqual(1);
      expect(textEvents.length).toBe(1);
      expect(textEvents[0].type === 'TextDelta' && textEvents[0].text).toBe('Hello!');
    });
  });

  describe('streaming output', () => {
    it('writes streamed text to io.write in TTY mode', async () => {
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'Streaming content' },
      ]);

      const io = makeIO(['go'], { tty: true, json: false });
      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: makePhaseHandler(),
      });

      await loop.run();

      const ioAny = io as unknown as { _written: string[] };
      expect(ioAny._written).toContain('Streaming content');
    });

    it('outputs JSON envelope in JSON mode', async () => {
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'Result text' },
      ]);

      const io = makeIO(['go'], { json: true });
      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: makePhaseHandler(),
      });

      await loop.run();

      const ioAny = io as unknown as { _written: string[] };
      const jsonOutputs = ioAny._written.filter((w: string) => w.startsWith('{'));
      expect(jsonOutputs.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(jsonOutputs[0]);
      expect(parsed.phase).toBe('Discover');
      expect(parsed.content).toBe('Result text');
    });
  });

  describe('phase handler integration', () => {
    it('applies extractResult updates to session', async () => {
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'We identified your challenges' },
      ]);

      const io = makeIO(['Our business sells widgets']);
      const handler = makePhaseHandler({
        extractResult: (_session, response) => ({
          businessContext: {
            businessDescription: 'Widget seller',
            challenges: ['Growth'],
          },
        }),
      });

      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: handler,
      });

      const result = await loop.run();
      expect(result.businessContext).toBeDefined();
      expect(result.businessContext!.businessDescription).toBe('Widget seller');
      expect(result.businessContext!.challenges).toEqual(['Growth']);
    });

    it('uses system prompt from handler when creating session', async () => {
      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'ok' },
      ]);

      // Spy on createSession
      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      const io = makeIO(['test']);
      const handler = makePhaseHandler({
        buildSystemPrompt: () => 'Custom system prompt for discover',
      });

      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: handler,
      });

      await loop.run();

      expect(createSessionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: 'Custom system prompt for discover',
        }),
      );
    });

    it('includes references from handler in session options', async () => {
      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'ok' },
      ]);

      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      const io = makeIO(['test']);
      const handler = makePhaseHandler({
        getReferences: () => ['doc1.md', 'doc2.md'],
      });

      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: handler,
      });

      await loop.run();

      expect(createSessionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          references: ['doc1.md', 'doc2.md'],
        }),
      );
    });
  });

  describe('phase completion', () => {
    it('does not break loop on empty input when isComplete returns false', async () => {
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'Need more info' },
        { role: 'assistant', content: 'Thanks' },
      ]);

      let callCount = 0;
      const io = makeIO(['', 'more data']);
      const handler = makePhaseHandler({
        isComplete: () => {
          callCount++;
          // First call: not complete; won't be called again because second input is non-empty
          return callCount > 1;
        },
      });

      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: handler,
      });

      const result = await loop.run();
      // Both inputs should produce turns (empty string still gets sent, "more data" also)
      expect(result.turns!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('session state', () => {
    it('getSession returns a copy of current session', async () => {
      const client = createFakeCopilotClient([]);
      const io = makeIO([null]);
      const session = makeSession();

      const loop = new ConversationLoop({
        client,
        io,
        session,
        phaseHandler: makePhaseHandler(),
      });

      const before = loop.getSession();
      expect(before.sessionId).toBe('test-session-1');
      // Mutate the returned copy
      before.sessionId = 'mutated';
      // Original should be unchanged
      expect(loop.getSession().sessionId).toBe('test-session-1');
    });

    it('updates updatedAt timestamp after each turn', async () => {
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'ok' },
      ]);

      const io = makeIO(['hello']);
      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession({ updatedAt: '2025-01-01T00:00:00Z' }),
        phaseHandler: makePhaseHandler(),
      });

      const result = await loop.run();
      expect(result.updatedAt).not.toBe('2025-01-01T00:00:00Z');
    });
  });

  describe('edge cases', () => {
    it('handles handler with no getReferences gracefully', async () => {
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'ok' },
      ]);

      const io = makeIO(['test']);
      const handler = makePhaseHandler();
      delete (handler as Partial<PhaseHandler>).getReferences;

      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: handler,
      });

      // Should not throw
      const result = await loop.run();
      expect(result.turns).toHaveLength(2);
    });

    it('handles exhausted fake responses gracefully', async () => {
      // Only 1 response configured but 2 messages sent
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'First' },
      ]);

      const io = makeIO(['msg1', 'msg2']);
      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: makePhaseHandler(),
      });

      const result = await loop.run();
      expect(result.turns).toHaveLength(4); // 2 user + 2 assistant
      expect(result.turns![3].content).toContain('No more responses');
    });
  });
});
