// Thin wrapper around @github/copilot-sdk for testability. Real implementation will wire streaming events,
// ask-user prompts, and tool-calling. For tests we allow injecting fakes.

export interface CopilotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CopilotClient {
  streamConversation(messages: CopilotMessage[]): Iterable<any> | AsyncIterable<any>;
}

export const createCopilotClient = (opts: { scriptedEvents?: any[]; capture?: any[] } = {}): CopilotClient => {
  return {
    streamConversation(messages: CopilotMessage[]) {
      if (opts.capture) opts.capture.push(messages);
      return opts.scriptedEvents ?? [];
    },
  };
};
