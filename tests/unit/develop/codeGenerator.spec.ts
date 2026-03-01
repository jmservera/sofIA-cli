/**
 * T013: Unit tests for CodeGenerator.
 *
 * Verifies:
 * - Parses fenced code blocks with `file=path` from LLM response
 * - Writes files to outputDir
 * - Handles empty response gracefully
 * - Builds iteration prompt with test failures context
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  CodeGenerator,
  parseFencedCodeBlocks,
  buildFileTree,
} from '../../../src/develop/codeGenerator.js';
import type { TestResults } from '../../../src/shared/schemas/session.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTestResults(overrides?: Partial<TestResults>): TestResults {
  return {
    passed: 1,
    failed: 2,
    skipped: 0,
    total: 3,
    durationMs: 500,
    failures: [
      {
        testName: 'suite > test A',
        message: 'Expected 3 but got 5',
        file: 'tests/a.test.ts',
        line: 10,
      },
      {
        testName: 'suite > test B',
        message: 'Cannot read properties of undefined',
        file: 'tests/b.test.ts',
      },
    ],
    rawOutput: 'FAIL tests/a.test.ts\nFAIL tests/b.test.ts\n',
    ...overrides,
  };
}

// ── parseFencedCodeBlocks ─────────────────────────────────────────────────────

describe('parseFencedCodeBlocks', () => {
  it('parses a single typescript code block with file=', () => {
    const response = `Here are the changes:\n\n\`\`\`typescript file=src/index.ts\nexport function main() {\n  return 42;\n}\n\`\`\`\n`;
    const files = parseFencedCodeBlocks(response);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/index.ts');
    expect(files[0].content).toContain('export function main()');
    expect(files[0].language).toBe('typescript');
  });

  it('parses multiple code blocks', () => {
    const response = `\`\`\`typescript file=src/index.ts\nexport function a() {}\n\`\`\`\n\n\`\`\`typescript file=tests/index.test.ts\nimport { test } from "vitest";\n\`\`\`\n`;
    const files = parseFencedCodeBlocks(response);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('src/index.ts');
    expect(files[1].path).toBe('tests/index.test.ts');
  });

  it('handles code block with ./prefix in path', () => {
    const response = `\`\`\`typescript file=./src/index.ts\nexport const x = 1;\n\`\`\`\n`;
    const files = parseFencedCodeBlocks(response);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/index.ts'); // normalized
  });

  it('handles empty LLM response gracefully', () => {
    const files = parseFencedCodeBlocks('');
    expect(files).toHaveLength(0);
  });

  it('ignores code blocks without file= annotation', () => {
    const response = `\`\`\`typescript\nexport function main() {}\n\`\`\`\n`;
    const files = parseFencedCodeBlocks(response);
    expect(files).toHaveLength(0);
  });

  it('handles ts shorthand language tag', () => {
    const response = `\`\`\`ts file=src/index.ts\nexport const x = 1;\n\`\`\`\n`;
    const files = parseFencedCodeBlocks(response);
    expect(files).toHaveLength(1);
    expect(files[0].language).toBe('ts');
  });

  it('handles json file type', () => {
    const response = `\`\`\`json file=package.json\n{"name":"test"}\n\`\`\`\n`;
    const files = parseFencedCodeBlocks(response);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('package.json');
  });
});

// ── buildFileTree ─────────────────────────────────────────────────────────────

describe('buildFileTree', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-filetree-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array for non-existent directory', () => {
    const tree = buildFileTree('/non/existent/path');
    expect(tree).toEqual([]);
  });

  it('lists files in directory', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(tmpDir, 'index.ts'), '', 'utf-8');
    await writeFile(join(tmpDir, 'helper.ts'), '', 'utf-8');

    const tree = buildFileTree(tmpDir);
    expect(tree).toContain('helper.ts');
    expect(tree).toContain('index.ts');
  });

  it('excludes node_modules and dist', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
    await writeFile(join(tmpDir, 'node_modules', 'pkg.js'), '', 'utf-8');
    await mkdir(join(tmpDir, 'dist'), { recursive: true });
    await writeFile(join(tmpDir, 'dist', 'index.js'), '', 'utf-8');
    await writeFile(join(tmpDir, 'index.ts'), '', 'utf-8');

    const tree = buildFileTree(tmpDir);
    expect(tree).toContain('index.ts');
    expect(tree.some((f) => f.includes('node_modules'))).toBe(false);
    expect(tree.some((f) => f.includes('dist'))).toBe(false);
  });

  it('recursively lists subdirectories', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    await writeFile(join(tmpDir, 'src', 'index.ts'), '', 'utf-8');

    const tree = buildFileTree(tmpDir);
    expect(tree).toContain('src/');
    expect(tree).toContain('  index.ts');
  });
});

// ── CodeGenerator ─────────────────────────────────────────────────────────────

describe('CodeGenerator', () => {
  let tmpDir: string;
  let generator: CodeGenerator;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-codegen-test-'));
    generator = new CodeGenerator(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('buildIterationPrompt', () => {
    it('includes iteration number and max', () => {
      const prompt = generator.buildIterationPrompt({
        iteration: 3,
        maxIterations: 10,
        previousOutcome: 'tests-failing',
        testResults: makeTestResults(),
        filesInPoc: ['src/index.ts'],
      });

      expect(prompt).toContain('Iteration: 3 of 10');
      expect(prompt).toContain('tests-failing');
    });

    it('includes failing test details', () => {
      const prompt = generator.buildIterationPrompt({
        iteration: 2,
        maxIterations: 5,
        previousOutcome: 'scaffold',
        testResults: makeTestResults(),
        filesInPoc: ['src/index.ts'],
      });

      expect(prompt).toContain('suite > test A');
      expect(prompt).toContain('Expected 3 but got 5');
      expect(prompt).toContain('tests/a.test.ts');
    });

    it('includes files in PoC', () => {
      const prompt = generator.buildIterationPrompt({
        iteration: 2,
        maxIterations: 5,
        previousOutcome: 'scaffold',
        testResults: makeTestResults({ failed: 0, failures: [], total: 1, passed: 1 }),
        filesInPoc: ['src/index.ts', 'tests/index.test.ts', 'package.json'],
      });

      expect(prompt).toContain('src/index.ts');
      expect(prompt).toContain('tests/index.test.ts');
    });

    it('includes MCP context when provided', () => {
      const prompt = generator.buildIterationPrompt({
        iteration: 2,
        maxIterations: 5,
        previousOutcome: 'tests-failing',
        testResults: makeTestResults(),
        filesInPoc: [],
        mcpContext: 'express@5.0.0 API docs: use app.get()',
      });

      expect(prompt).toContain('express@5.0.0 API docs');
      expect(prompt).toContain('MCP Context');
    });

    it('includes raw test output', () => {
      const prompt = generator.buildIterationPrompt({
        iteration: 2,
        maxIterations: 5,
        previousOutcome: 'tests-failing',
        testResults: makeTestResults({ rawOutput: 'FAIL tests/a.test.ts\n' }),
        filesInPoc: [],
      });

      expect(prompt).toContain('FAIL tests/a.test.ts');
    });

    it('shows "0 failing tests" task when no failures', () => {
      const prompt = generator.buildIterationPrompt({
        iteration: 3,
        maxIterations: 10,
        previousOutcome: 'tests-passing',
        testResults: makeTestResults({ passed: 3, failed: 0, failures: [], total: 3 }),
        filesInPoc: [],
      });

      expect(prompt).toContain('0 failing tests');
    });
  });

  describe('buildPromptContextSummary', () => {
    it('returns a compact summary for auditability', () => {
      const summary = generator.buildPromptContextSummary({
        iteration: 3,
        maxIterations: 10,
        previousOutcome: 'tests-failing',
        testResults: makeTestResults({ failed: 2 }),
        filesInPoc: ['src/index.ts', 'tests/index.test.ts'],
      });

      expect(summary).toContain('Iteration 3 of 10');
      expect(summary).toContain('2 failures');
      expect(summary).toContain('src/index.ts');
    });
  });

  describe('applyChanges', () => {
    it('writes parsed files to outputDir', async () => {
      const llmResponse = `\`\`\`typescript file=src/index.ts\nexport function hello() { return 'hello'; }\n\`\`\`\n`;

      await generator.applyChanges(llmResponse);

      const content = await readFile(join(tmpDir, 'src', 'index.ts'), 'utf-8');
      expect(content).toContain('export function hello()');
    });

    it('handles empty LLM response gracefully', async () => {
      const result = await generator.applyChanges('');

      expect(result.writtenFiles).toHaveLength(0);
      expect(result.dependenciesChanged).toBe(false);
    });

    it('creates parent directories for nested files', async () => {
      const llmResponse = `\`\`\`typescript file=src/utils/helper.ts\nexport function help() {}\n\`\`\`\n`;

      const result = await generator.applyChanges(llmResponse);
      expect(result.writtenFiles).toContain('src/utils/helper.ts');

      const content = await readFile(join(tmpDir, 'src', 'utils', 'helper.ts'), 'utf-8');
      expect(content).toContain('export function help()');
    });

    it('rejects paths with path traversal', async () => {
      const llmResponse = `\`\`\`typescript file=../../etc/passwd\nmalicious content\n\`\`\`\n`;

      const result = await generator.applyChanges(llmResponse);
      expect(result.writtenFiles).toHaveLength(0);
    });

    it('detects dependency changes when package.json is updated', async () => {
      const { writeFile } = await import('node:fs/promises');
      // Create initial package.json
      await writeFile(
        join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: { express: '^4.0.0' }, devDependencies: {} }),
        'utf-8',
      );

      // Update with new dependency
      const llmResponse = `\`\`\`json file=package.json\n{"dependencies":{"express":"^4.0.0","axios":"^1.0.0"},"devDependencies":{}}\n\`\`\`\n`;

      const result = await generator.applyChanges(llmResponse);
      expect(result.dependenciesChanged).toBe(true);
      expect(result.newDependencies['axios']).toBe('^1.0.0');
    });

    it('returns dependenciesChanged=false when package.json unchanged', async () => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(
        join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: { express: '^4.0.0' }, devDependencies: {} }),
        'utf-8',
      );

      // Same package.json
      const llmResponse = `\`\`\`json file=package.json\n{"dependencies":{"express":"^4.0.0"},"devDependencies":{}}\n\`\`\`\n`;

      const result = await generator.applyChanges(llmResponse);
      expect(result.dependenciesChanged).toBe(false);
    });

    it('returns writtenFiles list', async () => {
      const llmResponse = [
        '```typescript file=src/index.ts\nexport const x = 1;\n```',
        '```typescript file=tests/index.test.ts\nimport { test } from "vitest";\n```',
      ].join('\n');

      const result = await generator.applyChanges(llmResponse);
      expect(result.writtenFiles).toContain('src/index.ts');
      expect(result.writtenFiles).toContain('tests/index.test.ts');
    });
  });

  describe('getFilesInPoc', () => {
    it('returns list of files in the output directory', async () => {
      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(join(tmpDir, 'src'), { recursive: true });
      await writeFile(join(tmpDir, 'src', 'index.ts'), '', 'utf-8');
      await writeFile(join(tmpDir, 'package.json'), '{}', 'utf-8');

      const files = generator.getFilesInPoc();
      expect(files.some((f) => f.includes('index.ts'))).toBe(true);
      expect(files.some((f) => f.includes('package.json'))).toBe(true);
    });
  });
});
