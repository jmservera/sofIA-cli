/**
 * Unit tests for CopilotClient abstraction.
 *
 * T050: SDK mcpServers forwarding
 * T052: SDK hooks integration
 */
import { describe, it, expect, vi } from 'vitest';

import { createFakeCopilotClient } from '../../../src/shared/copilotClient.js';
import type { SessionOptions } from '../../../src/shared/copilotClient.js';

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
    const client = createFakeCopilotClient(
      [{ role: 'assistant', content: 'Let me search for that.' }],
      {
        tools: [{ name: 'web.search', description: 'Search the web' }],
      },
    );
    const session = await client.createSession({ systemPrompt: 'Test' });
    expect(session).toBeDefined();
  });

  // ── T050: SessionOptions.mcpServers forwarding ──────────────────────────

  describe('SessionOptions.mcpServers (T050)', () => {
    it('accepts mcpServers as a Record and forwards to createSession', async () => {
      const mcpServers: SessionOptions['mcpServers'] = {
        github: {
          type: 'http',
          url: 'https://api.githubcopilot.com/mcp/',
          tools: ['search_repositories'],
          timeout: 60_000,
        },
        context7: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
          tools: ['resolve-library-id', 'query-docs'],
        },
      };

      // Spy on createSession to capture the options passed
      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'OK' }]);
      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      const session = await client.createSession({
        systemPrompt: 'Test',
        mcpServers,
      });

      expect(createSessionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: expect.objectContaining({
            github: expect.objectContaining({
              type: 'http',
              url: 'https://api.githubcopilot.com/mcp/',
            }),
            context7: expect.objectContaining({ type: 'stdio', command: 'npx' }),
          }),
        }),
      );
      expect(session).toBeDefined();
    });

    it('does not include mcpServers when omitted', async () => {
      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'OK' }]);
      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      await client.createSession({ systemPrompt: 'Test' });

      const passedOpts = createSessionSpy.mock.calls[0][0] as SessionOptions;
      expect(passedOpts.mcpServers).toBeUndefined();
    });

    it('does not include mcpServers when empty object', async () => {
      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'OK' }]);
      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      await client.createSession({ systemPrompt: 'Test', mcpServers: {} });

      const passedOpts = createSessionSpy.mock.calls[0][0] as SessionOptions;
      expect(passedOpts.mcpServers).toEqual({});
    });
  });

  // ── T052: SDK hooks integration ─────────────────────────────────────────

  describe('SessionOptions hooks (T052)', () => {
    it('accepts a hooks object with onPreToolUse and onPostToolUse callbacks', async () => {
      const hooks: SessionOptions['hooks'] = {
        onPreToolUse: vi.fn(),
        onPostToolUse: vi.fn(),
        onErrorOccurred: vi.fn(),
      };

      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'OK' }]);
      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      await client.createSession({
        systemPrompt: 'Test',
        hooks,
      });

      const passedOpts = createSessionSpy.mock.calls[0][0] as SessionOptions;
      expect(passedOpts.hooks).toBeDefined();
      expect(passedOpts.hooks!.onPreToolUse).toBe(hooks!.onPreToolUse);
      expect(passedOpts.hooks!.onPostToolUse).toBe(hooks!.onPostToolUse);
      expect(passedOpts.hooks!.onErrorOccurred).toBe(hooks!.onErrorOccurred);
    });

    it('does not include hooks when omitted', async () => {
      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([{ role: 'assistant', content: 'OK' }]);
      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      await client.createSession({ systemPrompt: 'Test' });

      const passedOpts = createSessionSpy.mock.calls[0][0] as SessionOptions;
      expect(passedOpts.hooks).toBeUndefined();
    });
  });
});
