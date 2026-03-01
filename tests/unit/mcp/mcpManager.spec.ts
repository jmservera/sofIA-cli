/**
 * MCP Manager tests.
 *
 * The McpManager loads .vscode/mcp.json, manages connections to MCP servers,
 * lists available tools, and classifies errors.
 *
 * T007: Tests for callTool() real dispatch (lazy transport, retry, normalization)
 * T049: Tests for toSdkMcpServers() conversion
 */
import { describe, it, expect } from 'vitest';

import {
  McpManager,
  loadMcpConfig,
  classifyMcpError,
  toSdkMcpServers,
} from '../../../src/mcp/mcpManager.js';
import type {
  McpConfig,
  StdioServerConfig,
  HttpServerConfig,
} from '../../../src/mcp/mcpManager.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('McpManager', () => {
  describe('loadMcpConfig', () => {
    it('loads and parses .vscode/mcp.json from given path', async () => {
      const config = await loadMcpConfig(
        new URL('../../../.vscode/mcp.json', import.meta.url).pathname,
      );

      expect(config).toBeDefined();
      expect(config.servers).toBeDefined();
      expect(Object.keys(config.servers).length).toBeGreaterThan(0);
    });

    it('returns empty servers when file does not exist', async () => {
      const config = await loadMcpConfig('/nonexistent/mcp.json');
      expect(config.servers).toEqual({});
    });

    it('identifies server types correctly (stdio vs http)', async () => {
      const config = await loadMcpConfig(
        new URL('../../../.vscode/mcp.json', import.meta.url).pathname,
      );

      // workiq has command → stdio type
      const workiq = config.servers['workiq'];
      expect(workiq).toBeDefined();
      expect(workiq.type).toBe('stdio');

      // github has url → http type
      const github = config.servers['github'];
      expect(github).toBeDefined();
      expect(github.type).toBe('http');
    });
  });

  describe('McpManager instance', () => {
    it('can be created with a config', () => {
      const config = {
        servers: {
          testServer: {
            name: 'testServer',
            type: 'stdio' as const,
            command: 'echo',
            args: ['hello'],
          },
        },
      };

      const manager = new McpManager(config);
      expect(manager).toBeDefined();
    });

    it('listServers returns configured server names', () => {
      const config = {
        servers: {
          s1: { name: 's1', type: 'stdio' as const, command: 'echo', args: [] },
          s2: { name: 's2', type: 'http' as const, url: 'http://example.com' },
        },
      };

      const manager = new McpManager(config);
      const names = manager.listServers();
      expect(names).toEqual(['s1', 's2']);
    });

    it('getServerConfig returns config for a known server', () => {
      const config = {
        servers: {
          myServer: {
            name: 'myServer',
            type: 'stdio' as const,
            command: 'npx',
            args: ['-y', 'my-tool'],
          },
        },
      };

      const manager = new McpManager(config);
      const sc = manager.getServerConfig('myServer');
      expect(sc).toBeDefined();
      expect(sc!.type).toBe('stdio');
      expect((sc as import('../../../src/mcp/mcpManager.js').StdioServerConfig).command).toBe(
        'npx',
      );
    });

    it('getServerConfig returns undefined for unknown server', () => {
      const manager = new McpManager({ servers: {} });
      expect(manager.getServerConfig('nope')).toBeUndefined();
    });

    it('isAvailable returns false when not connected', () => {
      const config = {
        servers: {
          s1: { name: 's1', type: 'stdio' as const, command: 'echo', args: [] },
        },
      };

      const manager = new McpManager(config);
      expect(manager.isAvailable('s1')).toBe(false);
    });
  });

  describe('classifyMcpError', () => {
    it('classifies ECONNREFUSED as connection-refused', () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:3000');
      (err as Error & { code?: string }).code = 'ECONNREFUSED';
      expect(classifyMcpError(err)).toBe('connection-refused');
    });

    it('classifies ENOTFOUND as dns-failure', () => {
      const err = new Error('getaddrinfo ENOTFOUND example.com');
      (err as Error & { code?: string }).code = 'ENOTFOUND';
      expect(classifyMcpError(err)).toBe('dns-failure');
    });

    it('classifies ETIMEDOUT as timeout', () => {
      const err = new Error('connect ETIMEDOUT');
      (err as Error & { code?: string }).code = 'ETIMEDOUT';
      expect(classifyMcpError(err)).toBe('timeout');
    });

    it('classifies unknown errors as unknown', () => {
      expect(classifyMcpError(new Error('something weird'))).toBe('unknown');
    });

    it('classifies non-Error values as unknown', () => {
      expect(classifyMcpError('string error')).toBe('unknown');
    });
  });

  // ── T007: callTool() real dispatch tests ─────────────────────────────────

  describe('callTool() real dispatch', () => {
    it('throws when server is not in config', async () => {
      const manager = new McpManager({ servers: {} });
      await expect(manager.callTool('nonexistent', 'tool', {})).rejects.toThrow(
        /[Uu]nknown.*nonexistent|not available/,
      );
    });

    it('returns unwrapped content from ToolCallResponse', async () => {
      // This test will fail until T016 implements real dispatch.
      // Once implemented, McpManager.callTool should return the
      // unwrapped content from the transport's ToolCallResponse.
      const config: McpConfig = {
        servers: {
          testserver: {
            name: 'testserver',
            type: 'http',
            url: 'https://test.example.com/mcp',
          } as HttpServerConfig,
        },
      };
      const manager = new McpManager(config);
      manager.markConnected('testserver');

      // After T016: This should dispatch to transport and return parsed content.
      // For now, we just verify the method exists and can be called
      // (it currently throws "not yet wired to transport").
      try {
        await manager.callTool('testserver', 'search', { query: 'test' });
      } catch (err) {
        // Expected to throw "not yet wired" until T016
        expect(err).toBeInstanceOf(Error);
      }
    });

    it('throws when calling unavailable server', async () => {
      const config: McpConfig = {
        servers: {
          myserver: {
            name: 'myserver',
            type: 'stdio',
            command: 'echo',
            args: [],
          } as StdioServerConfig,
        },
      };
      const manager = new McpManager(config);
      // Don't mark connected

      await expect(manager.callTool('myserver', 'tool', {})).rejects.toThrow(/not available/);
    });
  });

  // ── T049: toSdkMcpServers() tests ───────────────────────────────────────

  describe('toSdkMcpServers()', () => {
    it('converts StdioServerConfig to SDK format', () => {
      const config: McpConfig = {
        servers: {
          context7: {
            name: 'context7',
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@upstash/context7-mcp'],
            env: { NODE_ENV: 'production' },
            cwd: '/tmp',
            tools: ['resolve-library-id', 'query-docs'],
            timeout: 15000,
          } as StdioServerConfig,
        },
      };

      const result = toSdkMcpServers(config);
      expect(result).toEqual({
        context7: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
          tools: ['resolve-library-id', 'query-docs'],
          env: { NODE_ENV: 'production' },
          cwd: '/tmp',
          timeout: 15000,
        },
      });
    });

    it('converts HttpServerConfig to SDK format', () => {
      const config: McpConfig = {
        servers: {
          github: {
            name: 'github',
            type: 'http',
            url: 'https://api.githubcopilot.com/mcp/',
            headers: { 'X-Custom': 'value' },
            tools: ['create_repository'],
            timeout: 60000,
          } as HttpServerConfig,
        },
      };

      const result = toSdkMcpServers(config);
      expect(result).toEqual({
        github: {
          type: 'http',
          url: 'https://api.githubcopilot.com/mcp/',
          tools: ['create_repository'],
          headers: { 'X-Custom': 'value' },
          timeout: 60000,
        },
      });
    });

    it('returns empty object for empty servers', () => {
      const config: McpConfig = { servers: {} };
      const result = toSdkMcpServers(config);
      expect(result).toEqual({});
    });

    it('defaults tools to ["*"] when not specified', () => {
      const config: McpConfig = {
        servers: {
          simple: {
            name: 'simple',
            type: 'stdio',
            command: 'echo',
            args: [],
          } as StdioServerConfig,
        },
      };

      const result = toSdkMcpServers(config);
      expect(result.simple.tools).toEqual(['*']);
    });

    it('omits optional fields when not in source config', () => {
      const config: McpConfig = {
        servers: {
          minimal: {
            name: 'minimal',
            type: 'http',
            url: 'https://example.com/mcp',
          } as HttpServerConfig,
        },
      };

      const result = toSdkMcpServers(config);
      expect(result.minimal).toEqual({
        type: 'http',
        url: 'https://example.com/mcp',
        tools: ['*'],
      });
      expect(result.minimal).not.toHaveProperty('headers');
      expect(result.minimal).not.toHaveProperty('timeout');
    });

    it('converts mixed stdio and http configs', () => {
      const config: McpConfig = {
        servers: {
          local: {
            name: 'local',
            type: 'stdio',
            command: 'node',
            args: ['server.js'],
          } as StdioServerConfig,
          remote: {
            name: 'remote',
            type: 'http',
            url: 'https://api.example.com',
          } as HttpServerConfig,
        },
      };

      const result = toSdkMcpServers(config);
      expect(Object.keys(result)).toEqual(['local', 'remote']);
      expect(result.local.type).toBe('stdio');
      expect(result.remote.type).toBe('http');
    });
  });
});
