/**
 * MCP Manager tests.
 *
 * The McpManager loads .vscode/mcp.json, manages connections to MCP servers,
 * lists available tools, and classifies errors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  McpManager,
  type McpServerConfig,
  loadMcpConfig,
  classifyMcpError,
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
      expect(sc!.command).toBe('npx');
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
      (err as any).code = 'ECONNREFUSED';
      expect(classifyMcpError(err)).toBe('connection-refused');
    });

    it('classifies ENOTFOUND as dns-failure', () => {
      const err = new Error('getaddrinfo ENOTFOUND example.com');
      (err as any).code = 'ENOTFOUND';
      expect(classifyMcpError(err)).toBe('dns-failure');
    });

    it('classifies ETIMEDOUT as timeout', () => {
      const err = new Error('connect ETIMEDOUT');
      (err as any).code = 'ETIMEDOUT';
      expect(classifyMcpError(err)).toBe('timeout');
    });

    it('classifies unknown errors as unknown', () => {
      expect(classifyMcpError(new Error('something weird'))).toBe('unknown');
    });

    it('classifies non-Error values as unknown', () => {
      expect(classifyMcpError('string error')).toBe('unknown');
    });
  });
});
