/**
 * Tests for incremental markdown rendering during streaming (T080).
 *
 * Verifies that TextDelta chunks are rendered through markdownRenderer
 * in TTY mode, raw markdown in non-TTY/JSON mode, and that turn history
 * stores raw markdown (not ANSI).
 */
import { describe, it, expect, vi } from 'vitest';

import {
  ConversationLoop,
  type LoopIO,
  type PhaseHandler,
} from '../../../src/loop/conversationLoop.js';
import { createFakeCopilotClient } from '../../../src/shared/copilotClient.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';
import * as markdownRenderer from '../../../src/shared/markdownRenderer.js';
import { createNoOpSpinner } from '../../../src/shared/activitySpinner.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  return {
    sessionId: 'test-md-stream',
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

function makeIO(inputs: (string | null)[], opts?: { json?: boolean; tty?: boolean }): LoopIO & { _written: string[]; _activities: string[] } {
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
      // no-op for these tests
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Incremental streaming markdown rendering (T080)', () => {
  it('renders TextDelta chunks through renderMarkdown in TTY mode', async () => {
    const renderSpy = vi.spyOn(markdownRenderer, 'renderMarkdown');

    const client = createFakeCopilotClient([
      { role: 'assistant', content: '## Hello World\n\nSome **bold** text.' },
    ]);

    const io = makeIO(['test input'], { tty: true, json: false });

    const loop = new ConversationLoop({
      client,
      io,
      session: makeSession(),
      phaseHandler: makePhaseHandler(),
      spinner: createNoOpSpinner(),
    });

    await loop.run();

    // renderMarkdown should have been called for the TextDelta chunk
    expect(renderSpy).toHaveBeenCalled();
    const callArgs = renderSpy.mock.calls;
    // At least one call should have the LLM content
    const contentCalls = callArgs.filter(([text]) => text.includes('Hello World'));
    expect(contentCalls.length).toBeGreaterThanOrEqual(1);

    renderSpy.mockRestore();
  });

  it('writes raw text in non-TTY mode without markdown rendering', async () => {
    const client = createFakeCopilotClient([
      { role: 'assistant', content: '## Raw heading' },
    ]);

    const io = makeIO(['test'], { tty: false, json: false });

    const loop = new ConversationLoop({
      client,
      io,
      session: makeSession(),
      phaseHandler: makePhaseHandler(),
      spinner: createNoOpSpinner(),
    });

    await loop.run();

    // In non-TTY mode, raw text should be written
    const allOutput = io._written.join('');
    expect(allOutput).toContain('## Raw heading');
  });

  it('preserves raw markdown in JSON mode output', async () => {
    const client = createFakeCopilotClient([
      { role: 'assistant', content: '**Bold** text' },
    ]);

    const io = makeIO(['test'], { tty: false, json: true });

    const loop = new ConversationLoop({
      client,
      io,
      session: makeSession(),
      phaseHandler: makePhaseHandler(),
      spinner: createNoOpSpinner(),
    });

    await loop.run();

    const jsonOutputs = io._written.filter((w: string) => w.startsWith('{'));
    expect(jsonOutputs.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(jsonOutputs[0]);
    expect(parsed.content).toBe('**Bold** text');
  });

  it('stores raw markdown in turn history (not ANSI)', async () => {
    const client = createFakeCopilotClient([
      { role: 'assistant', content: '## Phase Output\n\nContent here.' },
    ]);

    const io = makeIO(['input'], { tty: true, json: false });

    const loop = new ConversationLoop({
      client,
      io,
      session: makeSession(),
      phaseHandler: makePhaseHandler(),
      spinner: createNoOpSpinner(),
    });

    const result = await loop.run();

    // Turn history should contain raw markdown, not ANSI escape codes
    const assistantTurn = result.turns?.find(t => t.role === 'assistant');
    expect(assistantTurn).toBeDefined();
    expect(assistantTurn!.content).toBe('## Phase Output\n\nContent here.');
    // Should NOT contain ANSI escape sequences
    // eslint-disable-next-line no-control-regex
    expect(assistantTurn!.content).not.toMatch(/\u001b\[/);
  });
});
