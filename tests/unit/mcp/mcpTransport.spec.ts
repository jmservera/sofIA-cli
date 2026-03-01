/**
 * T004/T005: Unit tests for McpTransport implementations.
 *
 * Verifies:
 * - HttpMcpTransport: JSON-RPC framing, auth headers, timeout, error classification
 * - StdioMcpTransport: subprocess spawn, initialize handshake, pending request lifecycle
 * - createTransport() factory: creates correct implementation per config type
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter, Readable } from 'node:stream';

import {
  HttpMcpTransport,
  StdioMcpTransport,
  McpTransportError,
  createTransport,
} from '../../../src/mcp/mcpTransport.js';
import type { StdioServerConfig, HttpServerConfig } from '../../../src/mcp/mcpManager.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeLogger(): import('pino').Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'silent',
  } as unknown as import('pino').Logger;
}

function makeHttpConfig(overrides?: Partial<HttpServerConfig>): HttpServerConfig {
  return {
    name: 'test-http',
    type: 'http',
    url: 'https://api.example.com/mcp',
    ...overrides,
  };
}

function makeStdioConfig(overrides?: Partial<StdioServerConfig>): StdioServerConfig {
  return {
    name: 'test-stdio',
    type: 'stdio',
    command: 'node',
    args: ['server.js'],
    ...overrides,
  };
}

// ── HttpMcpTransport Tests (T004) ────────────────────────────────────────────

describe('HttpMcpTransport', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalToken: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalToken = process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalToken !== undefined) {
      process.env.GITHUB_TOKEN = originalToken;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  it('sends correct JSON-RPC tools/call framing', async () => {
    let capturedBody: unknown;
    globalThis.fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: '{"ok":true}' }] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const transport = new HttpMcpTransport(makeHttpConfig(), makeLogger());
    await transport.callTool('search', { query: 'test' }, 5000);

    expect(capturedBody).toEqual({
      jsonrpc: '2.0',
      id: expect.any(Number),
      method: 'tools/call',
      params: { name: 'search', arguments: { query: 'test' } },
    });
  });

  it('sets Authorization Bearer header from GITHUB_TOKEN', async () => {
    process.env.GITHUB_TOKEN = 'test-token-abc';
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      capturedHeaders = Object.fromEntries(Object.entries(init.headers as Record<string, string>));
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { data: 'ok' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const transport = new HttpMcpTransport(makeHttpConfig(), makeLogger());
    await transport.callTool('test-tool', {}, 5000);

    expect(capturedHeaders['Authorization']).toBe('Bearer test-token-abc');
  });

  it('does not set Authorization header when GITHUB_TOKEN is unset', async () => {
    delete process.env.GITHUB_TOKEN;
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      capturedHeaders = Object.fromEntries(Object.entries(init.headers as Record<string, string>));
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {},
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const transport = new HttpMcpTransport(makeHttpConfig(), makeLogger());
    await transport.callTool('test-tool', {}, 5000);

    expect(capturedHeaders['Authorization']).toBeUndefined();
  });

  it('throws McpTransportError with timeout classification on AbortController timeout', async () => {
    globalThis.fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      // Simulate slow server — wait for abort signal
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    }) as unknown as typeof fetch;

    const transport = new HttpMcpTransport(makeHttpConfig(), makeLogger());

    await expect(transport.callTool('slow-tool', {}, 50)).rejects.toThrow(McpTransportError);
    try {
      await transport.callTool('slow-tool', {}, 50);
    } catch (err) {
      expect(err).toBeInstanceOf(McpTransportError);
      expect((err as McpTransportError).serverName).toBe('test-http');
      expect((err as Error & { code?: string }).code).toBe('ETIMEDOUT');
    }
  });

  it('classifies HTTP 401 as auth-failure error', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('Unauthorized', { status: 401 });
    }) as unknown as typeof fetch;

    const transport = new HttpMcpTransport(makeHttpConfig(), makeLogger());

    await expect(transport.callTool('secure-tool', {}, 5000)).rejects.toThrow(McpTransportError);
    try {
      await transport.callTool('secure-tool', {}, 5000);
    } catch (err) {
      expect(err).toBeInstanceOf(McpTransportError);
      expect((err as McpTransportError).message).toContain('authentication failed');
    }
  });

  it('classifies HTTP 403 as auth-failure error', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('Forbidden', { status: 403 });
    }) as unknown as typeof fetch;

    const transport = new HttpMcpTransport(makeHttpConfig(), makeLogger());

    await expect(transport.callTool('forbidden-tool', {}, 5000)).rejects.toThrow(McpTransportError);
    try {
      await transport.callTool('forbidden-tool', {}, 5000);
    } catch (err) {
      expect(err).toBeInstanceOf(McpTransportError);
      expect((err as McpTransportError).message).toContain('authentication failed');
    }
  });

  it('throws McpTransportError on HTTP 5xx server error', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('Internal Server Error', { status: 500 });
    }) as unknown as typeof fetch;

    const transport = new HttpMcpTransport(makeHttpConfig(), makeLogger());

    await expect(transport.callTool('error-tool', {}, 5000)).rejects.toThrow(McpTransportError);
    try {
      await transport.callTool('error-tool', {}, 5000);
    } catch (err) {
      expect(err).toBeInstanceOf(McpTransportError);
      expect((err as McpTransportError).message).toContain('server error');
    }
  });

  it('throws McpTransportError on non-JSON response body', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('not json at all', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }) as unknown as typeof fetch;

    const transport = new HttpMcpTransport(makeHttpConfig(), makeLogger());

    await expect(transport.callTool('bad-format', {}, 5000)).rejects.toThrow(McpTransportError);
    try {
      await transport.callTool('bad-format', {}, 5000);
    } catch (err) {
      expect(err).toBeInstanceOf(McpTransportError);
      expect((err as McpTransportError).message).toContain('Non-JSON response');
    }
  });

  it('throws McpTransportError on JSON-RPC error in response', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32601, message: 'Method not found' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const transport = new HttpMcpTransport(makeHttpConfig(), makeLogger());

    await expect(transport.callTool('missing-tool', {}, 5000)).rejects.toThrow(McpTransportError);
    try {
      await transport.callTool('missing-tool', {}, 5000);
    } catch (err) {
      expect(err).toBeInstanceOf(McpTransportError);
      expect((err as McpTransportError).message).toContain('Method not found');
    }
  });

  it('extracts content from result.content[0].text', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: '{"found": true}' }] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const transport = new HttpMcpTransport(makeHttpConfig(), makeLogger());
    const response = await transport.callTool('search', {}, 5000);

    expect(response.content).toBe('{"found": true}');
  });

  it('returns result directly when no content array', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { key: 'value', nested: { a: 1 } },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const transport = new HttpMcpTransport(makeHttpConfig(), makeLogger());
    const response = await transport.callTool('data', {}, 5000);

    expect(response.content).toEqual({ key: 'value', nested: { a: 1 } });
  });

  it('includes config headers in request', async () => {
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      capturedHeaders = Object.fromEntries(Object.entries(init.headers as Record<string, string>));
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {},
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    delete process.env.GITHUB_TOKEN;
    const transport = new HttpMcpTransport(
      makeHttpConfig({ headers: { 'X-Custom': 'value' } }),
      makeLogger(),
    );
    await transport.callTool('tool', {}, 5000);

    expect(capturedHeaders['X-Custom']).toBe('value');
    expect(capturedHeaders['Content-Type']).toBe('application/json');
  });

  it('isConnected() always returns true (HTTP is stateless)', () => {
    const transport = new HttpMcpTransport(makeHttpConfig(), makeLogger());
    expect(transport.isConnected()).toBe(true);
  });

  it('disconnect() is a no-op', async () => {
    const transport = new HttpMcpTransport(makeHttpConfig(), makeLogger());
    await expect(transport.disconnect()).resolves.toBeUndefined();
    expect(transport.isConnected()).toBe(true);
  });

  it('includes raw response in ToolCallResponse', async () => {
    const rawResult = { content: [{ type: 'text', text: 'hello' }] };
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: rawResult,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const transport = new HttpMcpTransport(makeHttpConfig(), makeLogger());
    const response = await transport.callTool('tool', {}, 5000);

    expect(response.raw).toBeDefined();
  });
});

// ── StdioMcpTransport Tests (T005) ──────────────────────────────────────────

// We mock child_process.spawn to avoid real subprocess spawning
vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(),
  };
});

describe('StdioMcpTransport', () => {
  let mockSpawn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const cp = await import('node:child_process');
    mockSpawn = vi.mocked(cp.spawn);
    mockSpawn.mockReset();
  });

  /**
   * Create a mock child process with stdin/stdout/stderr streams
   * and event emitter capabilities.
   */
  function createMockProcess(): ChildProcess & {
    _stdout: import('node:stream').PassThrough;
    _stdin: { write: ReturnType<typeof vi.fn> };
  } {
    const { PassThrough } = require('node:stream') as typeof import('node:stream');
    const stdout = new PassThrough();
    const stdin = { write: vi.fn(), end: vi.fn() };
    const stderr = new PassThrough();

    const proc = new EventEmitter() as unknown as ChildProcess & {
      _stdout: import('node:stream').PassThrough;
      _stdin: { write: ReturnType<typeof vi.fn> };
    };
    Object.assign(proc, {
      stdout,
      stdin,
      stderr,
      pid: 12345,
      kill: vi.fn(),
      _stdout: stdout,
      _stdin: stdin,
    });
    return proc;
  }

  it('spawns subprocess with correct command and args', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const config = makeStdioConfig({ command: 'npx', args: ['-y', 'my-mcp-server'] });
    const transport = new StdioMcpTransport(config, makeLogger());

    // Start connect but don't await — we need to send the response
    const connectPromise = transport.connect();

    // Simulate init response
    setTimeout(() => {
      proc._stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }) + '\n');
    }, 10);

    await connectPromise;

    expect(mockSpawn).toHaveBeenCalledWith(
      'npx',
      ['-y', 'my-mcp-server'],
      expect.objectContaining({
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    );
  });

  it('sends initialize JSON-RPC request during connect', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const transport = new StdioMcpTransport(makeStdioConfig(), makeLogger());
    const connectPromise = transport.connect();

    setTimeout(() => {
      proc._stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) + '\n');
    }, 10);

    await connectPromise;

    expect(proc._stdin.write).toHaveBeenCalled();
    const written = proc._stdin.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '1.0',
        clientInfo: { name: 'sofIA', version: '0.1.0' },
      },
    });
  });

  it('resolves callTool on matching response id', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const transport = new StdioMcpTransport(makeStdioConfig(), makeLogger());
    const connectPromise = transport.connect();

    setTimeout(() => {
      proc._stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) + '\n');
    }, 10);

    await connectPromise;

    // Now callTool — the next id will be 2
    const callPromise = transport.callTool('test-tool', { arg: 'value' }, 5000);

    setTimeout(() => {
      proc._stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: { content: [{ type: 'text', text: '{"result":"ok"}' }] },
        }) + '\n',
      );
    }, 10);

    const response = await callPromise;
    expect(response.content).toBe('{"result":"ok"}');
  });

  it('rejects all pending requests when subprocess exits', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const transport = new StdioMcpTransport(makeStdioConfig(), makeLogger());
    const connectPromise = transport.connect();

    setTimeout(() => {
      proc._stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) + '\n');
    }, 10);

    await connectPromise;

    // Start a call that will hang
    const callPromise = transport.callTool('will-fail', {}, 30000);

    // Simulate subprocess exit
    setTimeout(() => {
      proc.emit('exit', 1);
    }, 10);

    await expect(callPromise).rejects.toThrow(McpTransportError);
    try {
      await callPromise;
    } catch (err) {
      expect(err).toBeInstanceOf(McpTransportError);
      expect((err as McpTransportError).message).toContain('exited');
      expect((err as Error & { code?: string }).code).toBe('ECONNREFUSED');
    }
  });

  it('rejects with timeout on failed handshake (5 second timeout)', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const transport = new StdioMcpTransport(makeStdioConfig(), makeLogger());
    // Don't send any response — let it time out
    // We'll use a much shorter timeout for the test by checking the error

    // We can't wait 5 real seconds, so we'll use fake timers
    vi.useFakeTimers();
    const connectPromise = transport.connect();

    // Advance past the 5-second timeout
    vi.advanceTimersByTime(5100);

    await expect(connectPromise).rejects.toThrow(McpTransportError);
    try {
      await connectPromise;
    } catch (err) {
      expect(err).toBeInstanceOf(McpTransportError);
      expect((err as McpTransportError).message).toContain('timed out');
      expect((err as McpTransportError).message).toContain('5 seconds');
      expect((err as Error & { code?: string }).code).toBe('ETIMEDOUT');
    }

    vi.useRealTimers();
  });

  it('throws when callTool is called before connect', async () => {
    const transport = new StdioMcpTransport(makeStdioConfig(), makeLogger());

    await expect(transport.callTool('tool', {}, 5000)).rejects.toThrow(McpTransportError);
    try {
      await transport.callTool('tool', {}, 5000);
    } catch (err) {
      expect((err as McpTransportError).message).toContain('not connected');
    }
  });

  it('rejects pending request on callTool timeout', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const transport = new StdioMcpTransport(makeStdioConfig(), makeLogger());
    const connectPromise = transport.connect();
    setTimeout(() => {
      proc._stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) + '\n');
    }, 10);
    await connectPromise;

    // callTool with very short timeout — process never responds
    vi.useFakeTimers();
    const callPromise = transport.callTool('slow-tool', {}, 100);
    vi.advanceTimersByTime(150);

    await expect(callPromise).rejects.toThrow(McpTransportError);
    try {
      await callPromise;
    } catch (err) {
      expect((err as McpTransportError).message).toContain('timed out');
      expect((err as Error & { code?: string }).code).toBe('ETIMEDOUT');
    }

    vi.useRealTimers();
  });

  it('disconnect rejects pending and kills subprocess', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const transport = new StdioMcpTransport(makeStdioConfig(), makeLogger());
    const connectPromise = transport.connect();
    setTimeout(() => {
      proc._stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) + '\n');
    }, 10);
    await connectPromise;

    expect(transport.isConnected()).toBe(true);

    await transport.disconnect();

    expect(transport.isConnected()).toBe(false);
    expect((proc as unknown as { kill: ReturnType<typeof vi.fn> }).kill).toHaveBeenCalledWith(
      'SIGTERM',
    );
  });

  it('passes env variables to subprocess', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const config = makeStdioConfig({
      env: { MY_VAR: 'test_value' },
    });
    const transport = new StdioMcpTransport(config, makeLogger());
    const connectPromise = transport.connect();
    setTimeout(() => {
      proc._stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) + '\n');
    }, 10);
    await connectPromise;

    const spawnCall = mockSpawn.mock.calls[0];
    const spawnOptions = spawnCall[2] as { env: Record<string, string> };
    expect(spawnOptions.env).toHaveProperty('MY_VAR', 'test_value');
  });

  it('skips non-JSON stdout lines without error', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    const logger = makeLogger();

    const transport = new StdioMcpTransport(makeStdioConfig(), logger);
    const connectPromise = transport.connect();

    // Send garbage then the real response
    proc._stdout.write('some garbage output\n');
    setTimeout(() => {
      proc._stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }) + '\n');
    }, 10);

    await connectPromise;
    expect(logger.debug).toHaveBeenCalled();
  });
});

// ── createTransport() Factory Tests ─────────────────────────────────────────

describe('createTransport()', () => {
  it('creates HttpMcpTransport for http type config', () => {
    const transport = createTransport(makeHttpConfig(), makeLogger());
    expect(transport).toBeInstanceOf(HttpMcpTransport);
  });

  it('creates StdioMcpTransport for stdio type config', () => {
    const transport = createTransport(makeStdioConfig(), makeLogger());
    expect(transport).toBeInstanceOf(StdioMcpTransport);
  });

  it('throws for unsupported transport type', () => {
    const badConfig = { name: 'bad', type: 'grpc' as 'http' } as HttpServerConfig;
    expect(() => createTransport(badConfig, makeLogger())).toThrow(
      'Unsupported MCP transport type',
    );
  });
});
