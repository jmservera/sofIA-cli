/**
 * Internal event model for sofia CLI.
 *
 * Adapts Copilot SDK events into a stable internal model for the
 * ConversationLoop, streaming renderer, and telemetry.
 */

export type SofiaEventType =
  | 'TextDelta'
  | 'Activity'
  | 'ToolCall'
  | 'ToolResult'
  | 'PhaseChanged'
  | 'Error';

export interface BaseSofiaEvent {
  type: SofiaEventType;
  timestamp: string;
}

export interface TextDeltaEvent extends BaseSofiaEvent {
  type: 'TextDelta';
  text: string;
}

export interface ActivityEvent extends BaseSofiaEvent {
  type: 'Activity';
  message: string;
  data?: Record<string, unknown>;
}

export interface ToolCallEvent extends BaseSofiaEvent {
  type: 'ToolCall';
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResultEvent extends BaseSofiaEvent {
  type: 'ToolResult';
  toolName: string;
  result: unknown;
}

export interface PhaseChangedEvent extends BaseSofiaEvent {
  type: 'PhaseChanged';
  fromPhase: string;
  toPhase: string;
}

export interface ErrorEvent extends BaseSofiaEvent {
  type: 'Error';
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type SofiaEvent =
  | TextDeltaEvent
  | ActivityEvent
  | ToolCallEvent
  | ToolResultEvent
  | PhaseChangedEvent
  | ErrorEvent;

// ── Factory functions ────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

export function createTextDeltaEvent(text: string): TextDeltaEvent {
  return { type: 'TextDelta', timestamp: now(), text };
}

export function createActivityEvent(
  message: string,
  data?: Record<string, unknown>,
): ActivityEvent {
  return { type: 'Activity', timestamp: now(), message, data };
}

export function createToolCallEvent(
  toolName: string,
  args: Record<string, unknown>,
): ToolCallEvent {
  return { type: 'ToolCall', timestamp: now(), toolName, args };
}

export function createToolResultEvent(toolName: string, result: unknown): ToolResultEvent {
  return { type: 'ToolResult', timestamp: now(), toolName, result };
}

export function createPhaseChangedEvent(fromPhase: string, toPhase: string): PhaseChangedEvent {
  return { type: 'PhaseChanged', timestamp: now(), fromPhase, toPhase };
}

export function createErrorEvent(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ErrorEvent {
  return { type: 'Error', timestamp: now(), code, message, details };
}
