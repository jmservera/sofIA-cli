/**
 * T011: Unit tests for PocScaffolder.
 *
 * Verifies scaffold creates all required files, skip-if-exists behavior,
 * and ScaffoldContext population from session.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { PocScaffolder, toKebabCase, validatePocOutput } from '../../../src/develop/pocScaffolder.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  const now = new Date().toISOString();
  return {
    sessionId: 'scaffold-test-001',
    schemaVersion: '1.0.0',
    createdAt: now,
    updatedAt: now,
    phase: 'Develop',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    ideas: [
      {
        id: 'idea-1',
        title: 'AI Route Optimizer',
        description: 'Optimize delivery routes using AI.',
        workflowStepIds: ['a1'],
      },
    ],
    selection: {
      ideaId: 'idea-1',
      selectionRationale: 'Best idea.',
      confirmedByUser: true,
    },
    plan: {
      milestones: [{ id: 'm1', title: 'Setup', items: ['Init project'] }],
      architectureNotes: 'Node.js 20 + TypeScript + Express. Use vitest for tests.',
      dependencies: ['express', 'typescript', 'vitest'],
    },
    ...overrides,
  };
}

describe('toKebabCase', () => {
  it('converts a title to kebab case', () => {
    expect(toKebabCase('AI Route Optimizer')).toBe('ai-route-optimizer');
  });

  it('removes special characters', () => {
    expect(toKebabCase('AI-Powered Delivery (Beta)')).toBe('ai-powered-delivery-beta');
  });

  it('handles leading/trailing spaces', () => {
    expect(toKebabCase('  My Project  ')).toBe('my-project');
  });

  it('truncates to 64 characters', () => {
    const long = 'a'.repeat(100);
    expect(toKebabCase(long)).toHaveLength(64);
  });
});

describe('PocScaffolder', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-scaffold-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('buildContext', () => {
    it('builds a context from a session', () => {
      const session = makeSession();
      const ctx = PocScaffolder.buildContext(session, tmpDir);

      expect(ctx.sessionId).toBe('scaffold-test-001');
      expect(ctx.projectName).toBe('ai-route-optimizer');
      expect(ctx.ideaTitle).toBe('AI Route Optimizer');
      expect(ctx.ideaDescription).toBe('Optimize delivery routes using AI.');
      expect(ctx.outputDir).toBe(tmpDir);
    });

    it('infers Express framework from architecture notes', () => {
      const session = makeSession();
      const ctx = PocScaffolder.buildContext(session, tmpDir);
      expect(ctx.techStack.framework).toBe('Express');
    });

    it('uses idea title as project name', () => {
      const session = makeSession({
        ideas: [{ id: 'idea-1', title: 'My Cool AI App', description: 'desc', workflowStepIds: [] }],
      });
      const ctx = PocScaffolder.buildContext(session, tmpDir);
      expect(ctx.projectName).toBe('my-cool-ai-app');
    });

    it('falls back gracefully when no ideas or selection', () => {
      const session = makeSession({ ideas: [], selection: undefined });
      const ctx = PocScaffolder.buildContext(session, tmpDir);
      expect(ctx.ideaTitle).toBe('AI PoC');
      expect(ctx.projectName).toBe('ai-poc');
    });
  });

  describe('scaffold', () => {
    it('creates all required files', async () => {
      const session = makeSession();
      const scaffolder = new PocScaffolder();
      const ctx = PocScaffolder.buildContext(session, tmpDir);

      const result = await scaffolder.scaffold(ctx);

      // Check all required files were created
      const requiredFiles = [
        '.gitignore',
        'package.json',
        'tsconfig.json',
        'README.md',
        'src/index.ts',
        'tests/index.test.ts',
        '.sofia-metadata.json',
      ];

      for (const file of requiredFiles) {
        const fullPath = join(tmpDir, file);
        const exists = await stat(fullPath).then(() => true).catch(() => false);
        expect(exists, `Expected ${file} to exist`).toBe(true);
      }

      expect(result.createdFiles).toContain('package.json');
      expect(result.createdFiles).toContain('README.md');
      expect(result.createdFiles).toContain('.gitignore');
      expect(result.createdFiles).toContain('.sofia-metadata.json');
    });

    it('package.json has required structure', async () => {
      const session = makeSession();
      const scaffolder = new PocScaffolder();
      const ctx = PocScaffolder.buildContext(session, tmpDir);
      await scaffolder.scaffold(ctx);

      const content = await readFile(join(tmpDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content) as Record<string, unknown>;

      expect(pkg.type).toBe('module');
      expect((pkg.scripts as Record<string, string>).test).toBe('vitest run');
      expect((pkg.scripts as Record<string, string>).build).toBeDefined();
      expect(pkg.version).toBe('0.1.0');
      expect(pkg.name).toBe('ai-route-optimizer');
    });

    it('tsconfig.json has strict TypeScript config', async () => {
      const session = makeSession();
      const scaffolder = new PocScaffolder();
      const ctx = PocScaffolder.buildContext(session, tmpDir);
      await scaffolder.scaffold(ctx);

      const content = await readFile(join(tmpDir, 'tsconfig.json'), 'utf-8');
      const tsconfig = JSON.parse(content) as {
        compilerOptions: { strict: boolean; target: string };
      };

      expect(tsconfig.compilerOptions.strict).toBe(true);
      expect(tsconfig.compilerOptions.target).toBe('ES2022');
    });

    it('.gitignore excludes node_modules, dist, coverage', async () => {
      const session = makeSession();
      const scaffolder = new PocScaffolder();
      const ctx = PocScaffolder.buildContext(session, tmpDir);
      await scaffolder.scaffold(ctx);

      const content = await readFile(join(tmpDir, '.gitignore'), 'utf-8');
      expect(content).toContain('node_modules/');
      expect(content).toContain('dist/');
      expect(content).toContain('coverage/');
    });

    it('.sofia-metadata.json links to session', async () => {
      const session = makeSession();
      const scaffolder = new PocScaffolder();
      const ctx = PocScaffolder.buildContext(session, tmpDir);
      await scaffolder.scaffold(ctx);

      const content = await readFile(join(tmpDir, '.sofia-metadata.json'), 'utf-8');
      const meta = JSON.parse(content) as Record<string, unknown>;

      expect(meta.sessionId).toBe('scaffold-test-001');
      expect(meta.featureSpec).toBe('002-poc-generation');
      expect(meta.ideaTitle).toBe('AI Route Optimizer');
      expect(meta.generatedAt).toBeDefined();
    });

    it('README.md contains idea title and session ID', async () => {
      const session = makeSession();
      const scaffolder = new PocScaffolder();
      const ctx = PocScaffolder.buildContext(session, tmpDir);
      await scaffolder.scaffold(ctx);

      const content = await readFile(join(tmpDir, 'README.md'), 'utf-8');
      expect(content).toContain('AI Route Optimizer');
      expect(content).toContain('scaffold-test-001');
    });

    it('creates src/ and tests/ directories', async () => {
      const session = makeSession();
      const scaffolder = new PocScaffolder();
      const ctx = PocScaffolder.buildContext(session, tmpDir);
      await scaffolder.scaffold(ctx);

      const srcEntries = await readdir(join(tmpDir, 'src'));
      const testEntries = await readdir(join(tmpDir, 'tests'));

      expect(srcEntries.some((f) => f.endsWith('.ts'))).toBe(true);
      expect(testEntries.some((f) => f.endsWith('.test.ts'))).toBe(true);
    });

    it('returns list of created files', async () => {
      const session = makeSession();
      const scaffolder = new PocScaffolder();
      const ctx = PocScaffolder.buildContext(session, tmpDir);
      const result = await scaffolder.scaffold(ctx);

      expect(result.createdFiles.length).toBeGreaterThan(0);
      expect(result.skippedFiles).toEqual([]);
    });
  });

  describe('skip-if-exists behavior', () => {
    it('skips package.json if it already exists (skipIfExists: true)', async () => {
      const session = makeSession();
      const scaffolder = new PocScaffolder();
      const ctx = PocScaffolder.buildContext(session, tmpDir);

      // Create a custom package.json first
      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(tmpDir, { recursive: true });
      await writeFile(
        join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'custom', scripts: { test: 'echo custom' } }),
        'utf-8',
      );

      // Scaffold should skip existing package.json
      const result = await scaffolder.scaffold(ctx);
      expect(result.skippedFiles).toContain('package.json');

      // Custom content should be preserved
      const content = await readFile(join(tmpDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content) as { name: string };
      expect(pkg.name).toBe('custom');
    });

    it('always overwrites .gitignore (skipIfExists: false)', async () => {
      const session = makeSession();
      const scaffolder = new PocScaffolder();
      const ctx = PocScaffolder.buildContext(session, tmpDir);

      // Create a custom .gitignore first
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(tmpDir, '.gitignore'), '# custom\n', 'utf-8');

      // Scaffold should overwrite .gitignore
      await scaffolder.scaffold(ctx);

      const content = await readFile(join(tmpDir, '.gitignore'), 'utf-8');
      expect(content).toContain('node_modules/'); // Generated content
    });
  });

  describe('getTemplateFiles', () => {
    it('returns list of template file paths', () => {
      const scaffolder = new PocScaffolder();
      const files = scaffolder.getTemplateFiles();
      expect(files).toContain('package.json');
      expect(files).toContain('README.md');
      expect(files).toContain('.gitignore');
      expect(files).toContain('src/index.ts');
      expect(files).toContain('tests/index.test.ts');
    });
  });
});

describe('validatePocOutput', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-validate-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns valid=true for a complete scaffold', async () => {
    const session = makeSession();
    const scaffolder = new PocScaffolder();
    const ctx = PocScaffolder.buildContext(session, tmpDir);
    await scaffolder.scaffold(ctx);

    const result = await validatePocOutput(tmpDir);
    expect(result.valid).toBe(true);
    expect(result.missingFiles).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('reports missing required files', async () => {
    const result = await validatePocOutput(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.missingFiles).toContain('package.json');
    expect(result.missingFiles).toContain('README.md');
  });

  it('reports error when package.json lacks test script', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    await mkdir(join(tmpDir, 'tests'), { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', scripts: {} }), 'utf-8');
    await writeFile(join(tmpDir, 'README.md'), '# Test', 'utf-8');
    await writeFile(join(tmpDir, 'tsconfig.json'), JSON.stringify({}), 'utf-8');
    await writeFile(join(tmpDir, '.gitignore'), 'node_modules/', 'utf-8');
    await writeFile(join(tmpDir, '.sofia-metadata.json'), JSON.stringify({ sessionId: 'x' }), 'utf-8');
    await writeFile(join(tmpDir, 'src/index.ts'), 'export function main() {}', 'utf-8');
    await writeFile(join(tmpDir, 'tests/index.test.ts'), 'import { test } from "vitest"', 'utf-8');

    const result = await validatePocOutput(tmpDir);
    expect(result.errors).toContain('package.json is missing "test" script');
  });
});

// ── Template entry construction (T036) ────────────────────────────────────

describe('PocScaffolder with TemplateEntry', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'scaffolder-template-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('uses TemplateEntry.files when constructed with a template entry (T036)', async () => {
    const { PYTHON_PYTEST_TEMPLATE } = await import('../../../src/develop/templateRegistry.js');
    const scaffolder = new PocScaffolder(PYTHON_PYTEST_TEMPLATE);

    // The template should contain Python-specific file paths
    const filePaths = scaffolder.getTemplateFiles();
    expect(filePaths).toContain('requirements.txt');
    expect(filePaths).toContain('src/main.py');
    expect(filePaths).toContain('tests/test_main.py');
    // Should NOT contain TypeScript files
    expect(filePaths).not.toContain('tsconfig.json');
    expect(filePaths).not.toContain('src/index.ts');
  });

  it('uses TemplateEntry.techStack in buildContext (T010)', async () => {
    const { PYTHON_PYTEST_TEMPLATE } = await import('../../../src/develop/templateRegistry.js');
    const session = makeSession();
    const ctx = PocScaffolder.buildContext(session, tmpDir, PYTHON_PYTEST_TEMPLATE);
    expect(ctx.techStack.language).toBe('Python');
    expect(ctx.techStack.runtime).toBe('Python 3.11');
  });

  it('falls back to default TypeScript techStack when no template entry provided', () => {
    const session = makeSession();
    const ctx = PocScaffolder.buildContext(session, tmpDir);
    expect(ctx.techStack.language).toBe('TypeScript');
    expect(ctx.techStack.runtime).toBe('Node.js 20');
  });
});

// ── T072: TODO marker scanning records totalInitial, remaining, markers ───

describe('PocScaffolder.scanAndRecordTodos (T072)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'todo-scan-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('scans scaffold files for TODO markers and records counts in .sofia-metadata.json', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');

    // Create a minimal project with TODO markers
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    await writeFile(
      join(tmpDir, 'src/index.ts'),
      '// TODO: Implement the core functionality\nexport function main() {}\n// TODO: Add error handling\n',
    );
    await writeFile(
      join(tmpDir, 'src/utils.ts'),
      'export function helper() { return 42; }\n',
    );
    await writeFile(
      join(tmpDir, '.sofia-metadata.json'),
      JSON.stringify({ sessionId: 'test-001', scaffoldedAt: new Date().toISOString() }),
    );

    const result = await PocScaffolder.scanAndRecordTodos(tmpDir);

    // Verify return value
    expect(result.totalInitial).toBe(2);
    expect(result.remaining).toBe(2);
    expect(result.markers).toHaveLength(2);
    expect(result.markers[0]).toContain('src/index.ts:1');
    expect(result.markers[0]).toContain('TODO:');
    expect(result.markers[1]).toContain('src/index.ts:3');

    // Verify .sofia-metadata.json was updated
    const metaRaw = await readFile(join(tmpDir, '.sofia-metadata.json'), 'utf-8');
    const metadata = JSON.parse(metaRaw);
    expect(metadata.todos).toBeDefined();
    expect(metadata.todos.totalInitial).toBe(2);
    expect(metadata.todos.remaining).toBe(2);
    expect(metadata.todos.markers).toHaveLength(2);
  });

  it('records zero TODOs when no markers exist', async () => {
    const { writeFile } = await import('node:fs/promises');

    await writeFile(
      join(tmpDir, 'index.ts'),
      'export function main() { return "clean"; }\n',
    );
    await writeFile(
      join(tmpDir, '.sofia-metadata.json'),
      JSON.stringify({ sessionId: 'test-002' }),
    );

    const result = await PocScaffolder.scanAndRecordTodos(tmpDir);

    expect(result.totalInitial).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.markers).toHaveLength(0);
  });
});
