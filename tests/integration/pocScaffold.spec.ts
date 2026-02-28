/**
 * T015: Integration test for scaffold-only flow.
 *
 * Runs scaffolder with fixture session → verify output directory structure
 * matches poc-output contract → verify package.json has test script →
 * verify .sofia-metadata.json links to session.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

import { PocScaffolder, validatePocOutput } from '../../src/develop/pocScaffolder.js';
import type { WorkshopSession } from '../../src/shared/schemas/session.js';

// ── Load fixture session ──────────────────────────────────────────────────────

const require = createRequire(import.meta.url);
const fixtureSession: WorkshopSession = require('../fixtures/completedSession.json') as WorkshopSession;

describe('PoC Scaffold Integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-scaffold-integration-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates valid directory structure from fixture session', async () => {
    const scaffolder = new PocScaffolder();
    const ctx = PocScaffolder.buildContext(fixtureSession, tmpDir);
    const result = await scaffolder.scaffold(ctx);

    // Verify files were created
    expect(result.createdFiles.length).toBeGreaterThan(0);

    // Verify all required files per poc-output contract
    const requiredFiles = [
      '.gitignore',
      'README.md',
      'package.json',
      'tsconfig.json',
      '.sofia-metadata.json',
    ];

    for (const file of requiredFiles) {
      expect(existsSync(join(tmpDir, file)), `Expected ${file} to exist`).toBe(true);
    }

    // Verify src/ and tests/ directories
    expect(existsSync(join(tmpDir, 'src', 'index.ts'))).toBe(true);
    expect(existsSync(join(tmpDir, 'tests', 'index.test.ts'))).toBe(true);
  });

  it('package.json has required test script', async () => {
    const scaffolder = new PocScaffolder();
    const ctx = PocScaffolder.buildContext(fixtureSession, tmpDir);
    await scaffolder.scaffold(ctx);

    const pkgContent = await readFile(join(tmpDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgContent) as {
      name: string;
      scripts: Record<string, string>;
      type: string;
    };

    expect(pkg.scripts.test).toBeDefined();
    expect(pkg.scripts.test).toBe('vitest run');
    expect(pkg.type).toBe('module');
    expect(pkg.name).toBe('ai-powered-route-optimizer'); // from fixture
  });

  it('.sofia-metadata.json links to session', async () => {
    const scaffolder = new PocScaffolder();
    const ctx = PocScaffolder.buildContext(fixtureSession, tmpDir);
    await scaffolder.scaffold(ctx);

    const metaContent = await readFile(join(tmpDir, '.sofia-metadata.json'), 'utf-8');
    const meta = JSON.parse(metaContent) as {
      sessionId: string;
      featureSpec: string;
      ideaTitle: string;
      generatedAt: string;
    };

    expect(meta.sessionId).toBe(fixtureSession.sessionId);
    expect(meta.featureSpec).toBe('002-poc-generation');
    expect(meta.ideaTitle).toBe('AI-Powered Route Optimizer');
    expect(meta.generatedAt).toBeDefined();
  });

  it('tsconfig.json is valid JSON with strict mode', async () => {
    const scaffolder = new PocScaffolder();
    const ctx = PocScaffolder.buildContext(fixtureSession, tmpDir);
    await scaffolder.scaffold(ctx);

    const tsconfigContent = await readFile(join(tmpDir, 'tsconfig.json'), 'utf-8');
    const tsconfig = JSON.parse(tsconfigContent) as {
      compilerOptions: { strict: boolean; module: string };
    };

    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.module).toBe('Node16');
  });

  it('.gitignore contains required patterns', async () => {
    const scaffolder = new PocScaffolder();
    const ctx = PocScaffolder.buildContext(fixtureSession, tmpDir);
    await scaffolder.scaffold(ctx);

    const gitignoreContent = await readFile(join(tmpDir, '.gitignore'), 'utf-8');
    expect(gitignoreContent).toContain('node_modules/');
    expect(gitignoreContent).toContain('dist/');
    expect(gitignoreContent).toContain('coverage/');
  });

  it('README.md contains idea title and generated-by attribution', async () => {
    const scaffolder = new PocScaffolder();
    const ctx = PocScaffolder.buildContext(fixtureSession, tmpDir);
    await scaffolder.scaffold(ctx);

    const readmeContent = await readFile(join(tmpDir, 'README.md'), 'utf-8');
    expect(readmeContent).toContain('AI-Powered Route Optimizer');
    expect(readmeContent).toContain(fixtureSession.sessionId);
    expect(readmeContent).toContain('sofIA');
  });

  it('validatePocOutput returns valid=true for complete scaffold', async () => {
    const scaffolder = new PocScaffolder();
    const ctx = PocScaffolder.buildContext(fixtureSession, tmpDir);
    await scaffolder.scaffold(ctx);

    const validation = await validatePocOutput(tmpDir);

    expect(validation.valid).toBe(true);
    expect(validation.missingFiles).toHaveLength(0);
    expect(validation.errors).toHaveLength(0);
  });

  it('infers tech stack from plan architecture notes', async () => {
    const _scaffolder = new PocScaffolder();
    const ctx = PocScaffolder.buildContext(fixtureSession, tmpDir);

    // Fixture session has 'express' in architectureNotes
    expect(ctx.techStack.language).toBe('TypeScript');
    expect(ctx.techStack.runtime).toBe('Node.js 20');
    expect(ctx.techStack.framework).toBe('Express');
  });

  it('src/index.ts exports a main function', async () => {
    const scaffolder = new PocScaffolder();
    const ctx = PocScaffolder.buildContext(fixtureSession, tmpDir);
    await scaffolder.scaffold(ctx);

    const indexContent = await readFile(join(tmpDir, 'src', 'index.ts'), 'utf-8');
    expect(indexContent).toContain('export function main');
  });

  it('tests/index.test.ts contains vitest imports', async () => {
    const scaffolder = new PocScaffolder();
    const ctx = PocScaffolder.buildContext(fixtureSession, tmpDir);
    await scaffolder.scaffold(ctx);

    const testContent = await readFile(join(tmpDir, 'tests', 'index.test.ts'), 'utf-8');
    expect(testContent).toContain('vitest');
    expect(testContent).toContain('describe');
    expect(testContent).toContain('expect');
  });
});
