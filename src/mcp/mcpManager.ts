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
}

export interface HttpServerConfig {
  name: string;
  type: 'http';
  url: string;
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
      .replace(/^\s*\/\/.*$/gm, '')           // full-line // comments
      .replace(/\/\*[\s\S]*?\*\//g, '')        // block comments
      .replace(/,(\s*[}\]])/g, '$1');          // trailing commas
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
          };
        } else if (cfg.command && typeof cfg.command === 'string') {
          servers[name] = {
            name,
            type: 'stdio',
            command: cfg.command,
            args: Array.isArray(cfg.args) ? cfg.args : [],
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
}
