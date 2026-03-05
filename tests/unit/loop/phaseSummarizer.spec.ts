/**
 * Phase summarizer tests.
 *
 * Tests for the post-phase summarization fallback that extracts
 * structured data from conversation transcripts when the conversation
 * loop's inline extraction fails.
 */
import { describe, it, expect, vi } from 'vitest';

import {
  needsSummarization,
  buildPhaseTranscript,
  phaseSummarize,
} from '../../../src/loop/phaseSummarizer.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';
import type { PhaseHandler } from '../../../src/loop/conversationLoop.js';

function emptySession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  return {
    sessionId: 'test-1',
    schemaVersion: '1.0.0',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    phase: 'Discover',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    turns: [],
    ...overrides,
  };
}

describe('needsSummarization', () => {
  it('returns true when Ideate session field is null', () => {
    const session = emptySession();
    expect(needsSummarization('Ideate', session)).toBe(true);
  });

  it('returns false when Ideate session field is populated', () => {
    const session = emptySession({
      ideas: [{ id: 'idea-1', title: 'Test', description: 'Desc', workflowStepIds: [] }],
    });
    expect(needsSummarization('Ideate', session)).toBe(false);
  });

  it('returns true when Design session field is null', () => {
    expect(needsSummarization('Design', emptySession())).toBe(true);
  });

  it('returns false when Design session field is populated', () => {
    const session = emptySession({
      evaluation: { method: 'feasibility-value-matrix', ideas: [] },
    });
    expect(needsSummarization('Design', session)).toBe(false);
  });

  it('returns false for unknown phase', () => {
    expect(needsSummarization('Complete', emptySession())).toBe(false);
  });
});

describe('buildPhaseTranscript', () => {
  it('returns empty string when no turns for phase', () => {
    const session = emptySession();
    expect(buildPhaseTranscript('Ideate', session)).toBe('');
  });

  it('concatenates turns for the specified phase', () => {
    const session = emptySession({
      turns: [
        { phase: 'Ideate', sequence: 1, role: 'user', content: 'Hello', timestamp: '2025-01-01T00:00:00Z' },
        { phase: 'Ideate', sequence: 2, role: 'assistant', content: 'Hi there', timestamp: '2025-01-01T00:00:00Z' },
        { phase: 'Design', sequence: 3, role: 'user', content: 'Other phase', timestamp: '2025-01-01T00:00:00Z' },
      ],
    });
    const transcript = buildPhaseTranscript('Ideate', session);
    expect(transcript).toContain('[user]: Hello');
    expect(transcript).toContain('[assistant]: Hi there');
    expect(transcript).not.toContain('Other phase');
  });
});

describe('phaseSummarize', () => {
  function createFakeClient(responseText: string) {
    return {
      createSession: vi.fn().mockResolvedValue({
        send: vi.fn().mockImplementation(async function* () {
          yield { type: 'TextDelta', text: responseText };
        }),
      }),
    };
  }

  function createHandler(extractReturn: Partial<WorkshopSession> = {}): PhaseHandler {
    return {
      phase: 'Ideate',
      buildSystemPrompt: () => 'test prompt',
      extractResult: vi.fn().mockReturnValue(extractReturn),
    };
  }

  it('returns empty object when session field already populated (no-op)', async () => {
    const session = emptySession({
      ideas: [{ id: 'idea-1', title: 'Test', description: 'Desc', workflowStepIds: [] }],
    });
    const client = createFakeClient('');
    const handler = createHandler();
    const result = await phaseSummarize(client as never, 'Ideate', session, handler);
    expect(result).toEqual({});
    expect(client.createSession).not.toHaveBeenCalled();
  });

  it('returns empty object when no transcript turns exist', async () => {
    const session = emptySession();
    const client = createFakeClient('');
    const handler = createHandler();
    const result = await phaseSummarize(client as never, 'Ideate', session, handler);
    expect(result).toEqual({});
  });

  it('extracts IdeaCard[] from LLM summary response', async () => {
    const ideas = [{ id: 'idea-1', title: 'AI Assistant', description: 'Automate tasks', workflowStepIds: ['s1'] }];
    const responseJson = '```json\n' + JSON.stringify(ideas) + '\n```';
    const client = createFakeClient(responseJson);
    const handler = createHandler({ ideas });

    const session = emptySession({
      turns: [
        { phase: 'Ideate', sequence: 1, role: 'user', content: 'Give me ideas', timestamp: '2025-01-01T00:00:00Z' },
        { phase: 'Ideate', sequence: 2, role: 'assistant', content: 'Here are ideas', timestamp: '2025-01-01T00:00:00Z' },
      ],
    });

    const result = await phaseSummarize(client as never, 'Ideate', session, handler);
    expect(result).toEqual({ ideas });
    expect(handler.extractResult).toHaveBeenCalledWith(session, responseJson);
  });

  it('returns empty object when LLM returns invalid response (no crash)', async () => {
    const client = createFakeClient('This is not JSON at all');
    const handler = createHandler({});

    const session = emptySession({
      turns: [
        { phase: 'Ideate', sequence: 1, role: 'user', content: 'Give me ideas', timestamp: '2025-01-01T00:00:00Z' },
        { phase: 'Ideate', sequence: 2, role: 'assistant', content: 'Here are ideas', timestamp: '2025-01-01T00:00:00Z' },
      ],
    });

    const result = await phaseSummarize(client as never, 'Ideate', session, handler);
    expect(result).toEqual({});
  });

  it('does not throw when client throws', async () => {
    const client = {
      createSession: vi.fn().mockRejectedValue(new Error('Network error')),
    };
    const handler = createHandler();

    const session = emptySession({
      turns: [
        { phase: 'Ideate', sequence: 1, role: 'user', content: 'Hello', timestamp: '2025-01-01T00:00:00Z' },
      ],
    });

    const result = await phaseSummarize(client as never, 'Ideate', session, handler);
    expect(result).toEqual({});
  });
});
