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
      const response = await this.mcpManager.callTool(
        'github',
        'create_repository',
        {
          name: options.name,
          description: options.description ?? '',
          private: options.private ?? true,
        },
        { timeoutMs: 60_000 },
      );

      const repoUrl =
        (response.html_url as string) ?? (response.url as string) ?? (response.clone_url as string);
      const repoName = (response.name as string) ?? (response.full_name as string) ?? options.name;

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
      // Extract owner and repo from repoUrl
      const { owner, repo } = extractOwnerRepo(options.repoUrl);

      const response = await this.mcpManager.callTool(
        'github',
        'push_files',
        {
          owner,
          repo,
          files: options.files,
          message: options.commitMessage,
          branch: options.branch ?? 'main',
        },
        { timeoutMs: 60_000 },
      );

      const commitSha =
        (response.sha as string | undefined) ??
        ((response.commit as Record<string, unknown> | undefined)?.sha as string | undefined);

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

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract owner and repo from a GitHub repository URL.
 * Supports formats like:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://api.github.com/repos/owner/repo
 */
function extractOwnerRepo(repoUrl: string): { owner: string; repo: string } {
  // Try github.com/{owner}/{repo} pattern
  const ghMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (ghMatch) {
    return { owner: ghMatch[1], repo: ghMatch[2] };
  }

  // Fallback: try api.github.com/repos/{owner}/{repo}
  const apiMatch = repoUrl.match(/api\.github\.com\/repos\/([^/]+)\/([^/.]+)/);
  if (apiMatch) {
    return { owner: apiMatch[1], repo: apiMatch[2] };
  }

  // Last resort: try extracting last two path segments
  const segments = new URL(repoUrl).pathname.split('/').filter(Boolean);
  if (segments.length >= 2) {
    return {
      owner: segments[segments.length - 2],
      repo: segments[segments.length - 1].replace('.git', ''),
    };
  }

  throw new Error(`Cannot extract owner/repo from URL: ${repoUrl}`);
}
