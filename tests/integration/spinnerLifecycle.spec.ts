/**
 * Integration tests for spinner lifecycle in ConversationLoop (T089).
 *
 * Verifies the full spinner lifecycle during streaming: "Thinking..." appears
 * after user input, transitions on ToolCall events, prints tool summary on
 * ToolResult, stops on first TextDelta, and handles multi-tool sequences.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Writable } from 'node:stream';

import {
  ConversationLoop,
  type LoopIO,
  type PhaseHandler,
} from '../../src/loop/conversationLoop.js';
import type {
  CopilotClient,
  ConversationSession,
  CopilotMessage,
  SessionOptions,
} from '../../src/shared/copilotClient.js';
import { ActivitySpinner } from '../../src/shared/activitySpinner.js';
import type { SofiaEvent } from '../../src/shared/events.js';
import {
  createTextDeltaEvent,
  createToolCallEvent,
  createToolResultEvent,
} from '../../src/shared/events.js';
import type { WorkshopSession } from '../../src/shared/schemas/session.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  return {
    sessionId: 'spinner-int-test',
    schemaVersion: '1.0.0',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    phase: 'Discover',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    ...overrides,
  };
}

function makeIO(
  inputs: (string | null)[],
  opts?: { json?: boolean; tty?: boolean },
): LoopIO & {
  _written: string[];
  _activities: string[];
  _toolSummaries: Array<{ toolName: string; summary: string }>;
} {
  let inputIndex = 0;
  const written: string[] = [];
  const activities: string[] = [];
  const toolSummaries: Array<{ toolName: string; summary: string }> = [];

  return {
    write(text: string) {
      written.push(text);
    },
    writeActivity(text: string) {
      activities.push(text);
    },
    writeToolSummary(toolName: string, summary: string) {
      toolSummaries.push({ toolName, summary });
    },
    async readInput(): Promise<string | null> {
      if (inputIndex >= inputs.length) return null;
      return inputs[inputIndex++] ?? null;
    },
    async showDecisionGate() {
      return { choice: 'continue' as const };
    },
    isJsonMode: opts?.json ?? false,
    isTTY: opts?.tty ?? true,
    get _written() {
      return written;
    },
    get _activities() {
      return activities;
    },
    get _toolSummaries() {
      return toolSummaries;
    },
  };
}

function makePhaseHandler(overrides?: Partial<PhaseHandler>): PhaseHandler {
  return {
    phase: 'Discover',
    buildSystemPrompt: () => 'System prompt',
    extractResult: () => ({}),
    ...overrides,
  };
}

function createCaptureStream(): Writable & { getOutput: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  (stream as Writable & { getOutput: () => string }).getOutput = () => chunks.join('');
  return stream as Writable & { getOutput: () => string };
}

/**
 * Create a fake CopilotClient that yields a custom sequence of SofiaEvents.
 * This allows testing ToolCall → ToolResult → TextDelta sequences.
 */
function createEventSequenceClient(eventSequences: SofiaEvent[][]): CopilotClient {
  let seqIndex = 0;

  return {
    async createSession(_opts: SessionOptions): Promise<ConversationSession> {
      const history: CopilotMessage[] = [];
      return {
        send(message: CopilotMessage): AsyncIterable<SofiaEvent> {
          history.push(message);
          const events = eventSequences[seqIndex] ?? [createTextDeltaEvent('[No more events]')];
          seqIndex++;

          return {
            async *[Symbol.asyncIterator]() {
              for (const event of events) {
                yield event;
              }
            },
          };
        },
        getHistory: () => [...history],
      };
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Spinner lifecycle integration (T089)', () => {
  beforeEach(() => {
    process.removeAllListeners('SIGINT');
  });

  it('starts Thinking spinner before sending, stops on first TextDelta', async () => {
    const stream = createCaptureStream();
    const spinner = new ActivitySpinner({ isTTY: true, isJsonMode: false, stream });

    const startSpy = vi.spyOn(spinner, 'startThinking');
    const stopSpy = vi.spyOn(spinner, 'stop');

    const client = createEventSequenceClient([[createTextDeltaEvent('Hello from LLM')]]);

    const io = makeIO(['test input'], { tty: true });
    const loop = new ConversationLoop({
      client,
      io,
      session: makeSession(),
      phaseHandler: makePhaseHandler(),
      spinner,
    });

    await loop.run();

    expect(startSpy).toHaveBeenCalled();
    expect(stopSpy).toHaveBeenCalled();
    expect(spinner.isActive()).toBe(false);
  });

  it('transitions spinner to tool name on ToolCall, completes on ToolResult', async () => {
    const stream = createCaptureStream();
    const spinner = new ActivitySpinner({ isTTY: true, isJsonMode: false, stream });

    const toolCallSpy = vi.spyOn(spinner, 'startToolCall');
    const completeSpy = vi.spyOn(spinner, 'completeToolCall');

    const client = createEventSequenceClient([
      [
        createToolCallEvent('WorkIQ', { query: 'logistics' }),
        createToolResultEvent('WorkIQ', 'Found 5 processes'),
        createTextDeltaEvent('Based on the analysis...'),
      ],
    ]);

    const io = makeIO(['analyze my processes'], { tty: true });
    const loop = new ConversationLoop({
      client,
      io,
      session: makeSession(),
      phaseHandler: makePhaseHandler(),
      spinner,
    });

    await loop.run();

    expect(toolCallSpy).toHaveBeenCalledWith('WorkIQ');
    expect(completeSpy).toHaveBeenCalled();
    expect(spinner.isActive()).toBe(false);
  });

  it('handles multi-tool sequences (ToolCall → ToolResult → ToolCall → ToolResult → TextDelta)', async () => {
    const stream = createCaptureStream();
    const spinner = new ActivitySpinner({ isTTY: true, isJsonMode: false, stream });

    const toolCallSpy = vi.spyOn(spinner, 'startToolCall');
    const completeSpy = vi.spyOn(spinner, 'completeToolCall');

    const client = createEventSequenceClient([
      [
        createToolCallEvent('WorkIQ', { query: 'tasks' }),
        createToolResultEvent('WorkIQ', 'Found 3 tasks'),
        createToolCallEvent('Context7', { doc: 'azure-ai' }),
        createToolResultEvent('Context7', '12 docs retrieved'),
        createTextDeltaEvent('Here are my findings...'),
      ],
    ]);

    const io = makeIO(['research tasks'], { tty: true });
    const loop = new ConversationLoop({
      client,
      io,
      session: makeSession(),
      phaseHandler: makePhaseHandler(),
      spinner,
    });

    await loop.run();

    expect(toolCallSpy).toHaveBeenCalledTimes(2);
    expect(completeSpy).toHaveBeenCalledTimes(2);

    // Tool summaries should be written to IO
    expect(io._toolSummaries.length).toBe(2);
    expect(io._toolSummaries[0].toolName).toBe('WorkIQ');
    expect(io._toolSummaries[1].toolName).toBe('Context7');
  });

  it('writes tool summaries to IO on ToolResult events', async () => {
    const stream = createCaptureStream();
    const spinner = new ActivitySpinner({ isTTY: true, isJsonMode: false, stream });

    const client = createEventSequenceClient([
      [
        createToolCallEvent('GitHub', { repo: 'test' }),
        createToolResultEvent('GitHub', 'Found 8 repos'),
        createTextDeltaEvent('The repo results are...'),
      ],
    ]);

    const io = makeIO(['search repos'], { tty: true });
    const loop = new ConversationLoop({
      client,
      io,
      session: makeSession(),
      phaseHandler: makePhaseHandler(),
      spinner,
    });

    await loop.run();

    expect(io._toolSummaries).toEqual([
      { toolName: 'GitHub', summary: expect.stringContaining('Found 8 repos') },
    ]);
  });

  it('no-op spinner works without errors in non-TTY mode', async () => {
    const client = createEventSequenceClient([
      [
        createToolCallEvent('WorkIQ', { query: 'test' }),
        createToolResultEvent('WorkIQ', 'ok'),
        createTextDeltaEvent('Results.'),
      ],
    ]);

    const io = makeIO(['query'], { tty: false });
    const loop = new ConversationLoop({
      client,
      io,
      session: makeSession(),
      phaseHandler: makePhaseHandler(),
      // No spinner provided — uses no-op default
    });

    await loop.run();

    // Should work without errors
    const allOutput = io._written.join('');
    expect(allOutput).toContain('Results.');
  });
});
