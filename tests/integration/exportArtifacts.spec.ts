/**
 * Integration test: Export Artifacts (T037)
 *
 * Tests the export pipeline from session to Markdown + summary.json:
 * - Export a complete session with all phases populated
 * - Verify per-phase Markdown files are generated
 * - Verify summary.json matches contract structure
 * - Verify export handles partial sessions (only some phases done)
 * - Verify export paths and directory creation
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { WorkshopSession } from '../../src/shared/schemas/session.js';
import { exportSession } from '../../src/sessions/exportWriter.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createFullSession(): WorkshopSession {
  return {
    sessionId: 'test-export-session',
    schemaVersion: '1.0.0',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-06-15T12:00:00Z',
    phase: 'Complete',
    status: 'Completed',
    participants: [
      { id: 'p1', displayName: 'Alice', role: 'Facilitator' },
    ],
    businessContext: {
      businessDescription: 'Logistics company specializing in last-mile delivery',
      challenges: ['Route optimization is manual', 'High fuel costs'],
      constraints: ['Budget limited to $50k'],
      successMetrics: [{ name: 'Delivery time', value: '30', unit: 'minutes' }],
    },
    workflow: {
      activities: [
        { id: 'a1', name: 'Receive Order', description: 'Customer places order' },
        { id: 'a2', name: 'Plan Route', description: 'Manual route planning' },
        { id: 'a3', name: 'Deliver', description: 'Driver delivers package' },
      ],
      edges: [
        { fromStepId: 'a1', toStepId: 'a2' },
        { fromStepId: 'a2', toStepId: 'a3' },
      ],
    },
    ideas: [
      {
        id: 'i1',
        title: 'AI Route Optimizer',
        description: 'Use ML to find optimal delivery routes',
        workflowStepIds: ['a2'],
        aspirationalScope: 'Cover all urban routes',
      },
      {
        id: 'i2',
        title: 'Predictive Demand',
        description: 'Forecast delivery demand to pre-position drivers',
        workflowStepIds: ['a1', 'a2'],
      },
    ],
    evaluation: {
      method: 'feasibility-value-matrix',
      ideas: [
        { ideaId: 'i1', feasibility: 4, value: 5, risks: ['Data quality'] },
        { ideaId: 'i2', feasibility: 3, value: 4 },
      ],
    },
    selection: {
      ideaId: 'i1',
      selectionRationale: 'Highest combined feasibility + value score',
      confirmedByUser: true,
      confirmedAt: '2025-06-15T11:00:00Z',
    },
    plan: {
      milestones: [
        { id: 'm1', title: 'Data Collection', items: ['Set up telemetry', 'Collect 3 months of delivery data'] },
        { id: 'm2', title: 'Model Training', items: ['Train route model', 'Validate on historical data'] },
        { id: 'm3', title: 'Integration', items: ['API endpoint', 'Driver app integration'] },
      ],
      architectureNotes: 'Microservices with Azure Maps API',
      dependencies: ['Azure subscription', 'Historical delivery data'],
    },
    poc: {
      repoSource: 'local' as const,
      iterations: [
        {
          iteration: 1,
          startedAt: '2025-06-15T11:30:00Z',
          outcome: 'scaffold' as const,
          filesChanged: ['package.json', 'src/index.ts'],
          changesSummary: 'Initial scaffold with simple greedy routing',
        },
      ],
    },
    artifacts: { generatedFiles: [] },
    turns: [
      { phase: 'Discover', sequence: 1, role: 'user', content: 'We are a logistics company', timestamp: '2025-01-01T00:01:00Z' },
      { phase: 'Discover', sequence: 2, role: 'assistant', content: 'Understood, let me document that.', timestamp: '2025-01-01T00:02:00Z' },
      { phase: 'Ideate', sequence: 3, role: 'user', content: 'Generate ideas', timestamp: '2025-01-01T00:03:00Z' },
    ],
  };
}

function createPartialSession(): WorkshopSession {
  return {
    sessionId: 'test-partial-session',
    schemaVersion: '1.0.0',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T01:00:00Z',
    phase: 'Ideate',
    status: 'Active',
    participants: [],
    businessContext: {
      businessDescription: 'A SaaS platform',
      challenges: ['Customer churn'],
    },
    artifacts: { generatedFiles: [] },
    turns: [],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Export Artifacts Flow', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-export-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('exports a complete session with all phase Markdown files', async () => {
    const session = createFullSession();
    const exportDir = join(tmpDir, session.sessionId);
    const result = await exportSession(session, exportDir);

    expect(result.files.length).toBeGreaterThanOrEqual(6); // discover + ideate + design + select + plan + develop + summary

    const files = await readdir(exportDir);
    expect(files).toContain('summary.json');
  });

  it('generates valid summary.json matching contract', async () => {
    const session = createFullSession();
    const exportDir = join(tmpDir, session.sessionId);
    await exportSession(session, exportDir);

    const summaryRaw = await readFile(join(exportDir, 'summary.json'), 'utf-8');
    const summary = JSON.parse(summaryRaw);

    expect(summary.sessionId).toBe('test-export-session');
    expect(summary.phase).toBe('Complete');
    expect(summary.status).toBe('Completed');
    expect(summary.exportedAt).toBeDefined();
    expect(Array.isArray(summary.files)).toBe(true);
    expect(summary.files.length).toBeGreaterThan(0);
  });

  it('exports Discover markdown with business context', async () => {
    const session = createFullSession();
    const exportDir = join(tmpDir, session.sessionId);
    await exportSession(session, exportDir);

    const files = await readdir(exportDir);
    const discoverFile = files.find((f) => f.includes('discover'));
    expect(discoverFile).toBeDefined();

    const content = await readFile(join(exportDir, discoverFile!), 'utf-8');
    expect(content).toContain('Logistics company');
    expect(content).toContain('Route optimization');
  });

  it('exports Ideate markdown with ideas', async () => {
    const session = createFullSession();
    const exportDir = join(tmpDir, session.sessionId);
    await exportSession(session, exportDir);

    const files = await readdir(exportDir);
    const ideateFile = files.find((f) => f.includes('ideate'));
    expect(ideateFile).toBeDefined();

    const content = await readFile(join(exportDir, ideateFile!), 'utf-8');
    expect(content).toContain('AI Route Optimizer');
  });

  it('exports Plan markdown with milestones', async () => {
    const session = createFullSession();
    const exportDir = join(tmpDir, session.sessionId);
    await exportSession(session, exportDir);

    const files = await readdir(exportDir);
    const planFile = files.find((f) => f.includes('plan'));
    expect(planFile).toBeDefined();

    const content = await readFile(join(exportDir, planFile!), 'utf-8');
    expect(content).toContain('Data Collection');
    expect(content).toContain('Model Training');
  });

  it('handles partial session with only Discover data', async () => {
    const session = createPartialSession();
    const exportDir = join(tmpDir, session.sessionId);
    const result = await exportSession(session, exportDir);

    // Should still have at least discover markdown + summary.json
    expect(result.files.length).toBeGreaterThanOrEqual(2);

    const files = await readdir(exportDir);
    expect(files).toContain('summary.json');
    const discoverFile = files.find((f) => f.includes('discover'));
    expect(discoverFile).toBeDefined();
  });

  it('summary file list contains relative paths', async () => {
    const session = createFullSession();
    const exportDir = join(tmpDir, session.sessionId);
    await exportSession(session, exportDir);

    const summaryRaw = await readFile(join(exportDir, 'summary.json'), 'utf-8');
    const summary = JSON.parse(summaryRaw);

    for (const file of summary.files) {
      expect(file).not.toContain(tmpDir); // Should be relative, not absolute
    }
  });
});
