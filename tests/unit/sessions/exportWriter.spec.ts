/**
 * Export writer tests (T042, T044).
 *
 * Validates that the export writer:
 * - Generates summary.json per contract
 * - Creates Markdown files for each completed phase
 * - Tracks generated files in the artifact index
 * - Handles sessions with varying completion levels
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { exportSession } from '../../../src/sessions/exportWriter.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';

function createFullSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  const now = new Date().toISOString();
  return {
    sessionId: 'export-test-session',
    schemaVersion: '1.0.0',
    createdAt: now,
    updatedAt: now,
    phase: 'Complete',
    status: 'Completed',
    participants: [{ id: 'p1', displayName: 'Alice', role: 'Facilitator' }],
    artifacts: { generatedFiles: [] },
    turns: [
      { phase: 'Discover', sequence: 1, role: 'user', content: 'We sell rockets', timestamp: now },
      { phase: 'Discover', sequence: 2, role: 'assistant', content: 'Interesting! Tell me more.', timestamp: now },
      { phase: 'Ideate', sequence: 3, role: 'user', content: 'We need better delivery', timestamp: now },
      { phase: 'Ideate', sequence: 4, role: 'assistant', content: 'Here are some ideas.', timestamp: now },
    ],
    businessContext: {
      businessDescription: 'ACME Rockets Inc.',
      challenges: ['Supply chain delays', 'Customer retention'],
    },
    workflow: {
      activities: [
        { id: 'a1', name: 'Order Processing' },
        { id: 'a2', name: 'Delivery Tracking' },
      ],
      edges: [{ fromStepId: 'a1', toStepId: 'a2' }],
    },
    ideas: [
      {
        id: 'idea-1',
        title: 'AI-Powered Delivery Tracking',
        description: 'Use AI to predict delivery times',
        workflowStepIds: ['a2'],
      },
      {
        id: 'idea-2',
        title: 'Smart Inventory Management',
        description: 'ML-based inventory optimization',
        workflowStepIds: ['a1'],
      },
    ],
    selection: {
      ideaId: 'idea-1',
      selectionRationale: 'Highest feasibility score',
      confirmedByUser: true,
      confirmedAt: now,
    },
    plan: {
      milestones: [
        { id: 'm1', title: 'Data Pipeline Setup', items: ['Set up delivery data pipeline'] },
        { id: 'm2', title: 'Model Training', items: ['Train prediction model'] },
      ],
    },
    ...overrides,
  };
}

describe('exportWriter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-export-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates summary.json with required fields', async () => {
    const session = createFullSession();
    const result = await exportSession(session, tmpDir);

    const summaryPath = join(tmpDir, 'summary.json');
    const raw = await readFile(summaryPath, 'utf-8');
    const summary = JSON.parse(raw);

    expect(summary.sessionId).toBe('export-test-session');
    expect(summary.exportedAt).toBeDefined();
    expect(summary.phase).toBe('Complete');
    expect(summary.status).toBe('Completed');
    expect(summary.files).toBeInstanceOf(Array);
    expect(summary.files.length).toBeGreaterThan(0);
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('creates Markdown files for completed phases', async () => {
    const session = createFullSession();
    await exportSession(session, tmpDir);

    const files = await readdir(tmpDir);
    expect(files).toContain('summary.json');
    expect(files).toContain('discover.md');
    // Should have at least discover and ideate based on turns
  });

  it('includes business context in discover.md', async () => {
    const session = createFullSession();
    await exportSession(session, tmpDir);

    const content = await readFile(join(tmpDir, 'discover.md'), 'utf-8');
    expect(content).toContain('ACME Rockets Inc.');
    expect(content).toContain('Supply chain delays');
  });

  it('includes ideas in ideate.md', async () => {
    const session = createFullSession();
    await exportSession(session, tmpDir);

    const content = await readFile(join(tmpDir, 'ideate.md'), 'utf-8');
    expect(content).toContain('AI-Powered Delivery Tracking');
    expect(content).toContain('Smart Inventory Management');
  });

  it('includes selection details in select.md', async () => {
    const session = createFullSession();
    await exportSession(session, tmpDir);

    const content = await readFile(join(tmpDir, 'select.md'), 'utf-8');
    expect(content).toContain('idea-1');
    expect(content).toContain('Highest feasibility score');
  });

  it('includes plan milestones in plan.md', async () => {
    const session = createFullSession();
    await exportSession(session, tmpDir);

    const content = await readFile(join(tmpDir, 'plan.md'), 'utf-8');
    expect(content).toContain('Data Pipeline Setup');
    expect(content).toContain('Model Training');
  });

  it('handles session with only Discover phase', async () => {
    const session = createFullSession({
      phase: 'Discover',
      status: 'Active',
      ideas: undefined,
      selection: undefined,
      plan: undefined,
      turns: [
        {
          phase: 'Discover', sequence: 1, role: 'user',
          content: 'We sell rockets', timestamp: new Date().toISOString(),
        },
      ],
    });

    const result = await exportSession(session, tmpDir);

    const files = await readdir(tmpDir);
    expect(files).toContain('summary.json');
    expect(files).toContain('discover.md');
    // Should not have plan.md since there's no plan data
    expect(files).not.toContain('plan.md');
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('returns ExportResult with file list', async () => {
    const session = createFullSession();
    const result = await exportSession(session, tmpDir);

    expect(result.exportDir).toBe(tmpDir);
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files.every(f => f.path && f.type)).toBe(true);
  });

  it('summary.json files paths are relative', async () => {
    const session = createFullSession();
    await exportSession(session, tmpDir);

    const raw = await readFile(join(tmpDir, 'summary.json'), 'utf-8');
    const summary = JSON.parse(raw);

    for (const file of summary.files) {
      expect(file.path).not.toContain('/');
      expect(file.path).not.toContain('\\');
    }
  });

  it('does not include secrets in exported files', async () => {
    const session = createFullSession();
    await exportSession(session, tmpDir);

    const files = await readdir(tmpDir);
    for (const file of files) {
      const content = await readFile(join(tmpDir, file), 'utf-8');
      // Should not contain typical secret patterns
      expect(content).not.toMatch(/api[_-]?key/i);
      expect(content).not.toMatch(/secret/i);
      expect(content).not.toMatch(/token/i);
      expect(content).not.toMatch(/password/i);
    }
  });
});

// ── T010: Tests for enriched generateDevelopMarkdown (Feature 002) ───────────

describe('generateDevelopMarkdown (Feature 002 enrichment)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-develop-md-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function createSessionWithPoc(overrides?: Partial<WorkshopSession>): WorkshopSession {
    const base = createFullSession();
    return {
      ...base,
      poc: {
        repoSource: 'local',
        repoPath: './poc/test-session',
        iterations: [],
        ...((overrides?.poc ?? {}) as object),
      },
      ...overrides,
    };
  }

  it('generates develop.md when poc is present', async () => {
    const session = createSessionWithPoc();
    const result = await exportSession(session, tmpDir);
    const files = await readdir(tmpDir);
    expect(files).toContain('develop.md');
    const fileEntry = result.files.find(f => f.path === 'develop.md');
    expect(fileEntry).toBeDefined();
  });

  it('does not generate develop.md when poc is absent', async () => {
    const session = createFullSession();
    // no poc field
    await exportSession(session, tmpDir);
    const files = await readdir(tmpDir);
    expect(files).not.toContain('develop.md');
  });

  it('includes repo path when repoSource is local', async () => {
    const session = createSessionWithPoc({
      poc: {
        repoSource: 'local',
        repoPath: './poc/test-session-001',
        iterations: [],
      },
    });
    await exportSession(session, tmpDir);
    const content = await readFile(join(tmpDir, 'develop.md'), 'utf-8');
    expect(content).toContain('./poc/test-session-001');
    expect(content).toContain('local');
  });

  it('includes repo URL when repoSource is github-mcp', async () => {
    const session = createSessionWithPoc({
      poc: {
        repoSource: 'github-mcp',
        repoUrl: 'https://github.com/acme/poc-route-optimizer',
        iterations: [],
      },
    });
    await exportSession(session, tmpDir);
    const content = await readFile(join(tmpDir, 'develop.md'), 'utf-8');
    expect(content).toContain('https://github.com/acme/poc-route-optimizer');
    expect(content).toContain('github-mcp');
  });

  it('includes tech stack summary', async () => {
    const session = createSessionWithPoc({
      poc: {
        repoSource: 'local',
        iterations: [],
        techStack: {
          language: 'TypeScript',
          framework: 'Express',
          testRunner: 'npm test',
          buildCommand: 'npm run build',
          runtime: 'Node.js 20',
        },
      },
    });
    await exportSession(session, tmpDir);
    const content = await readFile(join(tmpDir, 'develop.md'), 'utf-8');
    expect(content).toContain('TypeScript');
    expect(content).toContain('Express');
    expect(content).toContain('Node.js 20');
  });

  it('includes iteration timeline with outcomes', async () => {
    const session = createSessionWithPoc({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 1,
            startedAt: '2026-01-15T10:00:00Z',
            endedAt: '2026-01-15T10:01:00Z',
            outcome: 'scaffold',
            filesChanged: ['package.json', 'src/index.ts'],
            changesSummary: 'Initial scaffold generated',
          },
          {
            iteration: 2,
            startedAt: '2026-01-15T10:01:00Z',
            endedAt: '2026-01-15T10:02:00Z',
            outcome: 'tests-passing',
            filesChanged: ['src/optimizer.ts'],
            testResults: {
              passed: 3,
              failed: 0,
              skipped: 0,
              total: 3,
              durationMs: 450,
              failures: [],
            },
          },
        ],
      },
    });
    await exportSession(session, tmpDir);
    const content = await readFile(join(tmpDir, 'develop.md'), 'utf-8');
    expect(content).toContain('Iteration 1');
    expect(content).toContain('scaffold');
    expect(content).toContain('Iteration 2');
    expect(content).toContain('tests-passing');
    expect(content).toContain('package.json');
    expect(content).toContain('3 passed');
  });

  it('includes final test results', async () => {
    const session = createSessionWithPoc({
      poc: {
        repoSource: 'local',
        iterations: [],
        finalStatus: 'success',
        terminationReason: 'tests-passing',
        totalDurationMs: 60000,
        finalTestResults: {
          passed: 5,
          failed: 0,
          skipped: 1,
          total: 6,
          durationMs: 800,
          failures: [],
        },
      },
    });
    await exportSession(session, tmpDir);
    const content = await readFile(join(tmpDir, 'develop.md'), 'utf-8');
    expect(content).toContain('success');
    expect(content).toContain('tests-passing');
    expect(content).toContain('5');  // passed count
    expect(content).toContain('60.0s'); // total duration
  });

  it('includes failure details in final test results', async () => {
    const session = createSessionWithPoc({
      poc: {
        repoSource: 'local',
        iterations: [],
        finalStatus: 'failed',
        terminationReason: 'max-iterations',
        finalTestResults: {
          passed: 0,
          failed: 1,
          skipped: 0,
          total: 1,
          durationMs: 500,
          failures: [
            { testName: 'route optimizer test', message: 'Expected 3 but got 5' },
          ],
        },
      },
    });
    await exportSession(session, tmpDir);
    const content = await readFile(join(tmpDir, 'develop.md'), 'utf-8');
    expect(content).toContain('route optimizer test');
    expect(content).toContain('Expected 3 but got 5');
  });

  it('includes termination reason', async () => {
    const session = createSessionWithPoc({
      poc: {
        repoSource: 'local',
        iterations: [],
        finalStatus: 'partial',
        terminationReason: 'max-iterations',
      },
    });
    await exportSession(session, tmpDir);
    const content = await readFile(join(tmpDir, 'develop.md'), 'utf-8');
    expect(content).toContain('partial');
    expect(content).toContain('max-iterations');
  });

  it('handles error iteration with errorMessage', async () => {
    const session = createSessionWithPoc({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 2,
            startedAt: '2026-01-15T10:01:00Z',
            outcome: 'error',
            filesChanged: [],
            errorMessage: 'npm install failed: ENOTFOUND registry.npmjs.org',
          },
        ],
      },
    });
    await exportSession(session, tmpDir);
    const content = await readFile(join(tmpDir, 'develop.md'), 'utf-8');
    expect(content).toContain('error');
    expect(content).toContain('npm install failed');
  });
});
