import type { ConversationEvent, TextDeltaEvent, ToolCallEvent } from '../shared/events';

export interface ConversationLoopOptions {
  renderText: (chunk: string) => void;
  renderActivity: (evt: { kind: string; message: string; data?: any }) => void;
  onToolCall: (event: ToolCallEvent) => Promise<void> | void;
  onCancel?: () => void;
}

export interface ConversationLoopResult {
  output: string;
}

export class ConversationLoop {
  renderText: ConversationLoopOptions['renderText'];
  renderActivity: ConversationLoopOptions['renderActivity'];
  onToolCall: ConversationLoopOptions['onToolCall'];
  onCancel?: ConversationLoopOptions['onCancel'];

  constructor(opts: ConversationLoopOptions) {
    this.renderText = opts.renderText;
    this.renderActivity = opts.renderActivity;
    this.onToolCall = opts.onToolCall;
    this.onCancel = opts.onCancel;
  }

  async run(events: Iterable<ConversationEvent>, opts?: { signal?: AbortSignal }): Promise<ConversationLoopResult> {
    let output = '';
    const abortSignal = opts?.signal;

    let canceled = false;
    const callCancelOnce = () => {
      if (!canceled) {
        canceled = true;
        this.onCancel?.();
      }
    };

    for (const event of events) {
      if (abortSignal?.aborted) {
        callCancelOnce();
        throw new Error('Conversation aborted');
      }
      switch (event.type) {
        case 'text-delta': {
          const chunk = (event as TextDeltaEvent).content;
          output += chunk;
          this.renderText(chunk);
          break;
        }
        case 'tool-call': {
          const toolCall = event as ToolCallEvent;
          this.renderActivity({ kind: 'progress', message: `Tool called: ${toolCall.name}` });
          await this.onToolCall(toolCall);
          break;
        }
        case 'tool-result': {
          this.renderActivity({ kind: 'progress', message: 'Tool result received', data: (event as any).result });
          break;
        }
        case 'phase-changed': {
          this.renderActivity({ kind: 'progress', message: `Phase changed: ${(event as any).phase}` });
          break;
        }
        case 'error': {
          this.renderActivity({ kind: 'error', message: (event as any).error?.message ?? 'Unknown error' });
          throw (event as any).error ?? new Error('Unknown error');
        }
        default:
          this.renderActivity({ kind: 'warning', message: `Unhandled event ${(event as any).type}` });
      }
      // Allow microtasks (e.g., abort signal) to be processed
      await Promise.resolve();
      if (abortSignal?.aborted) {
        callCancelOnce();
        throw new Error('Conversation aborted');
      }
    }
    return { output };
  }
}
