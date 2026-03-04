/**
 * Integration test: Summarization flow.
 *
 * Tests the full pipeline: ConversationLoop → phaseSummarize → session updated.
 * Verifies that when inline extraction fails, the post-phase summarization
 * call extracts structured data from the transcript.
 */
import { describe, it, expect, vi } from 'vitest';

import { ConversationLoop } from '../../src/loop/conversationLoop.js';
import type { LoopIO, PhaseHandler } from '../../src/loop/conversationLoop.js';
import type { CopilotClient } from '../../src/shared/copilotClient.js';
import type { WorkshopSession } from '../../src/shared/schemas/session.js';

function makeIO(): LoopIO {
  return {
    write: vi.fn(),
    writeActivity: vi.fn(),
    writeToolSummary: vi.fn(),
    readInput: vi.fn().mockResolvedValue(null), // EOF immediately
    showDecisionGate: vi.fn().mockResolvedValue({ choice: 'continue' }),
    isJsonMode: false,
    isTTY: false,
  };
}

function makeSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  return {
    sessionId: 'integration-test',
    schemaVersion: '1.0.0',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    phase: 'Ideate',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    turns: [],
    ...overrides,
  };
}

describe('summarization flow integration', () => {
  it('populates session.ideas via summarization when inline extraction fails', async () => {
    // Inline extraction returns nothing (simulates LLM not embedding JSON)
    const handler: PhaseHandler = {
      phase: 'Ideate',
      buildSystemPrompt: () => 'You are an Ideate facilitator.',
      extractResult: vi.fn().mockReturnValue({}),
      getInitialMessage: () => 'Start ideation.',
    };

    const ideas = [
      { id: 'idea-1', title: 'AI Chatbot', description: 'Automated support', workflowStepIds: ['s1'] },
    ];

    let callCount = 0;
    const fakeClient: CopilotClient = {
      createSession: vi.fn().mockImplementation(async () => ({
        send: vi.fn().mockImplementation(async function* () {
          callCount++;
          if (callCount === 1) {
            // First call: regular conversation (no JSON)
            yield { type: 'TextDelta', text: 'Here are some ideas for your business.' };
          } else {
            // Second call: summarization (returns JSON)
            yield { type: 'TextDelta', text: '```json\n' + JSON.stringify(ideas) + '\n```' };
          }
        }),
      })),
    } as unknown as CopilotClient;

    // On the summarization call, extractResult should return the ideas
    (handler.extractResult as ReturnType<typeof vi.fn>).mockImplementation(
      (_session: WorkshopSession, response: string) => {
        if (response.includes('idea-1')) {
          return { ideas };
        }
        return {};
      },
    );

    const io = makeIO();
    const loop = new ConversationLoop({
      client: fakeClient,
      io,
      session: makeSession(),
      phaseHandler: handler,
      initialMessage: 'Start ideation.',
    });

    const result = await loop.run();

    // The summarization call should have populated ideas
    expect(result.ideas).toEqual(ideas);
  });

  it('skips summarization when inline extraction succeeds', async () => {
    const ideas = [
      { id: 'idea-1', title: 'Test', description: 'Desc', workflowStepIds: [] },
    ];

    const handler: PhaseHandler = {
      phase: 'Ideate',
      buildSystemPrompt: () => 'Ideate prompt.',
      extractResult: vi.fn().mockReturnValue({ ideas }),
      getInitialMessage: () => 'Start.',
    };

    let sessionCalls = 0;
    const fakeClient: CopilotClient = {
      createSession: vi.fn().mockImplementation(async () => {
        sessionCalls++;
        return {
          send: vi.fn().mockImplementation(async function* () {
            yield { type: 'TextDelta', text: 'Ideas generated.' };
          }),
        };
      }),
    } as unknown as CopilotClient;

    const io = makeIO();
    const loop = new ConversationLoop({
      client: fakeClient,
      io,
      session: makeSession(),
      phaseHandler: handler,
      initialMessage: 'Start.',
    });

    await loop.run();

    // Only one session should be created (no summarization call needed)
    expect(sessionCalls).toBe(1);
  });
});
