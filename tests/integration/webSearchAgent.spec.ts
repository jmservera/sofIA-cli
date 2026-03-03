/**
 * Integration test for ephemeral agent lifecycle (T022).
 *
 * Tests the full lifecycle: create → query → reuse → cleanup
 * using faked AIProjectClient to verify:
 * - Agent is created on first call
 * - Agent is reused on second call
 * - Agent is deleted on destroyWebSearchSession()
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  createWebSearchTool,
  destroyWebSearchSession,
} from '../../src/mcp/webSearch.js';
import type { AgentSessionDeps } from '../../src/mcp/webSearch.js';

function createFakeAgentDeps(): AgentSessionDeps & { callLog: string[] } {
  const callLog: string[] = [];

  return {
    callLog,
    createClient: vi.fn().mockImplementation(() => {
      callLog.push('createClient');
      return { id: 'client-1' };
    }),
    getOpenAIClient: vi.fn().mockImplementation(async () => {
      callLog.push('getOpenAIClient');
      return { id: 'openai-1' };
    }),
    createAgentVersion: vi.fn().mockImplementation(async () => {
      callLog.push('createAgent');
      return { name: 'sofia-web-search', version: 'v1' };
    }),
    deleteAgentVersion: vi.fn().mockImplementation(async () => {
      callLog.push('deleteAgent');
    }),
    createConversation: vi.fn().mockImplementation(async () => {
      callLog.push('createConversation');
      return { id: 'conv-abc' };
    }),
    deleteConversation: vi.fn().mockImplementation(async () => {
      callLog.push('deleteConversation');
    }),
    createResponse: vi.fn().mockImplementation(async () => {
      callLog.push('createResponse');
      return {
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: 'Search result text',
                annotations: [
                  {
                    type: 'url_citation',
                    url: 'https://example.com',
                    title: 'Example',
                    start_index: 0,
                    end_index: 18,
                  },
                ],
              },
            ],
          },
        ],
      };
    }),
  };
}

describe('ephemeral agent lifecycle (T022)', () => {
  afterEach(async () => {
    await destroyWebSearchSession();
  });

  it('creates agent on first call, reuses on second, cleans up on destroy', async () => {
    const deps = createFakeAgentDeps();
    const tool = createWebSearchTool({
      projectEndpoint: 'https://foundry.example.com',
      modelDeploymentName: 'gpt-4.1-mini',
    }, deps);

    // First call — should initialize
    const result1 = await tool('first query');
    expect(result1.results).toHaveLength(1);
    expect(deps.callLog).toEqual([
      'createClient',
      'getOpenAIClient',
      'createAgent',
      'createConversation',
      'createResponse',
    ]);

    // Second call — should reuse (no new agent creation)
    deps.callLog.length = 0;
    const result2 = await tool('second query');
    expect(result2.results).toHaveLength(1);
    expect(deps.callLog).toEqual(['createResponse']);

    // Cleanup — should delete conversation and agent
    deps.callLog.length = 0;
    await destroyWebSearchSession();
    expect(deps.callLog).toEqual(['deleteConversation', 'deleteAgent']);
  });

  it('transitions: uninitialized → initialized → cleaned up', async () => {
    const deps = createFakeAgentDeps();
    const tool = createWebSearchTool({
      projectEndpoint: 'https://foundry.example.com',
      modelDeploymentName: 'gpt-4.1-mini',
    }, deps);

    // State: uninitialized — destroy is a no-op
    await destroyWebSearchSession();
    expect(deps.deleteAgentVersion).not.toHaveBeenCalled();

    // State: initialized (after first query)
    await tool('init query');
    expect(deps.createAgentVersion).toHaveBeenCalledTimes(1);

    // State: cleaned up
    await destroyWebSearchSession();
    expect(deps.deleteAgentVersion).toHaveBeenCalledTimes(1);

    // Second destroy is a no-op
    await destroyWebSearchSession();
    expect(deps.deleteAgentVersion).toHaveBeenCalledTimes(1);
  });

  it('handles cleanup failure gracefully', async () => {
    const deps = createFakeAgentDeps();
    deps.deleteConversation = vi.fn().mockRejectedValue(new Error('404 Not Found'));
    deps.deleteAgentVersion = vi.fn().mockRejectedValue(new Error('500 Internal Error'));

    const tool = createWebSearchTool({
      projectEndpoint: 'https://foundry.example.com',
      modelDeploymentName: 'gpt-4.1-mini',
    }, deps);

    await tool('init');

    // Should not throw despite cleanup failures
    await expect(destroyWebSearchSession()).resolves.toBeUndefined();
  });
});
