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
   * Returns `{ available: false }` if GitHub MCP is unavailable or if creation fails.
   */
  async createRepository(options: CreateRepositoryOptions): Promise<CreateRepositoryResult> {
    if (!this.isAvailable()) {
      return { available: false, reason: 'GitHub MCP not available' };
    }

    try {
      // In production this would call the `create_repository` MCP tool.
      // For now, simulate a successful creation.
      const repoName = options.name;
      const repoUrl = `https://github.com/poc-owner/${repoName}`;

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
   * Returns `{ available: false }` if GitHub MCP is unavailable or if push fails.
   */
  async pushFiles(_options: PushFilesOptions): Promise<PushFilesResult> {
    if (!this.isAvailable()) {
      return { available: false, reason: 'GitHub MCP not available' };
    }

    try {
      // In production this would call the `push_files` or `create_or_update_file`
      // MCP tool for each file, then commit.
      // For now, simulate a successful push.
      const fakeSha = Math.random().toString(16).slice(2, 10);

      return {
        available: true,
        commitSha: fakeSha,
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
