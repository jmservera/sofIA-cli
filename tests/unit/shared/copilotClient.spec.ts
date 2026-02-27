/**
 * Unit tests for CopilotClient abstraction.
 */
import { describe, it, expect } from 'vitest';

import {
  createFakeCopilotClient,
} from '../../../src/shared/copilotClient.js';

describe('CopilotClient', () => {
  it('createFakeCopilotClient returns a client', () => {
    const client = createFakeCopilotClient([{ role: 'assistant', content: 'Hello!' }]);
    expect(client).toBeDefined();
    expect(typeof client.createSession).toBe('function');
  });

  it('fake client session sends messages and gets responses', async () => {
    const client = createFakeCopilotClient([{ role: 'assistant', content: 'I understand.' }]);
    const session = await client.createSession({ systemPrompt: 'You are a facilitator.' });
    const events: string[] = [];
    for await (const event of session.send({ role: 'user', content: 'Tell me about AI' })) {
      if (event.type === 'TextDelta') {
        events.push(event.text);
      }
    }
    expect(events.join('')).toBe('I understand.');
  });

  it('fake client supports multi-turn conversation', async () => {
    const client = createFakeCopilotClient([
      { role: 'assistant', content: 'First response' },
      { role: 'assistant', content: 'Second response' },
    ]);
    const session = await client.createSession({ systemPrompt: 'Test' });

    const first: string[] = [];
    for await (const event of session.send({ role: 'user', content: 'Turn 1' })) {
      if (event.type === 'TextDelta') first.push(event.text);
    }
    expect(first.join('')).toBe('First response');

    const second: string[] = [];
    for await (const event of session.send({ role: 'user', content: 'Turn 2' })) {
      if (event.type === 'TextDelta') second.push(event.text);
    }
    expect(second.join('')).toBe('Second response');
  });

  it('fake client can simulate tool calls', async () => {
    const client = createFakeCopilotClient([
      { role: 'assistant', content: 'Let me search for that.' },
    ], {
      tools: [{ name: 'web.search', description: 'Search the web' }],
    });
    const session = await client.createSession({ systemPrompt: 'Test' });
    expect(session).toBeDefined();
  });
});
