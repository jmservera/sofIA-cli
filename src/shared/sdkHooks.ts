/**
 * SDK hook factory for tool-call visibility and error handling.
 *
 * Creates Copilot SDK hooks that emit SofiaEvent activity events
 * for real-time CLI transparency (FR-021, FR-022) and token usage
 * tracking (FR-024).
 *
 * Usage:
 *   const hooks = createSdkHooks({ onEvent, spinner, logger });
 *   const onUsage = createUsageCallback({ onEvent, logger });
 *   await client.createSession({ systemPrompt, hooks, onUsage });
 */
import type { Logger } from 'pino';

import { createActivityEvent } from './events.js';
import type { SofiaEvent } from './events.js';
import type { ActivitySpinner } from './activitySpinner.js';
import type { SessionOptions } from './copilotClient.js';

// ── Types ────────────────────────────────────────────────────────────────────

type SdkHooks = NonNullable<SessionOptions['hooks']>;

export interface SdkHookFactoryOptions {
  /** Event emitter — receives Activity events for tool calls and errors. */
  onEvent: (event: SofiaEvent) => void;
  /** Optional spinner for visual tool-call feedback. */
  spinner?: ActivitySpinner;
  /** Optional pino logger — errors logged at warn, usage at debug. */
  logger?: Logger;
}

// ── Tool-call start timestamps (per tool name) ──────────────────────────────

const toolTimers = new Map<string, number>();

// ── Hook factory ─────────────────────────────────────────────────────────────

/**
 * Create SDK session hooks that emit tool-call visibility events (FR-021)
 * and centralize SDK-path error handling (FR-022).
 *
 * These hooks are forwarded to `createSession({ hooks })` so the SDK
 * fires them on every tool call during LLM conversation turns.
 */
export function createSdkHooks(options: SdkHookFactoryOptions): SdkHooks {
  const { onEvent, spinner, logger } = options;

  return {
    onPreToolUse: async (
      input: { toolName: string; toolArgs: unknown },
      _invocation: { sessionId: string },
    ) => {
      toolTimers.set(input.toolName, Date.now());

      onEvent(createActivityEvent(`tool:start ${input.toolName}`));
      spinner?.startToolCall(input.toolName);
    },

    onPostToolUse: async (
      input: { toolName: string; toolArgs: unknown; toolResult: unknown },
      _invocation: { sessionId: string },
    ) => {
      const startTime = toolTimers.get(input.toolName);
      const durationMs = startTime ? Date.now() - startTime : undefined;
      toolTimers.delete(input.toolName);

      const durationLabel = durationMs !== undefined ? ` (${durationMs}ms)` : '';
      onEvent(createActivityEvent(`tool:end ${input.toolName}${durationLabel}`));
      spinner?.completeToolCall(input.toolName, `done${durationLabel}`);
    },

    onErrorOccurred: async (
      input: { error: string; errorContext?: string; recoverable?: boolean },
      _invocation: { sessionId: string },
    ) => {
      const ctx = input.errorContext ? ` [${input.errorContext}]` : '';
      const message = `SDK error${ctx}: ${input.error}`;

      onEvent(createActivityEvent(message));
      logger?.warn({ error: input.error, context: input.errorContext, recoverable: input.recoverable }, message);
    },
  };
}

// ── Usage callback factory ───────────────────────────────────────────────────

/**
 * Create an `onUsage` callback for token usage tracking (FR-024).
 *
 * Emits an Activity event with usage data and optionally logs at debug level.
 */
export function createUsageCallback(
  options: Pick<SdkHookFactoryOptions, 'onEvent' | 'logger'>,
): NonNullable<SessionOptions['onUsage']> {
  const { onEvent, logger } = options;

  return (usage) => {
    const { model, inputTokens, outputTokens } = usage;
    const message = `Token usage [${model}]: ${inputTokens ?? 0} in / ${outputTokens ?? 0} out`;

    onEvent(createActivityEvent(message, { ...usage }));
    logger?.debug({ ...usage }, message);
  };
}
