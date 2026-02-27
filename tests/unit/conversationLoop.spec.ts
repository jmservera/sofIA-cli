import { describe, it, expect, vi } from 'vitest';
import { ConversationLoop } from '../../src/loop/conversationLoop';
import type { ToolCallEvent, TextDeltaEvent } from '../../src/shared/events';

const makeTextEvent = (content: string): TextDeltaEvent => ({ type: 'text-delta', content });
const makeToolCall = (id: string): ToolCallEvent => ({ type: 'tool-call', id, name: 'dummy', args: {} });

describe('ConversationLoop', () => {
  it('streams events in order and collects final text', async () => {
    const loop = new ConversationLoop({
      renderText: vi.fn(),
      renderActivity: vi.fn(),
      onToolCall: vi.fn(),
    });
    const events = [
      makeTextEvent('Hello'),
      makeTextEvent(' world'),
      makeToolCall('tool-1'),
      makeTextEvent('!'),
    ];
    const result = await loop.run(events[Symbol.iterator]());
    expect(loop.renderText).toHaveBeenCalledTimes(3);
    expect(loop.renderActivity).toHaveBeenCalledWith({ kind: 'progress', message: 'Tool called: dummy' });
    expect(result.output).toBe('Hello world!');
  });

  it('invokes cancel handler on Ctrl+C / abort', async () => {
    const onCancel = vi.fn();
    const loop = new ConversationLoop({
      renderText: vi.fn(),
      renderActivity: vi.fn(),
      onToolCall: vi.fn(),
      onCancel,
    });
    const events = [makeTextEvent('Starting...')];
    const controller = new AbortController();
    queueMicrotask(() => controller.abort());
    const result = await loop.run(events[Symbol.iterator](), { signal: controller.signal }).catch((e) => e);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(Error);
  });
});
