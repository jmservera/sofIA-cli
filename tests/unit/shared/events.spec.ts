/**
 * Unit tests for event model.
 */
import { describe, it, expect } from 'vitest';

import {
  createTextDeltaEvent,
  createActivityEvent,
  createToolCallEvent,
  createToolResultEvent,
  createPhaseChangedEvent,
  createErrorEvent,
  type SofiaEvent,
} from '../../../src/shared/events.js';

describe('event model', () => {
  it('createTextDeltaEvent creates a valid event', () => {
    const event = createTextDeltaEvent('Hello ');
    expect(event.type).toBe('TextDelta');
    expect(event.text).toBe('Hello ');
    expect(event.timestamp).toBeTruthy();
  });

  it('createActivityEvent creates a valid event', () => {
    const event = createActivityEvent('Connecting to MCP...');
    expect(event.type).toBe('Activity');
    expect(event.message).toBe('Connecting to MCP...');
  });

  it('createToolCallEvent includes tool name and args', () => {
    const event = createToolCallEvent('web.search', { query: 'AI trends' });
    expect(event.type).toBe('ToolCall');
    expect(event.toolName).toBe('web.search');
    expect(event.args).toEqual({ query: 'AI trends' });
  });

  it('createToolResultEvent includes tool name and result', () => {
    const event = createToolResultEvent('web.search', { results: [] });
    expect(event.type).toBe('ToolResult');
    expect(event.toolName).toBe('web.search');
  });

  it('createPhaseChangedEvent includes old and new phase', () => {
    const event = createPhaseChangedEvent('Discover', 'Ideate');
    expect(event.type).toBe('PhaseChanged');
    expect(event.fromPhase).toBe('Discover');
    expect(event.toPhase).toBe('Ideate');
  });

  it('createErrorEvent includes code and message', () => {
    const event = createErrorEvent('MCP_TIMEOUT', 'WorkIQ timed out');
    expect(event.type).toBe('Error');
    expect(event.code).toBe('MCP_TIMEOUT');
    expect(event.message).toBe('WorkIQ timed out');
  });

  it('all events have a timestamp', () => {
    const events: SofiaEvent[] = [
      createTextDeltaEvent('x'),
      createActivityEvent('y'),
      createToolCallEvent('t', {}),
      createToolResultEvent('t', {}),
      createPhaseChangedEvent('Discover', 'Ideate'),
      createErrorEvent('E', 'msg'),
    ];
    for (const e of events) {
      expect(e.timestamp).toBeTruthy();
      expect(typeof e.timestamp).toBe('string');
    }
  });
});
