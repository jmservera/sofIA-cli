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
} from '../../../src/loop/conversationLoop.js';
import { createFakeCopilotClient } from '../../../src/shared/copilotClient.js';
import type { SessionOptions } from '../../../src/shared/copilotClient.js';
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
    writeToolSummary(_toolName: string, _summary: string) {
      // no-op for tests
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
    extractResult: (_session) => ({}),
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
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'Response one' }]);

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
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'Hello!' }]);

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
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'Streaming content' }]);

      const io = makeIO(['go'], { tty: true, json: false });
      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: makePhaseHandler(),
      });

      await loop.run();

      const ioAny = io as unknown as { _written: string[] };
      // In TTY mode, text goes through renderMarkdown which may add formatting
      const allOutput = ioAny._written.join('');
      expect(allOutput).toContain('Streaming content');
    });

    it('outputs JSON envelope in JSON mode', async () => {
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'Result text' }]);

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
        extractResult: (_session, _response) => ({
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
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'ok' }]);

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
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'ok' }]);

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
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'ok' }]);

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
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'ok' }]);

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
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'First' }]);

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

  // ── T073: Auto-start behavior ──────────────────────────────────────────

  describe('auto-start with initialMessage (T073)', () => {
    it('sends initialMessage to LLM before readInput()', async () => {
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'Welcome to the Discover phase!' },
        { role: 'assistant', content: 'Great, thanks for that info.' },
      ]);

      const readInputCalls: string[] = [];
      const io = makeIO(['user says hello']);
      const origReadInput = io.readInput.bind(io);
      io.readInput = async (prompt?: string) => {
        readInputCalls.push(prompt ?? '');
        return origReadInput(prompt);
      };

      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: makePhaseHandler(),
        initialMessage: 'Introduce the Discover phase and ask the first question.',
      });

      const result = await loop.run();

      // Initial message turn + user turn = 4 turns total
      expect(result.turns).toHaveLength(4);
      // First turn pair: system initial message → LLM greeting
      expect(result.turns![0].role).toBe('user');
      expect(result.turns![0].content).toBe(
        'Introduce the Discover phase and ask the first question.',
      );
      expect(result.turns![1].role).toBe('assistant');
      expect(result.turns![1].content).toBe('Welcome to the Discover phase!');
    });

    it('streams the greeting response to output', async () => {
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'Hello! Welcome to sofIA.' },
      ]);

      const io = makeIO([], { tty: true, json: false });

      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: makePhaseHandler(),
        initialMessage: 'Start the phase.',
      });

      await loop.run();

      const ioTyped = io as LoopIO & { _written: string[] };
      const allOutput = ioTyped._written.join('');
      expect(allOutput).toContain('Hello! Welcome to sofIA.');
    });

    it('records initial exchange in turn history', async () => {
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'Phase intro response' },
      ]);

      const io = makeIO([]);

      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: makePhaseHandler(),
        initialMessage: 'Auto-start message',
      });

      const result = await loop.run();

      expect(result.turns).toHaveLength(2);
      expect(result.turns![0].role).toBe('user');
      expect(result.turns![0].content).toBe('Auto-start message');
      expect(result.turns![1].role).toBe('assistant');
      expect(result.turns![1].content).toBe('Phase intro response');
    });

    it('does NOT auto-start when initialMessage is not provided', async () => {
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'Response' }]);

      const io = makeIO(['user input']);

      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: makePhaseHandler(),
        // No initialMessage
      });

      const result = await loop.run();

      // Only user + assistant turns, no initial message turn
      expect(result.turns).toHaveLength(2);
      expect(result.turns![0].role).toBe('user');
      expect(result.turns![0].content).toBe('user input');
    });
  });

  // ── Session resume: conversation history in system prompt ────────────────

  describe('session resume with prior turns', () => {
    it('injects prior conversation history into the system prompt on resume', async () => {
      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'Welcome back! You told me about widgets.' },
      ]);

      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      // Session with existing turns from a prior Discover conversation
      const session = makeSession({
        turns: [
          {
            phase: 'Discover',
            sequence: 1,
            role: 'user',
            content: 'We sell widgets worldwide',
            timestamp: '2025-01-01T00:00:00Z',
          },
          {
            phase: 'Discover',
            sequence: 2,
            role: 'assistant',
            content: 'Great, what are your main challenges?',
            timestamp: '2025-01-01T00:01:00Z',
          },
        ],
      });

      const io = makeIO([]);
      const handler = makePhaseHandler({
        buildSystemPrompt: () => 'You are a workshop facilitator.',
      });

      const loop = new ConversationLoop({
        client,
        io,
        session,
        phaseHandler: handler,
        initialMessage: 'We are resuming. Summarize progress.',
      });

      await loop.run();

      // The system prompt should contain the prior conversation history
      const passedOpts = createSessionSpy.mock.calls[0][0] as SessionOptions;
      expect(passedOpts.systemPrompt).toContain('We sell widgets worldwide');
      expect(passedOpts.systemPrompt).toContain('Great, what are your main challenges?');
      expect(passedOpts.systemPrompt).toContain('Previous conversation');
    });

    it('does NOT inject history when no prior turns exist', async () => {
      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'Welcome to the workshop!' },
      ]);

      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      const io = makeIO([]);
      const handler = makePhaseHandler({
        buildSystemPrompt: () => 'You are a workshop facilitator.',
      });

      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(), // No turns
        phaseHandler: handler,
        initialMessage: 'Start the Discover phase.',
      });

      await loop.run();

      const passedOpts = createSessionSpy.mock.calls[0][0] as SessionOptions;
      // System prompt should be exactly what the handler returned
      expect(passedOpts.systemPrompt).toBe('You are a workshop facilitator.');
    });

    it('only includes turns for the current phase in the history', async () => {
      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([
        { role: 'assistant', content: 'Resuming ideation.' },
      ]);

      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      const session = makeSession({
        phase: 'Ideate',
        turns: [
          {
            phase: 'Discover',
            sequence: 1,
            role: 'user',
            content: 'Discovery message (should NOT appear)',
            timestamp: '2025-01-01T00:00:00Z',
          },
          {
            phase: 'Ideate',
            sequence: 2,
            role: 'user',
            content: 'Ideation message (should appear)',
            timestamp: '2025-01-01T01:00:00Z',
          },
          {
            phase: 'Ideate',
            sequence: 3,
            role: 'assistant',
            content: 'Ideation response (should appear)',
            timestamp: '2025-01-01T01:01:00Z',
          },
        ],
      });

      const io = makeIO([]);
      const handler = makePhaseHandler({
        phase: 'Ideate',
        buildSystemPrompt: () => 'Ideation facilitator.',
      });

      const loop = new ConversationLoop({
        client,
        io,
        session,
        phaseHandler: handler,
        initialMessage: 'Resume ideation.',
      });

      await loop.run();

      const passedOpts = createSessionSpy.mock.calls[0][0] as SessionOptions;
      expect(passedOpts.systemPrompt).toContain('Ideation message (should appear)');
      expect(passedOpts.systemPrompt).toContain('Ideation response (should appear)');
      expect(passedOpts.systemPrompt).not.toContain('Discovery message (should NOT appear)');
    });
  });

  // ── T055: SessionOptions.onUsage callback ─────────────────────────────────

  describe('SessionOptions.onUsage (T055)', () => {
    it('accepts an onUsage callback on SessionOptions', () => {
      const opts: SessionOptions = {
        systemPrompt: 'Test',
        onUsage: vi.fn(),
      };
      expect(opts.onUsage).toBeDefined();
      expect(typeof opts.onUsage).toBe('function');
    });

    it('onUsage callback is forwarded when passed through createSession', async () => {
      const usageCb = vi.fn();
      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'OK' }]);
      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      await client.createSession({
        systemPrompt: 'Test',
        onUsage: usageCb,
      });

      const passedOpts = createSessionSpy.mock.calls[0][0] as SessionOptions;
      expect(passedOpts.onUsage).toBe(usageCb);
    });

    it('omitting onUsage does not set it on SessionOptions', () => {
      const opts: SessionOptions = { systemPrompt: 'Test' };
      expect(opts.onUsage).toBeUndefined();
    });
  });

  // ── FR-021/022/024: Consumer wiring of hooks and onUsage ──────────────────

  describe('hooks and onUsage consumer forwarding (FR-021, FR-022, FR-024)', () => {
    it('forwards hooks to createSession when provided', async () => {
      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'ok' }]);
      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      const hooks: SessionOptions['hooks'] = {
        onPreToolUse: vi.fn(),
        onPostToolUse: vi.fn(),
        onErrorOccurred: vi.fn(),
      };

      const io = makeIO([]);
      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: makePhaseHandler(),
        initialMessage: 'Hello',
        hooks,
      });

      await loop.run();

      const passedOpts = createSessionSpy.mock.calls[0][0] as SessionOptions;
      expect(passedOpts.hooks).toBe(hooks);
    });

    it('forwards onUsage to createSession when provided', async () => {
      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'ok' }]);
      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      const onUsage = vi.fn();
      const io = makeIO([]);
      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: makePhaseHandler(),
        initialMessage: 'Hello',
        onUsage,
      });

      await loop.run();

      const passedOpts = createSessionSpy.mock.calls[0][0] as SessionOptions;
      expect(passedOpts.onUsage).toBe(onUsage);
    });

    it('omits hooks and onUsage from createSession when not provided', async () => {
      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'ok' }]);
      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      const io = makeIO([]);
      const loop = new ConversationLoop({
        client,
        io,
        session: makeSession(),
        phaseHandler: makePhaseHandler(),
        initialMessage: 'Hello',
      });

      await loop.run();

      const passedOpts = createSessionSpy.mock.calls[0][0] as SessionOptions;
      expect(passedOpts.hooks).toBeUndefined();
      expect(passedOpts.onUsage).toBeUndefined();
    });
  });
});
