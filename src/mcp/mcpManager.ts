/**
 * MCP Manager.
 *
 * Loads .vscode/mcp.json configuration, manages MCP server connections,
 * lists available tools, and classifies errors for user-friendly messages.
 *
 * This module does NOT spawn or connect to MCP servers itself — it provides
 * the configuration and connection-status layer that the Copilot SDK uses
 * to route tool calls.
 */
import { readFile } from 'node:fs/promises';

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

// ── McpManager ───────────────────────────────────────────────────────────────

export class McpManager {
  private readonly config: McpConfig;
  private readonly connectedServers = new Set<string>();

  constructor(config: McpConfig) {
    this.config = config;
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
   * This is a low-level hook for adapters (GitHubMcpAdapter, McpContextEnricher)
   * to invoke server-side tools. In production, the Copilot SDK integration layer
   * should replace this with real MCP tool dispatch. Currently returns a
   * structured response from a placeholder implementation.
   *
   * @param serverName The MCP server name (e.g., 'github', 'context7', 'azure')
   * @param toolName The tool to call on that server
   * @param args Arguments for the tool
   * @returns The tool response as a parsed object, or throws if unavailable
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.isAvailable(serverName)) {
      throw new Error(`MCP server '${serverName}' is not available`);
    }

    // Placeholder: In production, this dispatches to the real MCP transport.
    // For now, throw to indicate the call was attempted but not implemented.
    throw new Error(
      `MCP callTool not yet wired to transport: ${serverName}.${toolName}(${JSON.stringify(args)})`,
    );
  }
}
