/**
 * MCP Retry Policy.
 *
 * Provides `withRetry<T>()` to wrap async MCP operations with a single-retry
 * policy for transient errors (connection-refused, timeout, dns-failure).
 *
 * Auth failures and unknown errors are NOT retried.
 */
import type { Logger } from 'pino';

import { classifyMcpError } from './mcpManager.js';
import type { McpErrorClass } from './mcpManager.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** MCP server name (for logging). */
  serverName: string;
  /** Tool name (for logging). */
  toolName: string;
  /** Initial delay in ms before retry. Default: 1000. */
  initialDelayMs?: number;
  /** Jitter fraction (0–1). Default: 0.2 (±20%). */
  jitter?: number;
  /** Logger for retry warnings. */
  logger?: Logger;
}

// ── Retryable error classes ──────────────────────────────────────────────────

const RETRYABLE_CLASSES: Set<McpErrorClass> = new Set([
  'connection-refused',
  'timeout',
  'dns-failure',
]);

/**
 * Determine if an error is transient and should be retried.
 */
function isRetryable(err: unknown): boolean {
  return RETRYABLE_CLASSES.has(classifyMcpError(err));
}

// ── withRetry ────────────────────────────────────────────────────────────────

/**
 * Wrap an async function with a single-retry policy for transient MCP errors.
 *
 * On transient error: waits `initialDelayMs ± jitter`, then calls fn() once more.
 * If the retry also fails, the second error is thrown (not the first).
 *
 * Non-retryable errors (auth-failure, unknown, validation) are thrown immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { serverName, toolName, initialDelayMs = 1000, jitter = 0.2, logger } = options;

  try {
    return await fn();
  } catch (firstError) {
    if (!isRetryable(firstError)) {
      throw firstError;
    }

    // Calculate delay with jitter: initialDelayMs * (1 ± jitter)
    const jitterFactor = 1 + (Math.random() * 2 - 1) * jitter;
    const delayMs = Math.round(initialDelayMs * jitterFactor);
    const errorClass = classifyMcpError(firstError);

    logger?.warn(
      { server: serverName, tool: toolName, attempt: 1, delayMs, errorClass },
      `MCP transient error — retrying after ${delayMs}ms`,
    );

    await sleep(delayMs);

    // Second attempt — if this fails, its error is thrown
    return await fn();
  }
}

/** Internal sleep helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-export for convenience
export { classifyMcpError, isRetryable };
