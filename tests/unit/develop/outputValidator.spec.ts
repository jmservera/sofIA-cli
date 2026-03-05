/**
 * T040: Unit tests for PoC output validator.
 *
 * Tests all 8 validation checks from poc-output contract.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { validatePocOutput } from '../../../src/develop/pocUtils.js';

describe('validatePocOutput', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-validate-poc-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function createCompleteScaffold(): Promise<void> {
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    await mkdir(join(tmpDir, 'tests'), { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-poc',
      version: '0.1.0',
      scripts: { test: 'vitest run', build: 'tsc', start: 'node dist/index.js' },
      dependencies: {},
      devDependencies: { vitest: '^3.0.0', typescript: '^5.0.0' },
    }), 'utf-8');
    await writeFile(join(tmpDir, 'README.md'), '# Test PoC\n\nA test proof of concept.', 'utf-8');
    await writeFile(join(tmpDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'Node16', strict: true },
    }), 'utf-8');
    await writeFile(join(tmpDir, '.gitignore'), 'node_modules/\ndist/\ncoverage/\n', 'utf-8');
    await writeFile(join(tmpDir, '.sofia-metadata.json'), JSON.stringify({
      sessionId: 'test-001',
      featureSpec: '002-poc-generation',
    }), 'utf-8');
    await writeFile(join(tmpDir, 'src', 'index.ts'), 'export function main() { return "ok"; }', 'utf-8');
    await writeFile(join(tmpDir, 'tests', 'index.test.ts'), 'import { test, expect } from "vitest"; test("works", () => { expect(true).toBe(true); });', 'utf-8');
  }

  it('1. validates package.json exists and has test script', async () => {
    await createCompleteScaffold();
    const result = await validatePocOutput(tmpDir);
    expect(result.valid).toBe(true);
  });

  it('2. reports missing package.json', async () => {
    await createCompleteScaffold();
    const { rm } = await import('node:fs/promises');
    await rm(join(tmpDir, 'package.json'));
    const result = await validatePocOutput(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.missingFiles).toContain('package.json');
  });

  it('3. reports missing README.md', async () => {
    await createCompleteScaffold();
    const { rm } = await import('node:fs/promises');
    await rm(join(tmpDir, 'README.md'));
    const result = await validatePocOutput(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.missingFiles).toContain('README.md');
  });

  it('4. reports missing tsconfig.json', async () => {
    await createCompleteScaffold();
    const { rm } = await import('node:fs/promises');
    await rm(join(tmpDir, 'tsconfig.json'));
    const result = await validatePocOutput(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.missingFiles).toContain('tsconfig.json');
  });

  it('5. reports missing .gitignore', async () => {
    await createCompleteScaffold();
    const { rm } = await import('node:fs/promises');
    await rm(join(tmpDir, '.gitignore'));
    const result = await validatePocOutput(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.missingFiles).toContain('.gitignore');
  });

  it('6. reports missing .sofia-metadata.json', async () => {
    await createCompleteScaffold();
    const { rm } = await import('node:fs/promises');
    await rm(join(tmpDir, '.sofia-metadata.json'));
    const result = await validatePocOutput(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.missingFiles).toContain('.sofia-metadata.json');
  });

  it('7. reports no TypeScript files in src/', async () => {
    await createCompleteScaffold();
    const { rm } = await import('node:fs/promises');
    await rm(join(tmpDir, 'src', 'index.ts'));
    const result = await validatePocOutput(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('src/'))).toBe(true);
  });

  it('8. reports no test files in tests/', async () => {
    await createCompleteScaffold();
    const { rm } = await import('node:fs/promises');
    await rm(join(tmpDir, 'tests', 'index.test.ts'));
    const result = await validatePocOutput(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('tests/'))).toBe(true);
  });

  it('reports error when package.json has no test script', async () => {
    await createCompleteScaffold();
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-poc',
      scripts: { build: 'tsc' }, // no test script
    }), 'utf-8');
    const result = await validatePocOutput(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('package.json is missing "test" script');
  });

  it('reports valid=true when all checks pass', async () => {
    await createCompleteScaffold();
    const result = await validatePocOutput(tmpDir);
    expect(result.valid).toBe(true);
    expect(result.missingFiles).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
