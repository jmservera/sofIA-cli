/**
 * Tests for SDK hook factory (FR-021, FR-022, FR-024).
 *
 * Verifies that createSdkHooks() produces hooks that emit
 * activity events for tool call visibility and error logging.
 */
import { describe, it, expect, vi } from 'vitest';

import { createSdkHooks, createUsageCallback } from '../../../src/shared/sdkHooks.js';
import type { SofiaEvent } from '../../../src/shared/events.js';

describe('createSdkHooks (FR-021, FR-022)', () => {
  it('onPreToolUse emits tool:start activity event', async () => {
    const events: SofiaEvent[] = [];
    const hooks = createSdkHooks({
      onEvent: (e) => events.push(e),
    });

    await hooks.onPreToolUse!(
      { toolName: 'mcp_github_search', toolArgs: { query: 'test' } },
      { sessionId: 'sess-1' },
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('Activity');
    expect((events[0] as { message: string }).message).toContain('mcp_github_search');
  });

  it('onPostToolUse emits tool:end activity event with duration', async () => {
    const events: SofiaEvent[] = [];
    const hooks = createSdkHooks({
      onEvent: (e) => events.push(e),
    });

    // Simulate pre then post with slight delay
    await hooks.onPreToolUse!(
      { toolName: 'context7_search', toolArgs: {} },
      { sessionId: 'sess-1' },
    );
    events.length = 0; // clear pre event

    await hooks.onPostToolUse!(
      { toolName: 'context7_search', toolArgs: {}, toolResult: { ok: true } },
      { sessionId: 'sess-1' },
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('Activity');
    expect((events[0] as { message: string }).message).toContain('context7_search');
  });

  it('onErrorOccurred emits error activity event and logs at warn level', async () => {
    const events: SofiaEvent[] = [];
    const warnSpy = vi.fn();
    const hooks = createSdkHooks({
      onEvent: (e) => events.push(e),
      logger: { warn: warnSpy } as unknown as import('pino').Logger,
    });

    await hooks.onErrorOccurred!(
      { error: 'MCP server timeout', errorContext: 'tool:github_search', recoverable: true },
      { sessionId: 'sess-1' },
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('Activity');
    expect((events[0] as { message: string }).message).toContain('MCP server timeout');
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('works without optional logger', async () => {
    const events: SofiaEvent[] = [];
    const hooks = createSdkHooks({ onEvent: (e) => events.push(e) });

    // Should not throw even without logger
    await hooks.onErrorOccurred!(
      { error: 'timeout' },
      { sessionId: 'sess-1' },
    );

    expect(events).toHaveLength(1);
  });

  it('hooks wire to spinner when provided', async () => {
    const events: SofiaEvent[] = [];
    const spinnerStart = vi.fn();
    const spinnerComplete = vi.fn();

    const hooks = createSdkHooks({
      onEvent: (e) => events.push(e),
      spinner: {
        startToolCall: spinnerStart,
        completeToolCall: spinnerComplete,
      } as unknown as import('../../../src/shared/activitySpinner.js').ActivitySpinner,
    });

    await hooks.onPreToolUse!(
      { toolName: 'my_tool', toolArgs: {} },
      { sessionId: 'sess-1' },
    );
    expect(spinnerStart).toHaveBeenCalledWith('my_tool');

    await hooks.onPostToolUse!(
      { toolName: 'my_tool', toolArgs: {}, toolResult: 'ok' },
      { sessionId: 'sess-1' },
    );
    expect(spinnerComplete).toHaveBeenCalledWith('my_tool', expect.any(String));
  });
});

describe('createUsageCallback (FR-024)', () => {
  it('invokes onEvent with usage data', () => {
    const events: SofiaEvent[] = [];
    const cb = createUsageCallback({ onEvent: (e) => events.push(e) });

    cb({
      model: 'gpt-4o',
      inputTokens: 1000,
      outputTokens: 200,
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('Activity');
    expect((events[0] as { message: string }).message).toContain('gpt-4o');
    expect((events[0] as { data?: Record<string, unknown> }).data).toEqual(
      expect.objectContaining({ model: 'gpt-4o', inputTokens: 1000, outputTokens: 200 }),
    );
  });

  it('logs at debug level when logger provided', () => {
    const debugSpy = vi.fn();
    const cb = createUsageCallback({
      onEvent: () => {},
      logger: { debug: debugSpy } as unknown as import('pino').Logger,
    });

    cb({ model: 'gpt-4o', inputTokens: 500, outputTokens: 100 });

    expect(debugSpy).toHaveBeenCalledOnce();
  });
});
