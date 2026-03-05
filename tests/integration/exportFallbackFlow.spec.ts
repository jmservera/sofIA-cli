/**
 * Integration test: Export fallback flow.
 *
 * Tests the full export pipeline with null structured data but present
 * conversation turns — verifies that all phase files are generated.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { exportSession } from '../../src/sessions/exportWriter.js';
import type { WorkshopSession } from '../../src/shared/schemas/session.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'sofia-export-fallback-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('export fallback flow', () => {
  it('generates 6 markdown files when all phases have turns but no structured data', async () => {
    const now = new Date().toISOString();
    const phases = ['Discover', 'Ideate', 'Design', 'Select', 'Plan', 'Develop'] as const;

    const turns = phases.flatMap((phase, i) => [
      {
        phase,
        sequence: i * 2 + 1,
        role: 'user' as const,
        content: `Tell me about the ${phase} phase`,
        timestamp: now,
      },
      {
        phase,
        sequence: i * 2 + 2,
        role: 'assistant' as const,
        content: `Here is information about the ${phase} phase.`,
        timestamp: now,
      },
    ]);

    const session: WorkshopSession = {
      sessionId: 'fallback-test',
      schemaVersion: '1.0.0',
      createdAt: now,
      updatedAt: now,
      phase: 'Complete',
      status: 'Completed',
      participants: [],
      artifacts: { generatedFiles: [] },
      turns,
      // Discover has conversation fallback built-in
      businessContext: {
        businessDescription: 'Test Company',
        challenges: ['Testing'],
      },
      // All other structured fields are null/undefined
    };

    await exportSession(session, tmpDir);

    const files = await readdir(tmpDir);
    expect(files).toContain('discover.md');
    expect(files).toContain('ideate.md');
    expect(files).toContain('design.md');
    expect(files).toContain('select.md');
    expect(files).toContain('plan.md');
    expect(files).toContain('develop.md');
    expect(files).toContain('summary.json');

    // Verify each file has conversation content
    for (const phase of phases) {
      const content = await readFile(join(tmpDir, `${phase.toLowerCase()}.md`), 'utf-8');
      expect(content).toContain('## Conversation');
    }

    // Verify summary.json lists all files
    const summaryRaw = await readFile(join(tmpDir, 'summary.json'), 'utf-8');
    const summary = JSON.parse(summaryRaw) as { files: Array<{ path: string }>; highlights?: string[] };
    const mdFiles = summary.files.filter((f) => f.path.endsWith('.md'));
    expect(mdFiles.length).toBe(6);

    // Verify highlights exist
    expect(summary.highlights).toBeDefined();
    expect(summary.highlights!.length).toBeGreaterThan(0);
  });

  it('returns null for phase with neither structured data nor turns', async () => {
    const now = new Date().toISOString();
    const session: WorkshopSession = {
      sessionId: 'empty-test',
      schemaVersion: '1.0.0',
      createdAt: now,
      updatedAt: now,
      phase: 'Discover',
      status: 'Active',
      participants: [],
      artifacts: { generatedFiles: [] },
      turns: [],
    };

    await exportSession(session, tmpDir);
    const files = await readdir(tmpDir);

    // Only summary.json should be generated — no phase files
    expect(files).toContain('summary.json');
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    expect(mdFiles).toHaveLength(0);
  });
});
