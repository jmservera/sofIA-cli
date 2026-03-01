/**
 * T006: Unit tests for retryPolicy.
 *
 * Verifies:
 * - withRetry retries once on connection-refused
 * - withRetry retries once on timeout
 * - withRetry does NOT retry on auth-failure
 * - withRetry does NOT retry on unknown error
 * - Applies ±20% jitter to initial delay
 * - Logs warn on retry attempt
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { withRetry, isRetryable, classifyMcpError } from '../../../src/mcp/retryPolicy.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeLogger(): import('pino').Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'silent',
  } as unknown as import('pino').Logger;
}

function makeConnRefusedError(): Error {
  const err = new Error('connect ECONNREFUSED 127.0.0.1:3000');
  (err as NodeJS.ErrnoException).code = 'ECONNREFUSED';
  return err;
}

function makeTimeoutError(): Error {
  const err = new Error('connect ETIMEDOUT');
  (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
  return err;
}

function makeDnsError(): Error {
  const err = new Error('getaddrinfo ENOTFOUND example.com');
  (err as NodeJS.ErrnoException).code = 'ENOTFOUND';
  return err;
}

function makeAuthError(): Error {
  const err = new Error('401 Unauthorized');
  (err as NodeJS.ErrnoException).code = 'ERR_TLS_CERT_ALTNAME_INVALID';
  return err;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('withRetry()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result when fn succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, {
      serverName: 'test',
      toolName: 'tool',
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries once on connection-refused and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeConnRefusedError())
      .mockResolvedValueOnce('recovered');

    const logger = makeLogger();
    const resultPromise = withRetry(fn, {
      serverName: 'ctx7',
      toolName: 'resolve',
      initialDelayMs: 100,
      logger,
    });

    // Advance past the delay
    await vi.advanceTimersByTimeAsync(200);

    const result = await resultPromise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries once on timeout and succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(makeTimeoutError()).mockResolvedValueOnce('ok');

    const resultPromise = withRetry(fn, {
      serverName: 'github',
      toolName: 'create_repo',
      initialDelayMs: 100,
    });

    await vi.advanceTimersByTimeAsync(200);
    const result = await resultPromise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries once on dns-failure and succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(makeDnsError()).mockResolvedValueOnce('resolved');

    const resultPromise = withRetry(fn, {
      serverName: 'remote',
      toolName: 'call',
      initialDelayMs: 100,
    });

    await vi.advanceTimersByTimeAsync(200);
    const result = await resultPromise;

    expect(result).toBe('resolved');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on auth-failure — throws immediately', async () => {
    const fn = vi.fn().mockRejectedValue(makeAuthError());

    await expect(
      withRetry(fn, {
        serverName: 'github',
        toolName: 'create_repo',
        initialDelayMs: 100,
      }),
    ).rejects.toThrow('401 Unauthorized');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on unknown error — throws immediately', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('something unexpected'));

    await expect(
      withRetry(fn, {
        serverName: 'test',
        toolName: 'tool',
        initialDelayMs: 100,
      }),
    ).rejects.toThrow('something unexpected');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws the second error when retry also fails', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeConnRefusedError())
      .mockRejectedValueOnce(new Error('second failure'));

    // Attach the rejection handler immediately to avoid unhandled rejection warning
    const resultPromise = withRetry(fn, {
      serverName: 'test',
      toolName: 'tool',
      initialDelayMs: 100,
    }).catch((err: unknown) => err);

    await vi.advanceTimersByTimeAsync(200);

    const err = await resultPromise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('second failure');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('logs warn on retry attempt with server, tool, attempt, delayMs, errorClass', async () => {
    const fn = vi.fn().mockRejectedValueOnce(makeConnRefusedError()).mockResolvedValueOnce('ok');
    const logger = makeLogger();

    const resultPromise = withRetry(fn, {
      serverName: 'context7',
      toolName: 'resolve-library-id',
      initialDelayMs: 1000,
      logger,
    });

    await vi.advanceTimersByTimeAsync(1500);
    await resultPromise;

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const warnCall = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    const logObj = warnCall[0] as Record<string, unknown>;
    expect(logObj).toHaveProperty('server', 'context7');
    expect(logObj).toHaveProperty('tool', 'resolve-library-id');
    expect(logObj).toHaveProperty('attempt', 1);
    expect(logObj).toHaveProperty('delayMs');
    expect(logObj).toHaveProperty('errorClass', 'connection-refused');
  });

  it('applies ±20% jitter to delay', async () => {
    // We'll override Math.random to test jitter boundaries
    const originalRandom = Math.random;

    // First test: random = 0 → jitter factor = 1 + (0*2-1)*0.2 = 0.8
    Math.random = () => 0;
    const fn1 = vi.fn().mockRejectedValueOnce(makeConnRefusedError()).mockResolvedValueOnce('ok');
    const logger1 = makeLogger();

    const p1 = withRetry(fn1, {
      serverName: 'test',
      toolName: 'tool',
      initialDelayMs: 1000,
      jitter: 0.2,
      logger: logger1,
    });
    await vi.advanceTimersByTimeAsync(1500);
    await p1;

    const delay1 = (
      (logger1.warn as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    ).delayMs as number;
    expect(delay1).toBe(800); // 1000 * 0.8

    // Second test: random = 1 → jitter factor = 1 + (1*2-1)*0.2 = 1.2
    Math.random = () => 1;
    const fn2 = vi.fn().mockRejectedValueOnce(makeConnRefusedError()).mockResolvedValueOnce('ok');
    const logger2 = makeLogger();

    const p2 = withRetry(fn2, {
      serverName: 'test',
      toolName: 'tool',
      initialDelayMs: 1000,
      jitter: 0.2,
      logger: logger2,
    });
    await vi.advanceTimersByTimeAsync(1500);
    await p2;

    const delay2 = (
      (logger2.warn as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>
    ).delayMs as number;
    expect(delay2).toBe(1200); // 1000 * 1.2

    Math.random = originalRandom;
  });
});

describe('isRetryable()', () => {
  it('returns true for connection-refused', () => {
    expect(isRetryable(makeConnRefusedError())).toBe(true);
  });

  it('returns true for timeout', () => {
    expect(isRetryable(makeTimeoutError())).toBe(true);
  });

  it('returns true for dns-failure', () => {
    expect(isRetryable(makeDnsError())).toBe(true);
  });

  it('returns false for auth-failure', () => {
    expect(isRetryable(makeAuthError())).toBe(false);
  });

  it('returns false for unknown error', () => {
    expect(isRetryable(new Error('random'))).toBe(false);
  });
});

describe('classifyMcpError (re-export)', () => {
  it('classifies ECONNREFUSED as connection-refused', () => {
    expect(classifyMcpError(makeConnRefusedError())).toBe('connection-refused');
  });
});
