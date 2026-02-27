import { join } from 'node:path';
import { promises as fs } from 'node:fs';

export interface McpServerConfig {
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
}

export interface McpManagerOptions {
  configPath?: string;
}

export class McpManager {
  private configPath: string;
  private servers: McpServerConfig[] = [];

  constructor(opts: McpManagerOptions = {}) {
    this.configPath = opts.configPath ?? join(process.cwd(), '.vscode', 'mcp.json');
  }

  async loadConfig(): Promise<McpServerConfig[]> {
    try {
      const raw = await fs.readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(raw);
      this.servers = parsed.servers ?? parsed ?? [];
      return this.servers;
    } catch (err: any) {
      // If config missing, return empty list; upstream can decide to warn.
      if (err?.code === 'ENOENT') {
        this.servers = [];
        return this.servers;
      }
      throw err;
    }
  }

  listServers(): McpServerConfig[] {
    return this.servers;
  }

  // Placeholder: in a full implementation, this would initialize MCP clients per server using the MCP TypeScript SDK
  async connectAll(): Promise<void> {
    if (this.servers.length === 0) {
      await this.loadConfig();
    }
    // TODO: integrate @modelcontextprotocol/sdk once wired
  }
}
