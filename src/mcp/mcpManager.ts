/**
 * MCP Manager.
 *
 * Loads .vscode/mcp.json configuration, manages MCP server connections,
 * lists available tools, classifies errors, and dispatches real MCP tool calls
 * via the transport layer.
 */
import { readFile } from 'node:fs/promises';
import type { Logger } from 'pino';

import { createTransport, StdioMcpTransport } from './mcpTransport.js';
import type { McpTransport } from './mcpTransport.js';
import { withRetry } from './retryPolicy.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StdioServerConfig {
  name: string;
  type: 'stdio';
  command: string;
  args: string[];
  /** Environment variables for the subprocess (merged with process.env). */
  env?: Record<string, string>;
  /** Working directory for the subprocess. */
  cwd?: string;
  /** Restrict which tools are exposed from this server. */
  tools?: string[];
  /** Connection timeout in milliseconds. */
  timeout?: number;
}

export interface HttpServerConfig {
  name: string;
  type: 'http';
  url: string;
  /** HTTP headers to include with each request (e.g., Authorization). */
  headers?: Record<string, string>;
  /** Restrict which tools are exposed from this server. */
  tools?: string[];
  /** Request timeout in milliseconds. */
  timeout?: number;
}

export type McpServerConfig = StdioServerConfig | HttpServerConfig;

export interface McpConfig {
  servers: Record<string, McpServerConfig>;
}

// ── Error classification ─────────────────────────────────────────────────────

export type McpErrorClass =
  | 'connection-refused'
  | 'dns-failure'
  | 'timeout'
  | 'auth-failure'
  | 'unknown';

const ERROR_CODE_MAP: Record<string, McpErrorClass> = {
  ECONNREFUSED: 'connection-refused',
  ENOTFOUND: 'dns-failure',
  ETIMEDOUT: 'timeout',
  ECONNRESET: 'connection-refused',
  ERR_TLS_CERT_ALTNAME_INVALID: 'auth-failure',
};

export function classifyMcpError(err: unknown): McpErrorClass {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code && code in ERROR_CODE_MAP) {
      return ERROR_CODE_MAP[code];
    }
    // AbortError from AbortController / fetch timeouts
    if (err instanceof DOMException && err.name === 'AbortError') {
      return 'timeout';
    }
    // Message-based timeout detection
    if (/timed?\s*out/i.test(err.message)) {
      return 'timeout';
    }
    if (err.message.includes('401') || err.message.includes('403')) {
      return 'auth-failure';
    }
  }
  return 'unknown';
}

// ── Config loader ────────────────────────────────────────────────────────────

/**
 * Load and normalize MCP configuration from a JSON file.
 * Returns empty servers if the file doesn't exist.
 */
export async function loadMcpConfig(configPath: string): Promise<McpConfig> {
  try {
    const raw = await readFile(configPath, 'utf-8');
    // Strip JSONC comments — only full-line // comments and block comments
    // Avoid stripping // inside string values (e.g. URLs like https://)
    const stripped = raw
      .replace(/^\s*\/\/.*$/gm, '') // full-line // comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
      .replace(/,(\s*[}\]])/g, '$1'); // trailing commas
    const parsed = JSON.parse(stripped);

    const servers: Record<string, McpServerConfig> = {};

    if (parsed.servers && typeof parsed.servers === 'object') {
      for (const [name, config] of Object.entries(parsed.servers)) {
        const cfg = config as Record<string, unknown>;

        if (cfg.url && typeof cfg.url === 'string') {
          servers[name] = {
            name,
            type: 'http',
            url: cfg.url,
            ...(cfg.headers && typeof cfg.headers === 'object'
              ? { headers: cfg.headers as Record<string, string> }
              : {}),
            ...(Array.isArray(cfg.tools) ? { tools: cfg.tools as string[] } : {}),
            ...(typeof cfg.timeout === 'number' ? { timeout: cfg.timeout } : {}),
          };
        } else if (cfg.command && typeof cfg.command === 'string') {
          servers[name] = {
            name,
            type: 'stdio',
            command: cfg.command,
            args: Array.isArray(cfg.args) ? cfg.args : [],
            ...(cfg.env && typeof cfg.env === 'object'
              ? { env: cfg.env as Record<string, string> }
              : {}),
            ...(typeof cfg.cwd === 'string' ? { cwd: cfg.cwd } : {}),
            ...(Array.isArray(cfg.tools) ? { tools: cfg.tools as string[] } : {}),
            ...(typeof cfg.timeout === 'number' ? { timeout: cfg.timeout } : {}),
          };
        }
      }
    }

    return { servers };
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { servers: {} };
    }
    // Re-throw parse or other errors
    throw err;
  }
}

// ── SDK config bridge ────────────────────────────────────────────────────────

/**
 * SDK-compatible MCP server config shape.
 * Matches `MCPLocalServerConfig | MCPRemoteServerConfig` from `@github/copilot-sdk`.
 * The `tools` field is required by the SDK (`string[]`); defaults to `['*']` (all tools).
 */
export interface SdkMcpServerConfig {
  type?: string;
  tools: string[];
  timeout?: number;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
}

/**
 * Convert sofIA's `McpConfig` to the shape expected by the Copilot SDK's
 * `SessionConfig.mcpServers` (`Record<string, MCPServerConfig>`).
 *
 * This bridges `.vscode/mcp.json` → SDK `createSession({ mcpServers })`.
 * The SDK types are `MCPLocalServerConfig` and `MCPRemoteServerConfig`.
 */
export function toSdkMcpServers(config: McpConfig): Record<string, SdkMcpServerConfig> {
  const result: Record<string, SdkMcpServerConfig> = {};

  for (const [name, server] of Object.entries(config.servers)) {
    if (server.type === 'stdio') {
      result[name] = {
        type: 'stdio',
        command: server.command,
        args: server.args,
        tools: server.tools ?? ['*'],
        ...(server.env ? { env: server.env } : {}),
        ...(server.cwd ? { cwd: server.cwd } : {}),
        ...(server.timeout ? { timeout: server.timeout } : {}),
      };
    } else if (server.type === 'http') {
      result[name] = {
        type: 'http',
        url: server.url,
        tools: server.tools ?? ['*'],
        ...(server.headers ? { headers: server.headers } : {}),
        ...(server.timeout ? { timeout: server.timeout } : {}),
      };
    }
  }

  return result;
}

// ── Default Timeouts ─────────────────────────────────────────────────────────

const DEFAULT_TIMEOUTS: Record<string, number> = {
  github: 60_000,
  context7: 30_000,
  azure: 30_000,
  workiq: 30_000,
  'microsoftdocs/mcp': 30_000,
};

const FALLBACK_TIMEOUT = 30_000;

// ── McpManager ───────────────────────────────────────────────────────────────

export class McpManager {
  private readonly config: McpConfig;
  private readonly connectedServers = new Set<string>();
  private readonly transports = new Map<string, McpTransport>();
  private readonly logger?: Logger;

  constructor(config: McpConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /** List all configured server names. */
  listServers(): string[] {
    return Object.keys(this.config.servers);
  }

  /** Get configuration for a specific server. */
  getServerConfig(name: string): McpServerConfig | undefined {
    return this.config.servers[name];
  }

  /** Check if a server is currently connected (available). */
  isAvailable(name: string): boolean {
    return this.connectedServers.has(name);
  }

  /** Mark a server as connected. Used by the SDK integration layer. */
  markConnected(name: string): void {
    if (this.config.servers[name]) {
      this.connectedServers.add(name);
    }
  }

  /** Mark a server as disconnected. */
  markDisconnected(name: string): void {
    this.connectedServers.delete(name);
  }

  /** Get all server configs as an array. */
  getAllConfigs(): McpServerConfig[] {
    return Object.values(this.config.servers);
  }

  /**
   * Call a tool on a named MCP server.
   *
   * Dispatches to the correct transport (stdio or HTTP), applies retry policy
   * for transient errors, and normalizes the response.
   *
   * @param serverName The MCP server name (e.g., 'github', 'context7', 'azure')
   * @param toolName The tool to call on that server
   * @param args Arguments for the tool
   * @param options Optional timeout and retry configuration
   * @returns The tool response as a parsed object
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    options?: { timeoutMs?: number; retryOnTransient?: boolean },
  ): Promise<Record<string, unknown>> {
    if (!this.isAvailable(serverName)) {
      throw new Error(`MCP server '${serverName}' is not available`);
    }

    const serverConfig = this.config.servers[serverName];
    if (!serverConfig) {
      throw new Error(`Unknown MCP server: ${serverName}`);
    }

    // Get or create transport
    const transport = this.getOrCreateTransport(serverName, serverConfig);

    // Connect stdio transports on first use
    if (transport instanceof StdioMcpTransport && !transport.isConnected()) {
      await transport.connect();
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUTS[serverName] ?? FALLBACK_TIMEOUT;

    try {
      let response;
      if (options?.retryOnTransient !== false) {
        response = await withRetry(() => transport.callTool(toolName, args, timeoutMs), {
          serverName,
          toolName,
          logger: this.logger,
        });
      } else {
        response = await transport.callTool(toolName, args, timeoutMs);
      }

      // Normalize content to Record<string, unknown>
      const content = response.content;
      if (typeof content === 'string') {
        // Try to parse JSON string; if not JSON, wrap as { text: content }
        try {
          const parsed = JSON.parse(content);
          if (typeof parsed === 'object' && parsed !== null) {
            return parsed as Record<string, unknown>;
          }
          return { text: content };
        } catch {
          return { text: content };
        }
      }
      return content;
    } catch (err) {
      this.markDisconnected(serverName);
      throw err;
    }
  }

  /**
   * Disconnect all cached transports and clear the registry.
   */
  async disconnectAll(): Promise<void> {
    const disconnections: Promise<void>[] = [];
    for (const transport of this.transports.values()) {
      disconnections.push(transport.disconnect());
    }
    await Promise.allSettled(disconnections);
    this.transports.clear();
  }

  /**
   * Get or lazily create a transport for the given server.
   */
  private getOrCreateTransport(serverName: string, config: McpServerConfig): McpTransport {
    let transport = this.transports.get(serverName);
    if (!transport) {
      const logger =
        this.logger ??
        ({
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
          trace: () => {},
          fatal: () => {},
          child: () => logger,
          level: 'silent',
        } as unknown as Logger);
      transport = createTransport(config, logger);
      this.transports.set(serverName, transport);
    }
    return transport;
  }
}
