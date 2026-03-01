/**
 * GitHub MCP Adapter.
 *
 * Wraps GitHub MCP tool calls for PoC repository creation and file pushes.
 * When GitHub MCP is unavailable, all methods degrade gracefully by returning
 * `{ available: false }` or undefined.
 *
 * Contract: specs/002-poc-generation/contracts/poc-output.md (GitHub MCP integration)
 */
import type { McpManager } from '../mcp/mcpManager.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateRepositoryOptions {
  name: string;
  description?: string;
  private?: boolean;
}

export type CreateRepositoryResult =
  | {
      available: true;
      repoUrl: string;
      repoName: string;
    }
  | {
      available: false;
      reason?: string;
    };

export interface PushFilesOptions {
  repoUrl: string;
  files: Array<{ path: string; content: string }>;
  commitMessage: string;
  branch?: string;
}

export type PushFilesResult =
  | {
      available: true;
      commitSha?: string;
    }
  | {
      available: false;
      reason?: string;
    };

// ── GitHubMcpAdapter ─────────────────────────────────────────────────────────

/**
 * Adapter for GitHub MCP repository operations.
 *
 * All methods check isAvailable() before attempting tool calls.
 * On failure or unavailability, returns `{ available: false }` without throwing.
 */
export class GitHubMcpAdapter {
  private readonly mcpManager: McpManager;
  private _repoUrl: string | undefined;

  constructor(mcpManager: McpManager) {
    this.mcpManager = mcpManager;
  }

  /**
   * Check if GitHub MCP is available.
   */
  isAvailable(): boolean {
    return this.mcpManager.isAvailable('github');
  }

  /**
   * Create a GitHub repository via MCP.
   *
   * Calls `mcpManager.callTool('github', 'create_repository', ...)` and parses
   * the response for `html_url`. Returns `{ available: false }` if GitHub MCP
   * is unavailable or if creation fails.
   */
  async createRepository(options: CreateRepositoryOptions): Promise<CreateRepositoryResult> {
    if (!this.isAvailable()) {
      return { available: false, reason: 'GitHub MCP not available' };
    }

    try {
      const response = await this.mcpManager.callTool('github', 'create_repository', {
        name: options.name,
        description: options.description ?? '',
        private: options.private ?? true,
      });

      const repoUrl = (response.html_url as string) ?? (response.url as string);
      const repoName = (response.name as string) ?? options.name;

      if (!repoUrl) {
        return { available: false, reason: 'MCP response missing repository URL' };
      }

      this._repoUrl = repoUrl;

      return {
        available: true,
        repoUrl,
        repoName,
      };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      return { available: false, reason };
    }
  }

  /**
   * Push files to a GitHub repository via MCP.
   *
   * Calls `mcpManager.callTool('github', 'push_files', ...)` with file paths
   * and contents. Returns `{ available: false }` if GitHub MCP is unavailable
   * or if push fails.
   */
  async pushFiles(options: PushFilesOptions): Promise<PushFilesResult> {
    if (!this.isAvailable()) {
      return { available: false, reason: 'GitHub MCP not available' };
    }

    try {
      const response = await this.mcpManager.callTool('github', 'push_files', {
        repoUrl: options.repoUrl,
        files: options.files,
        message: options.commitMessage,
        branch: options.branch ?? 'main',
      });

      const commitSha = response.sha as string | undefined;

      return {
        available: true,
        commitSha,
      };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      return { available: false, reason };
    }
  }

  /**
   * Get the repository URL from the last successful createRepository call.
   */
  getRepoUrl(): string | undefined {
    return this._repoUrl;
  }
}
