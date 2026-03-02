/**
 * MCP Transport Layer.
 *
 * Provides the `McpTransport` interface and two implementations:
 * - `StdioMcpTransport`: subprocess-based JSON-RPC 2.0 over stdin/stdout
 * - `HttpMcpTransport`: stateless HTTPS JSON-RPC 2.0 via native fetch()
 *
 * These transports handle the *programmatic adapter path* — deterministic tool
 * calls made by application code (GitHub adapter, Context7 enricher, Azure
 * enricher) that bypass the LLM.
 *
 * LLM-initiated tool calls go through the Copilot SDK's native `mcpServers`
 * support. See research.md Topic 1 for the dual-path architecture.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Logger } from 'pino';

import type { McpServerConfig, StdioServerConfig, HttpServerConfig } from './mcpManager.js';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Structured response from an MCP tool call.
 */
export interface ToolCallResponse {
  /** Parsed tool result content. */
  content: Record<string, unknown> | string;
  /** Raw JSON-RPC response (for debugging). */
  raw?: unknown;
  /** Whether this response came from a retry attempt. */
  wasRetried?: boolean;
}

/**
 * Common interface for all MCP transport implementations.
 * A transport represents a connection to one MCP server.
 */
export interface McpTransport {
  /**
   * Invoke a named tool on this MCP server.
   * Throws `McpTransportError` on failure.
   */
  callTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ToolCallResponse>;

  /** Whether the transport is currently connected. */
  isConnected(): boolean;

  /** Gracefully disconnect (terminate subprocess or close connection). */
  disconnect(): Promise<void>;
}

/**
 * Error type for MCP transport failures.
 * Callers use `classifyMcpError()` to determine retry eligibility.
 */
export class McpTransportError extends Error {
  constructor(
    message: string,
    public readonly serverName: string,
    public readonly toolName: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'McpTransportError';
  }
}

// ── Internal types ───────────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (value: ToolCallResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── StdioMcpTransport ────────────────────────────────────────────────────────

/**
 * MCP transport over stdio subprocess (JSON-RPC 2.0 newline-delimited).
 *
 * Used for: Context7, Azure MCP, WorkIQ, Playwright.
 */
export class StdioMcpTransport implements McpTransport {
  private readonly config: StdioServerConfig;
  private readonly logger: Logger;
  private process: ChildProcess | null = null;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private nextId = 1;
  private connected = false;

  constructor(config: StdioServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Spawn the subprocess and perform the JSON-RPC `initialize` handshake.
   * Must be called before `callTool()`.
   */
  async connect(): Promise<void> {
    const { command, args, env, cwd, name } = this.config;

    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      ...(cwd ? { cwd } : {}),
    });

    this.process = child;

    // Parse stdout lines as JSON-RPC responses
    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line: string) => {
      try {
        const msg = JSON.parse(line) as {
          id?: number;
          result?: unknown;
          error?: { message: string };
        };
        if (msg.id != null) {
          const pending = this.pendingRequests.get(msg.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(msg.id);

            if (msg.error) {
              pending.reject(new McpTransportError(msg.error.message, name, 'rpc-error'));
            } else {
              pending.resolve({
                content: this.extractContent(msg.result),
                raw: msg,
              });
            }
          }
        }
      } catch {
        this.logger.debug({ line: line.slice(0, 200) }, 'Skipping non-JSON stdout line');
      }
    });

    // Handle subprocess exit
    child.on('exit', (code) => {
      this.connected = false;
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(id);
        const err = new McpTransportError(
          `MCP subprocess exited with code ${code}`,
          name,
          'subprocess-exit',
        );
        (err as Error & { code?: string }).code = 'ECONNREFUSED';
        pending.reject(err);
      }
    });

    // Send initialize handshake
    const initId = this.nextId++;
    const initResult = await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(initId);
        child.kill('SIGTERM');
        const err = new McpTransportError(
          `MCP stdio server '${name}' initialization timed out after 5 seconds`,
          name,
          'initialize',
        );
        (err as Error & { code?: string }).code = 'ETIMEDOUT';
        reject(err);
      }, 5000);

      this.pendingRequests.set(initId, {
        resolve: () => {
          resolve();
        },
        reject,
        timer,
      });

      const initRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: initId,
        method: 'initialize',
        params: {
          protocolVersion: '1.0',
          clientInfo: { name: 'sofIA', version: '0.1.0' },
        },
      });

      child.stdin!.write(initRequest + '\n');
    });

    void initResult;
    this.connected = true;
    this.logger.info({ server: name }, 'MCP stdio server connected');
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ToolCallResponse> {
    if (!this.connected || !this.process) {
      throw new McpTransportError(
        `Transport not connected for server '${this.config.name}'`,
        this.config.name,
        toolName,
      );
    }

    const id = this.nextId++;

    return new Promise<ToolCallResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        const err = new McpTransportError(
          `MCP tool call timed out after ${timeoutMs}ms: ${this.config.name}.${toolName}`,
          this.config.name,
          toolName,
        );
        (err as Error & { code?: string }).code = 'ETIMEDOUT';
        reject(err);
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const request = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      });

      this.process!.stdin!.write(request + '\n');
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(id);
      pending.reject(
        new McpTransportError('Transport disconnected', this.config.name, 'disconnect'),
      );
    }

    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }

    this.connected = false;
  }

  /**
   * Extract content from a JSON-RPC result.
   * MCP responses may have `result.content[0].text` or just `result` directly.
   */
  private extractContent(result: unknown): Record<string, unknown> | string {
    if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      if (Array.isArray(r.content) && r.content.length > 0) {
        const first = r.content[0] as Record<string, unknown>;
        if (typeof first.text === 'string') {
          return first.text;
        }
        return first;
      }
      return r;
    }
    return String(result);
  }
}

// ── HttpMcpTransport ─────────────────────────────────────────────────────────

/**
 * MCP transport over HTTPS (stateless JSON-RPC 2.0 via native fetch).
 *
 * Used for: GitHub MCP, Microsoft Docs MCP.
 */
export class HttpMcpTransport implements McpTransport {
  private readonly config: HttpServerConfig;
  private readonly logger: Logger;
  private nextId = 1;

  constructor(config: HttpServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ToolCallResponse> {
    const id = this.nextId++;
    const body = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    };

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    // Add auth token if available
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // AbortController for timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Handle HTTP error statuses
      if (response.status === 401 || response.status === 403) {
        const err = new McpTransportError(
          `HTTP ${response.status} from ${this.config.name}: authentication failed`,
          this.config.name,
          toolName,
        );
        (err as Error & { code?: string }).code = 'ERR_TLS_CERT_ALTNAME_INVALID';
        throw err;
      }

      if (response.status >= 500) {
        throw new McpTransportError(
          `HTTP ${response.status} from ${this.config.name}: server error`,
          this.config.name,
          toolName,
        );
      }

      // Parse response body
      let parsed: Record<string, unknown>;
      try {
        parsed = (await response.json()) as Record<string, unknown>;
      } catch {
        throw new McpTransportError(
          `Non-JSON response from ${this.config.name}`,
          this.config.name,
          toolName,
        );
      }

      // Handle JSON-RPC error
      if (parsed.error) {
        const rpcError = parsed.error as { message?: string };
        throw new McpTransportError(
          rpcError.message ?? 'JSON-RPC error',
          this.config.name,
          toolName,
        );
      }

      return {
        content: this.extractContent(parsed.result),
        raw: parsed,
      };
    } catch (err) {
      clearTimeout(timer);

      // Re-throw McpTransportError as-is
      if (err instanceof McpTransportError) {
        throw err;
      }

      // Handle AbortError (timeout)
      if (err instanceof Error && err.name === 'AbortError') {
        const timeoutErr = new McpTransportError(
          `MCP HTTP call timed out after ${timeoutMs}ms: ${this.config.name}.${toolName}`,
          this.config.name,
          toolName,
        );
        (timeoutErr as Error & { code?: string }).code = 'ETIMEDOUT';
        throw timeoutErr;
      }

      // Re-throw other errors as McpTransportError
      throw new McpTransportError(
        err instanceof Error ? err.message : String(err),
        this.config.name,
        toolName,
        err,
      );
    }
  }

  isConnected(): boolean {
    return true; // HTTP is stateless
  }

  async disconnect(): Promise<void> {
    // No-op for HTTP
  }

  /**
   * Extract content from a JSON-RPC result.
   */
  private extractContent(result: unknown): Record<string, unknown> | string {
    if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      if (Array.isArray(r.content) && r.content.length > 0) {
        const first = r.content[0] as Record<string, unknown>;
        if (typeof first.text === 'string') {
          return first.text;
        }
        return first;
      }
      return r;
    }
    return String(result);
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create the correct transport implementation for a server config.
 */
export function createTransport(config: McpServerConfig, logger: Logger): McpTransport {
  if (config.type === 'stdio') {
    return new StdioMcpTransport(config, logger);
  }
  if (config.type === 'http') {
    return new HttpMcpTransport(config, logger);
  }
  throw new Error(`Unsupported MCP transport type: ${(config as McpServerConfig).type}`);
}
