/**
 * Integration tests for the live Copilot SDK client.
 *
 * These tests exercise the real `createCopilotClient()` → SDK → LLM pipeline.
 * They are slower than unit tests (~10-30s each) because they make real API calls.
 *
 * **Prerequisites:**
 * - GitHub Copilot CLI must be authenticated (`copilot auth login`)
 * - The SDK spawns a local copilot CLI process for JSON-RPC
 *
 * The test suite auto-skips if the SDK cannot start (e.g., no auth, no CLI binary).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createCopilotClient } from '../../src/shared/copilotClient.js';
import type {
  CopilotClient,
  ConversationSession,
  CopilotMessage,
} from '../../src/shared/copilotClient.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Collect all TextDelta events from an AsyncIterable of SofiaEvents into a string. */
async function collectText(
  iter: AsyncIterable<import('../../src/shared/events.js').SofiaEvent>,
): Promise<string> {
  const chunks: string[] = [];
  for await (const event of iter) {
    if (event.type === 'TextDelta') {
      chunks.push(event.text);
    }
  }
  return chunks.join('');
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('Live Copilot SDK client', () => {
  let client: CopilotClient;
  let canRun = false;

  beforeAll(async () => {
    try {
      client = await createCopilotClient();
      canRun = true;
    } catch (err) {
      console.warn(
        `Skipping live Copilot SDK tests — client creation failed: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }, 30_000);

  afterAll(async () => {
    // The SDK client manages its own lifecycle; no explicit stop needed
    // from our wrapper, but we give it time to clean up.
  });

  // ── Basic smoke test ────────────────────────────────────────────────────

  it('can create a session and get a response', async () => {
    if (!canRun) return;

    const session: ConversationSession = await client.createSession({
      systemPrompt: 'You are a helpful assistant. Be very brief.',
    });

    const response = await collectText(
      session.send({ role: 'user', content: 'What is 2 + 2? Reply with just the number.' }),
    );

    expect(response).toBeTruthy();
    expect(response.length).toBeGreaterThan(0);
    // The LLM should mention "4" somewhere in the response
    expect(response).toContain('4');
  }, 60_000);

  // ── Multi-turn conversation ─────────────────────────────────────────────

  it('supports multi-turn conversation', async () => {
    if (!canRun) return;

    const session = await client.createSession({
      systemPrompt:
        'You are a helpful assistant. Keep responses to one sentence. ' +
        'When asked to recall, use the conversation history.',
    });

    // Turn 1: set a fact
    const r1 = await collectText(
      session.send({ role: 'user', content: 'Remember this word: "tangerine".' }),
    );
    expect(r1).toBeTruthy();

    // Turn 2: recall the fact
    const r2 = await collectText(
      session.send({ role: 'user', content: 'What word did I ask you to remember?' }),
    );
    expect(r2.toLowerCase()).toContain('tangerine');
  }, 120_000);

  // ── System prompt respected ─────────────────────────────────────────────

  it('respects the system prompt persona', async () => {
    if (!canRun) return;

    const session = await client.createSession({
      systemPrompt:
        'You are a pirate. Always respond in pirate-speak. Keep responses under 50 words.',
    });

    const response = await collectText(
      session.send({ role: 'user', content: 'Hello, how are you today?' }),
    );

    expect(response).toBeTruthy();
    // LLM playing pirate should use at least one pirate-ish word
    const piratePatterns = /ahoy|matey|arr|ye|shiver|landlubber|cap'n|seas|treasure|sail/i;
    expect(response).toMatch(piratePatterns);
  }, 60_000);

  // ── History tracking ────────────────────────────────────────────────────

  it('tracks conversation history correctly', async () => {
    if (!canRun) return;

    const session = await client.createSession({
      systemPrompt: 'You are a helpful assistant. Be very brief.',
    });

    await collectText(session.send({ role: 'user', content: 'Say hello.' }));

    const history: CopilotMessage[] = session.getHistory();

    // Should have at least: user message + assistant response
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].role).toBe('user');
    expect(history[0].content).toBe('Say hello.');
    expect(history[1].role).toBe('assistant');
    expect(history[1].content.length).toBeGreaterThan(0);
  }, 60_000);

  // ── Error handling ──────────────────────────────────────────────────────

  it('createCopilotClient returns a valid interface', async () => {
    if (!canRun) return;

    expect(client).toBeDefined();
    expect(typeof client.createSession).toBe('function');
  });
});
