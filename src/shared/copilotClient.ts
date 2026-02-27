/**
 * Copilot client abstraction.
 *
 * Wraps Copilot SDK interactions behind a small interface so that
 * tests can use deterministic fakes instead of live LLM calls.
 */
import type { SofiaEvent } from './events.js';
import { createTextDeltaEvent } from './events.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CopilotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface SessionOptions {
  systemPrompt: string;
  tools?: ToolDefinition[];
  references?: string[];
}

/**
 * A conversation session with the LLM.
 * Supports multi-turn conversations with streaming.
 */
export interface ConversationSession {
  /** Send a message and receive streaming events. */
  send(message: CopilotMessage): AsyncIterable<SofiaEvent>;
  /** Get the full conversation history. */
  getHistory(): CopilotMessage[];
}

/**
 * Client interface for creating conversation sessions.
 * Live implementations wrap the Copilot SDK; fakes provide deterministic behavior.
 */
export interface CopilotClient {
  createSession(options: SessionOptions): Promise<ConversationSession>;
}

// ── Fake implementation for tests ────────────────────────────────────────────

interface FakeClientOptions {
  tools?: ToolDefinition[];
  /** Override the send behavior entirely for custom test scenarios (e.g., transient failures). */
  onChat?: (message: CopilotMessage) => Promise<CopilotMessage>;
}

/**
 * Create a fake CopilotClient that returns predetermined responses.
 * Used in unit and integration tests for deterministic behavior.
 */
export function createFakeCopilotClient(
  responses: CopilotMessage[],
  _options?: FakeClientOptions,
): CopilotClient {
  let responseIndex = 0;

  return {
    async createSession(_sessionOptions: SessionOptions): Promise<ConversationSession> {
      const history: CopilotMessage[] = [];

      return {
        send(message: CopilotMessage): AsyncIterable<SofiaEvent> {
          history.push(message);

          // If onChat override is provided, use it (allows throwing for retry tests)
          if (_options?.onChat) {
            const chatFn = _options.onChat;
            return {
              async *[Symbol.asyncIterator]() {
                const response = await chatFn(message);
                history.push(response);
                yield createTextDeltaEvent(response.content);
              },
            };
          }

          const response = responses[responseIndex] ?? {
            role: 'assistant' as const,
            content: '[No more responses configured]',
          };
          responseIndex++;
          history.push(response);

          return {
            async *[Symbol.asyncIterator]() {
              // Simulate streaming by yielding the full content as a single TextDelta
              yield createTextDeltaEvent(response.content);
            },
          };
        },
        getHistory(): CopilotMessage[] {
          return [...history];
        },
      };
    },
  };
}

// ── Live Copilot SDK client (created when SDK is available) ──────────────────

/**
 * Create a real CopilotClient using the GitHub Copilot SDK.
 * Falls back to a diagnostic error if the SDK is not installed.
 */
export async function createCopilotClient(): Promise<CopilotClient> {
  try {
    // Dynamic import — SDK is optional dependency
    const sdk = await import('@github/copilot-sdk');
    // TODO: Wire up real SDK conversation session when SDK API is confirmed
    void sdk;
    throw new Error('Live Copilot SDK client not yet implemented — use createFakeCopilotClient for tests');
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not yet implemented')) {
      throw err;
    }
    throw new Error(
      'GitHub Copilot SDK (@github/copilot-sdk) is not available. ' +
      'Install it or use createFakeCopilotClient for tests.',
    );
  }
}
