export type TextDeltaEvent = { type: 'text-delta'; content: string };
export type ToolCallEvent = { type: 'tool-call'; id: string; name: string; args: Record<string, unknown> };
export type ToolResultEvent = { type: 'tool-result'; id: string; result: unknown };
export type PhaseChangedEvent = { type: 'phase-changed'; phase: string };
export type ErrorEvent = { type: 'error'; error: Error };

export type ConversationEvent =
  | TextDeltaEvent
  | ToolCallEvent
  | ToolResultEvent
  | PhaseChangedEvent
  | ErrorEvent;

export type ActivityEvent = { kind: 'progress' | 'warning' | 'error'; message: string; data?: any };
