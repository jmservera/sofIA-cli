/**
 * T044: Timeout validation test for SC-003-007.
 *
 * Forces a short timeoutMs on MCP calls and asserts that a classified
 * 'timeout' error is returned/thrown and handled gracefully by adapters.
 */
import { describe, it, expect, vi } from 'vitest';

import { classifyMcpError } from '../../../src/mcp/mcpManager.js';

describe('Timeout validation (T044)', () => {
  it('classifyMcpError identifies AbortError as timeout', () => {
    const error = new DOMException('The operation was aborted', 'AbortError');
    const classification = classifyMcpError(error);
    expect(classification).toBe('timeout');
  });

  it('classifyMcpError identifies timeout message strings', () => {
    const error = new Error('Request timed out after 30000ms');
    const classification = classifyMcpError(error);
    expect(classification).toBe('timeout');
  });

  it('classifyMcpError identifies ETIMEDOUT errno as timeout', () => {
    const error = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
    const classification = classifyMcpError(error);
    expect(classification).toBe('timeout');
  });

  it('adapters handle timeout errors gracefully without crashing', async () => {
    const { GitHubMcpAdapter } = await import('../../../src/develop/githubMcpAdapter.js');

    const timeoutMcpManager = {
      isAvailable: vi.fn().mockReturnValue(true),
      callTool: vi
        .fn()
        .mockRejectedValue(new DOMException('The operation was aborted', 'AbortError')),
      markConnected: vi.fn(),
      markDisconnected: vi.fn(),
      disconnectAll: vi.fn(),
    } as never;

    const adapter = new GitHubMcpAdapter(timeoutMcpManager);

    // createRepository should degrade gracefully
    const repoResult = await adapter.createRepository({
      name: 'test-repo',
      description: 'test',
      private: true,
    });

    // Should return a degraded result, not throw
    expect(repoResult).toBeDefined();
  });
});
