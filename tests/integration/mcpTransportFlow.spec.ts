/**
 * T011: Integration test for MCP transport flow.
 *
 * Spawns a minimal JSON-RPC echo server as a child process, verifies that
 * StdioMcpTransport can connect and round-trip a `tools/call` request,
 * and verifies McpManager.callTool() dispatches through StdioMcpTransport
 * for stdio config.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import pino from 'pino';

import { StdioMcpTransport } from '../../src/mcp/mcpTransport.js';
import { McpManager } from '../../src/mcp/mcpManager.js';
import type { McpConfig, StdioServerConfig } from '../../src/mcp/mcpManager.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const silentLogger = pino({ level: 'silent' });

/**
 * Minimal JSON-RPC echo server script.
 * Handles `initialize` handshake and echoes `tools/call` params back.
 */
const ECHO_SERVER_SCRIPT = `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  if (msg.method === 'initialize') {
    const response = {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'echo-server', version: '0.1.0' },
      },
    };
    process.stdout.write(JSON.stringify(response) + '\\n');
    return;
  }

  if (msg.method === 'tools/call') {
    const result = {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(msg.params) }],
      },
    };
    process.stdout.write(JSON.stringify(result) + '\\n');
    return;
  }
});
`;

let tmpDir: string | undefined;

async function createEchoServer(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'mcp-echo-'));
  const scriptPath = join(tmpDir, 'echo-server.js');
  await writeFile(scriptPath, ECHO_SERVER_SCRIPT, 'utf-8');
  return scriptPath;
}

function makeStdioConfig(name: string, scriptPath: string): StdioServerConfig {
  return {
    name,
    type: 'stdio' as const,
    command: 'node',
    args: [scriptPath],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MCP Transport Flow (integration)', () => {
  let transport: StdioMcpTransport | undefined;
  let manager: McpManager | undefined;

  afterEach(async () => {
    if (transport?.isConnected()) {
      await transport.disconnect().catch(() => {});
    }
    transport = undefined;

    if (manager) {
      await manager.disconnectAll().catch(() => {});
    }
    manager = undefined;

    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      tmpDir = undefined;
    }
  });

  it('StdioMcpTransport connects and round-trips a tools/call request', async () => {
    const scriptPath = await createEchoServer();

    transport = new StdioMcpTransport(makeStdioConfig('echo-test', scriptPath), silentLogger);

    await transport.connect();
    expect(transport.isConnected()).toBe(true);

    const response = await transport.callTool('test-tool', { greeting: 'hello' }, 10_000);

    expect(response.content).toBeDefined();

    const content =
      typeof response.content === 'string'
        ? (JSON.parse(response.content) as Record<string, unknown>)
        : response.content;

    expect(content).toHaveProperty('name', 'test-tool');
    expect(content).toHaveProperty('arguments');
    const args = content.arguments as Record<string, unknown>;
    expect(args).toHaveProperty('greeting', 'hello');

    await transport.disconnect();
    expect(transport.isConnected()).toBe(false);
  }, 15_000);

  it('McpManager.callTool() dispatches through StdioMcpTransport for stdio config', async () => {
    const scriptPath = await createEchoServer();

    const config: McpConfig = {
      servers: {
        'echo-server': makeStdioConfig('echo-server', scriptPath),
      },
    };
    manager = new McpManager(config, silentLogger);
    manager.markConnected('echo-server');

    const result = await manager.callTool(
      'echo-server',
      'ping-tool',
      { message: 'pong' },
      { timeoutMs: 10_000 },
    );

    expect(result).toBeDefined();
    expect(result).toHaveProperty('name', 'ping-tool');
    expect(result).toHaveProperty('arguments');
    const args = result.arguments as Record<string, unknown>;
    expect(args).toHaveProperty('message', 'pong');
  }, 15_000);

  it('echo server round-trips multiple sequential calls', async () => {
    const scriptPath = await createEchoServer();

    transport = new StdioMcpTransport(makeStdioConfig('echo-multi', scriptPath), silentLogger);

    await transport.connect();

    const r1 = await transport.callTool('tool-a', { n: 1 }, 10_000);
    const c1 =
      typeof r1.content === 'string'
        ? (JSON.parse(r1.content) as Record<string, unknown>)
        : r1.content;
    expect((c1.arguments as Record<string, unknown>).n).toBe(1);

    const r2 = await transport.callTool('tool-b', { n: 2 }, 10_000);
    const c2 =
      typeof r2.content === 'string'
        ? (JSON.parse(r2.content) as Record<string, unknown>)
        : r2.content;
    expect((c2.arguments as Record<string, unknown>).n).toBe(2);

    await transport.disconnect();
  }, 15_000);
});
