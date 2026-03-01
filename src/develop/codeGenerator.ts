/**
 * Code Generator.
 *
 * Builds LLM iteration prompts from test failures and PoC context,
 * parses fenced code block responses from the LLM, writes generated
 * files to the output directory, and detects new package.json dependencies.
 *
 * Contract: specs/002-poc-generation/contracts/ralph-loop.md (Code change format)
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';

import type { TestResults } from '../shared/schemas/session.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParsedFile {
  /** Relative path within the PoC directory */
  path: string;
  /** Complete file content */
  content: string;
  /** Language detected from fenced code block */
  language: string;
}

export interface CodeGenerationResult {
  /** Files written to disk */
  writtenFiles: string[];
  /** Whether new dependencies were added to package.json */
  dependenciesChanged: boolean;
  /** Previous package.json dependencies (for change detection) */
  previousDependencies: Record<string, string>;
  /** New package.json dependencies after generation */
  newDependencies: Record<string, string>;
  /** Audit summary of what was sent to LLM (not full prompt) */
  llmPromptContext: string;
}

export interface IterationPromptOptions {
  iteration: number;
  maxIterations: number;
  previousOutcome: string;
  testResults: TestResults;
  filesInPoc: string[];
  mcpContext?: string;
}

// ── Code block parsing ────────────────────────────────────────────────────────

/**
 * Parse fenced code blocks with `file=path` annotations from LLM response.
 *
 * Recognizes:
 *   ```typescript file=src/index.ts
 *   // content
 *   ```
 *
 *   ```ts file=tests/index.test.ts
 *   // content
 *   ```
 */
export function parseFencedCodeBlocks(response: string): ParsedFile[] {
  const results: ParsedFile[] = [];

  // Match ``` optionally followed by language, then `file=<path>`, then content, then ```
  // Allow optional spaces between language and file=
  // Match fenced code blocks with `file=<path>` annotation.
  //
  // Pattern breakdown:
  //   ^```          - opening fence at line start
  //   (\w*)         - optional language tag (e.g., typescript, ts, json)
  //   \s+           - whitespace separator
  //   (?:file=(\S+) - "file=" followed by path (group 2), OR
  //   |.*?file=(\S+))- any prefix then "file=" (group 3, handles "lang file=path")
  //   \s*\n         - optional trailing whitespace + newline
  //   ([\s\S]*?)    - multi-line file content (group 4, non-greedy)
  //   ^```          - closing fence at line start
  //
  // The `gm` flags enable global matching and treat ^ as start-of-line.
  const fencePattern = /^```(\w*)\s+(?:file=(\S+)|.*?file=(\S+))\s*\n([\s\S]*?)^```/gm;

  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(response)) !== null) {
    const language = match[1] || 'text';
    const filePath = match[2] || match[3];
    const content = match[4];

    if (filePath && content !== undefined) {
      // Normalize path (remove leading ./ if present)
      const normalizedPath = filePath.replace(/^\.\//, '');
      results.push({
        path: normalizedPath,
        content,
        language,
      });
    }
  }

  return results;
}

// ── Directory tree helper ─────────────────────────────────────────────────────

/**
 * Build a simple file tree listing for a directory.
 * Excludes node_modules/, dist/, coverage/, .git/.
 */
export function buildFileTree(dir: string, prefix = ''): string[] {
  const EXCLUDED = new Set(['node_modules', 'dist', 'coverage', '.git', '.sofia-metadata.json']);
  const lines: string[] = [];

  if (!existsSync(dir)) return lines;

  let entries: string[];
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return lines;
  }

  for (const entry of entries) {
    if (EXCLUDED.has(entry)) continue;

    const fullPath = join(dir, entry);
    let isDir = false;
    try {
      isDir = statSync(fullPath).isDirectory();
    } catch {
      continue;
    }

    if (isDir) {
      lines.push(`${prefix}${entry}/`);
      lines.push(...buildFileTree(fullPath, `${prefix}  `));
    } else {
      lines.push(`${prefix}${entry}`);
    }
  }

  return lines;
}

// ── CodeGenerator ────────────────────────────────────────────────────────────

export class CodeGenerator {
  private readonly outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /**
   * Build the iteration prompt to send to the LLM.
   *
   * Follows the template from the ralph-loop contract.
   */
  buildIterationPrompt(options: IterationPromptOptions): string {
    const { iteration, maxIterations, previousOutcome, testResults, filesInPoc, mcpContext } =
      options;

    const lines: string[] = [];

    lines.push('## Current State');
    lines.push(`- Iteration: ${iteration} of ${maxIterations}`);
    lines.push(`- Previous outcome: ${previousOutcome}`);
    lines.push('');

    lines.push('## Test Results');
    lines.push(
      `- Passed: ${testResults.passed}, Failed: ${testResults.failed}, Skipped: ${testResults.skipped}`,
    );
    lines.push(`- Duration: ${testResults.durationMs}ms`);
    lines.push('');

    if (testResults.failures.length > 0) {
      lines.push('### Failures');
      testResults.failures.forEach((f, i) => {
        lines.push(`${i + 1}. **${f.testName}**: ${f.message}`);
        if (f.expected !== undefined) lines.push(`   Expected: ${f.expected}`);
        if (f.actual !== undefined) lines.push(`   Actual: ${f.actual}`);
        if (f.file) lines.push(`   At: ${f.file}${f.line ? `:${f.line}` : ''}`);
      });
      lines.push('');
    }

    if (filesInPoc.length > 0) {
      lines.push('## Files in PoC');
      for (const f of filesInPoc) {
        lines.push(`- ${f}`);
      }
      lines.push('');
    }

    if (mcpContext) {
      lines.push('## MCP Context');
      lines.push(mcpContext);
      lines.push('');
    }

    if (testResults.rawOutput) {
      lines.push('## Raw Test Output (tail)');
      lines.push('```');
      lines.push(testResults.rawOutput);
      lines.push('```');
      lines.push('');
    }

    lines.push('## Task');
    if (testResults.failed > 0) {
      lines.push(
        'Fix the failing tests and any underlying issues. For every file you modify or create, respond with its complete contents using fenced code blocks in this format:',
      );
      lines.push('');
      lines.push('```ts file=relative/path/to/file.ts');
      lines.push('// full file content here');
      lines.push('```');
      lines.push('');
      lines.push(
        'Only include complete files in these fenced code blocks; do not include partial snippets for changed files.',
      );
    } else {
      lines.push(
        'The test run reported 0 failing tests. Review the code, tests, and test output for quality, completeness, and any hidden issues (such as parsing errors or missing tests).',
      );
      lines.push(
        'If you determine that any code or tests should be improved or fixed, respond with the complete contents of each file you need to modify or create, using fenced code blocks in the same ` ```lang file=relative/path/to/file.ext` format as above.',
      );
      lines.push(
        'If you are confident that no further changes are required, respond with a concise summary explaining why no changes are needed and do not include any fenced code blocks.',
      );
    }

    return lines.join('\n');
  }

  /**
   * Get the audit summary string for llmPromptContext field.
   * Contains key context info, not the full prompt.
   */
  buildPromptContextSummary(options: IterationPromptOptions): string {
    const { iteration, maxIterations, testResults, filesInPoc } = options;
    return [
      `Iteration ${iteration} of ${maxIterations}`,
      `${testResults.failed} failures`,
      `files: ${filesInPoc.slice(0, 10).join(', ')}${filesInPoc.length > 10 ? '...' : ''}`,
    ].join(', ');
  }

  /**
   * Apply LLM-generated code changes to the output directory.
   *
   * Parses fenced code blocks from the LLM response and writes them to disk.
   * Returns information about what changed.
   */
  async applyChanges(llmResponse: string): Promise<CodeGenerationResult> {
    if (!llmResponse || llmResponse.trim().length === 0) {
      return {
        writtenFiles: [],
        dependenciesChanged: false,
        previousDependencies: {},
        newDependencies: {},
        llmPromptContext: '',
      };
    }

    // Read current package.json dependencies before applying
    const previousDeps = await this.readPackageJsonDeps();

    // Parse fenced code blocks
    const parsedFiles = parseFencedCodeBlocks(llmResponse);

    const writtenFiles: string[] = [];

    for (const file of parsedFiles) {
      // Reject absolute paths or path traversal
      if (file.path.startsWith('/') || file.path.includes('..')) {
        continue;
      }

      const fullPath = join(this.outputDir, file.path);
      const parentDir = dirname(fullPath);

      await mkdir(parentDir, { recursive: true });
      await writeFile(fullPath, file.content, 'utf-8');
      writtenFiles.push(file.path);
    }

    // Check if package.json dependencies changed
    const newDeps = await this.readPackageJsonDeps();
    const dependenciesChanged = this.depsChanged(previousDeps, newDeps);

    return {
      writtenFiles,
      dependenciesChanged,
      previousDependencies: previousDeps,
      newDependencies: newDeps,
      llmPromptContext: '',
    };
  }

  /**
   * Read package.json dependencies (both deps and devDeps).
   */
  private async readPackageJsonDeps(): Promise<Record<string, string>> {
    try {
      const pkgPath = join(this.outputDir, 'package.json');
      const content = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      return {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };
    } catch {
      return {};
    }
  }

  /**
   * Check if dependencies changed between two snapshots.
   */
  private depsChanged(
    prev: Record<string, string>,
    next: Record<string, string>,
  ): boolean {
    const prevKeys = Object.keys(prev).sort();
    const nextKeys = Object.keys(next).sort();

    if (prevKeys.length !== nextKeys.length) return true;
    if (prevKeys.join(',') !== nextKeys.join(',')) return true;

    for (const key of prevKeys) {
      if (prev[key] !== next[key]) return true;
    }

    return false;
  }

  /**
   * Get the current files in the PoC directory (relative paths).
   */
  getFilesInPoc(): string[] {
    return buildFileTree(this.outputDir);
  }
}
