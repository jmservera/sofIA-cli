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
  /**
   * MCP server configurations to forward to the Copilot SDK's
   * `createSession()`. The SDK manages server lifecycle (spawn/connect,
   * JSON-RPC, tool dispatch) for LLM-initiated tool calls.
   *
   * Format: `Record<string, MCPServerConfig>` matching the SDK's expected
   * shape (MCPLocalServerConfig or MCPRemoteServerConfig).
   * Uses `import('@github/copilot-sdk').MCPServerConfig` when SDK is available.
   */
  mcpServers?: Record<
    string,
    {
      type?: string;
      tools: string[];
      timeout?: number;
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
      url?: string;
      headers?: Record<string, string>;
    }
  >;
  /**
   * Optional hooks for SDK tool-call visibility (FR-021, FR-022).
   * Forwarded to SDK `createSession({ hooks })` so tool-call activity
   * is emitted to the CLI spinner via the activity event system.
   *
   * Shapes match the SDK's `SessionHooks` signatures:
   * - `onPreToolUse(input: { toolName, toolArgs }, invocation)`
   * - `onPostToolUse(input: { toolName, toolArgs, toolResult }, invocation)`
   * - `onErrorOccurred(input: { error }, invocation)`
   */
  hooks?: {
    onPreToolUse?: (
      input: { toolName: string; toolArgs: unknown },
      invocation: { sessionId: string },
    ) => Promise<{ permissionDecision?: 'allow' | 'deny' | 'ask' } | void> | void;
    onPostToolUse?: (
      input: { toolName: string; toolArgs: unknown; toolResult: unknown },
      invocation: { sessionId: string },
    ) => Promise<void> | void;
    onErrorOccurred?: (
      input: { error: string; errorContext?: string; recoverable?: boolean },
      invocation: { sessionId: string },
    ) => Promise<void> | void;
  };
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
 * Wraps the SDK's CopilotClient + CopilotSession behind our
 * CopilotClient / ConversationSession interfaces so the rest of
 * the codebase (ConversationLoop, phaseHandlers) stays decoupled.
 *
 * Throws a clear error if the SDK is not installed.
 */
export async function createCopilotClient(): Promise<CopilotClient> {
  // Dynamic import — SDK is listed in dependencies but may fail in
  // environments where the native add-on cannot build.
  let sdk: typeof import('@github/copilot-sdk');
  try {
    sdk = await import('@github/copilot-sdk');
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`GitHub Copilot SDK (@github/copilot-sdk) is not available: ${detail}`);
  }

  const { CopilotClient: SdkClient, approveAll } = sdk;

  // A single SDK client instance is shared across sessions.
  // autoStart: true (default) means `start()` is called lazily on
  // the first `createSession`.
  const sdkClient = new SdkClient();

  return {
    async createSession(options: SessionOptions): Promise<ConversationSession> {
      const sessionConfig = {
        onPermissionRequest: approveAll,
        systemMessage: {
          mode: 'replace' as const,
          content: options.systemPrompt,
        },
        // Forward MCP server configs to the SDK so it manages server lifecycle
        // (spawn, connect, JSON-RPC dispatch) for LLM-initiated tool calls.
        // Cast needed because our SessionOptions uses a portable shape that
        // doesn't carry the SDK's discriminated-union literal types.
        ...(options.mcpServers && Object.keys(options.mcpServers).length > 0
          ? {
              mcpServers: options.mcpServers as Record<
                string,
                import('@github/copilot-sdk').MCPServerConfig
              >,
            }
          : {}),
        // Forward SDK hooks for tool-call visibility (FR-021, FR-022).
        ...(options.hooks ? { hooks: options.hooks } : {}),
      };

      const sdkSession = await sdkClient.createSession(sessionConfig);

      const history: CopilotMessage[] = [];

      return {
        send(message: CopilotMessage): AsyncIterable<SofiaEvent> {
          history.push(message);

          // Return an AsyncIterable that bridges SDK events → SofiaEvents.
          // We use `sendAndWait` which blocks until the assistant is idle
          // and then yield the complete response as a single TextDelta,
          // keeping the same contract the fake client provides.
          return {
            async *[Symbol.asyncIterator]() {
              const response = await sdkSession.sendAndWait(
                { prompt: message.content },
                120_000, // 2-minute timeout
              );

              const content = response?.data.content ?? '';
              if (content) {
                const assistantMsg: CopilotMessage = {
                  role: 'assistant',
                  content,
                };
                history.push(assistantMsg);
                yield createTextDeltaEvent(content);
              }
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
