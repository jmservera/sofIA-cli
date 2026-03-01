/**
 * Unit tests for deriveCheckpointState.
 *
 * T012: Verify correct state for no-poc, completed, partial, interrupted sessions
 * T068: Corrupted iterations cause safe fallback
 * T069: Metadata integrity mismatch triggers warning
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { deriveCheckpointState } from '../../../src/develop/checkpointState.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  const now = new Date().toISOString();
  return {
    sessionId: 'cp-test-session',
    schemaVersion: '1.0.0',
    createdAt: now,
    updatedAt: now,
    phase: 'Develop',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('deriveCheckpointState', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'checkpoint-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns fresh state when session has no poc', () => {
    const session = makeSession();
    const state = deriveCheckpointState(session, tmpDir);

    expect(state.hasPriorRun).toBe(false);
    expect(state.completedIterations).toBe(0);
    expect(state.lastIterationIncomplete).toBe(false);
    expect(state.resumeFromIteration).toBe(1);
    expect(state.canSkipScaffold).toBe(false);
    expect(state.priorFinalStatus).toBeUndefined();
    expect(state.priorIterations).toEqual([]);
  });

  it('returns fresh state when poc has empty iterations', () => {
    const session = makeSession({
      poc: { repoSource: 'local', iterations: [] },
    });
    const state = deriveCheckpointState(session, tmpDir);

    expect(state.hasPriorRun).toBe(false);
    expect(state.resumeFromIteration).toBe(1);
  });

  it('returns completed state for sessions with all iterations having testResults', () => {
    const session = makeSession({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 1,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'scaffold',
            filesChanged: [],
          },
          {
            iteration: 2,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'tests-failing',
            filesChanged: ['src/index.ts'],
            testResults: {
              passed: 1,
              failed: 1,
              skipped: 0,
              total: 2,
              durationMs: 100,
              failures: [],
            },
          },
        ],
        finalStatus: 'partial',
      },
    });

    const state = deriveCheckpointState(session, tmpDir);

    expect(state.hasPriorRun).toBe(true);
    expect(state.completedIterations).toBe(2);
    expect(state.lastIterationIncomplete).toBe(false);
    expect(state.resumeFromIteration).toBe(3);
    expect(state.priorFinalStatus).toBe('partial');
    expect(state.priorIterations).toHaveLength(2);
  });

  it('detects incomplete last iteration (no testResults, not scaffold)', () => {
    const session = makeSession({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 1,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'scaffold',
            filesChanged: [],
          },
          {
            iteration: 2,
            startedAt: new Date().toISOString(),
            outcome: 'tests-failing',
            filesChanged: [],
            // No testResults — interrupted
          },
        ],
      },
    });

    const state = deriveCheckpointState(session, tmpDir);

    expect(state.hasPriorRun).toBe(true);
    expect(state.lastIterationIncomplete).toBe(true);
    expect(state.completedIterations).toBe(1);
    expect(state.resumeFromIteration).toBe(2);
    expect(state.priorIterations).toHaveLength(1);
  });

  it('sets canSkipScaffold when metadata file exists with matching sessionId', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, '.sofia-metadata.json'),
      JSON.stringify({ sessionId: 'cp-test-session' }),
    );

    const session = makeSession({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 1,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'scaffold',
            filesChanged: [],
          },
        ],
      },
    });

    const state = deriveCheckpointState(session, tmpDir);

    expect(state.canSkipScaffold).toBe(true);
  });

  it('sets canSkipScaffold false when metadata file has mismatched sessionId (T069)', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, '.sofia-metadata.json'),
      JSON.stringify({ sessionId: 'different-session' }),
    );

    const session = makeSession({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 1,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'scaffold',
            filesChanged: [],
          },
        ],
      },
    });

    const state = deriveCheckpointState(session, tmpDir);

    expect(state.canSkipScaffold).toBe(false);
  });

  it('sets canSkipScaffold false when metadata file is corrupt JSON (T069)', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, '.sofia-metadata.json'), '{invalid json');

    const session = makeSession({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 1,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'scaffold',
            filesChanged: [],
          },
        ],
      },
    });

    const state = deriveCheckpointState(session, tmpDir);

    expect(state.canSkipScaffold).toBe(false);
  });

  it('falls back to fresh run when iterations have corrupt entries (T068)', () => {
    const session = makeSession({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 1,
            startedAt: '', // Empty string — invalid
            outcome: 'scaffold',
            filesChanged: [],
          },
        ],
      },
    });

    const state = deriveCheckpointState(session, tmpDir);

    expect(state.hasPriorRun).toBe(false);
    expect(state.resumeFromIteration).toBe(1);
  });

  it('falls back to fresh run when iteration has non-number iteration field (T068)', () => {
    const session = makeSession({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 'not a number' as unknown as number,
            startedAt: new Date().toISOString(),
            outcome: 'scaffold',
            filesChanged: [],
          },
        ],
      },
    });

    const state = deriveCheckpointState(session, tmpDir);

    expect(state.hasPriorRun).toBe(false);
    expect(state.resumeFromIteration).toBe(1);
  });

  it('returns success priorFinalStatus for successful sessions', () => {
    const session = makeSession({
      poc: {
        repoSource: 'local',
        iterations: [
          {
            iteration: 1,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'tests-passing',
            filesChanged: [],
            testResults: {
              passed: 3,
              failed: 0,
              skipped: 0,
              total: 3,
              durationMs: 100,
              failures: [],
            },
          },
        ],
        finalStatus: 'success',
      },
    });

    const state = deriveCheckpointState(session, tmpDir);

    expect(state.priorFinalStatus).toBe('success');
  });

  // ── T075: Validation — fresh vs resumed run quality comparison ────────────

  describe('fresh vs resumed run quality (T075)', () => {
    it('preserves iteration count consistency across fresh and resumed checkpoint derivations', () => {
      // Fresh session (no prior run)
      const freshSession = makeSession();
      const freshState = deriveCheckpointState(freshSession, tmpDir);
      expect(freshState.hasPriorRun).toBe(false);
      expect(freshState.resumeFromIteration).toBe(1);
      expect(freshState.completedIterations).toBe(0);

      // Session with 3 completed iterations (simulating prior run)
      const resumedSession = makeSession({
        poc: {
          iterations: [
            { iteration: 1, startedAt: '2026-01-01T12:00:00Z', endedAt: '2026-01-01T12:01:00Z', outcome: 'tests-failing', filesChanged: ['src/index.ts'], testResults: { passed: 0, failed: 1, skipped: 0, total: 1, durationMs: 100, failures: [{ testName: 'a', message: 'fail' }] } },
            { iteration: 2, startedAt: '2026-01-01T12:01:00Z', endedAt: '2026-01-01T12:02:00Z', outcome: 'tests-failing', filesChanged: ['src/index.ts'], testResults: { passed: 1, failed: 1, skipped: 0, total: 2, durationMs: 100, failures: [{ testName: 'b', message: 'fail' }] } },
            { iteration: 3, startedAt: '2026-01-01T12:02:00Z', endedAt: '2026-01-01T12:03:00Z', outcome: 'tests-passing', filesChanged: ['src/index.ts'], testResults: { passed: 2, failed: 0, skipped: 0, total: 2, durationMs: 100, failures: [] } },
          ],
          finalStatus: 'success',
          repoSource: 'local' as const,
        },
      });

      writeFileSync(
        join(tmpDir, '.sofia-metadata.json'),
        JSON.stringify({ sessionId: 'cp-test-session' }),
      );

      const resumeState = deriveCheckpointState(resumedSession, tmpDir);
      expect(resumeState.hasPriorRun).toBe(true);
      expect(resumeState.completedIterations).toBe(3);
      expect(resumeState.resumeFromIteration).toBe(4);

      // Quality validation: resumed state preserves iteration history
      expect(resumeState.priorIterations).toHaveLength(3);
      // Test pass counts increase across iterations (quality signal)
      expect(resumeState.priorIterations[0].testResults!.passed).toBe(0);
      expect(resumeState.priorIterations[2].testResults!.passed).toBe(2);
    });
  });

  // ── T076: Benchmark — resume detection overhead <500ms ────────────────────

  describe('resume detection performance (T076)', () => {
    it('deriveCheckpointState completes within 500ms even with many iterations', () => {
      // Create a session with 50 iterations to stress-test derivation
      const iterations = Array.from({ length: 50 }, (_, i) => ({
        iteration: i + 1,
        startedAt: '2026-01-01T12:00:00Z',
        endedAt: '2026-01-01T12:01:00Z',
        outcome: 'tests-failing' as const,
        filesChanged: ['src/index.ts'],
        testResults: {
          passed: i,
          failed: 50 - i,
          skipped: 0,
          total: 50,
          durationMs: 100,
          failures: [{ testName: `test-${i}`, message: 'fail' }],
        },
      }));

      const session = makeSession({
        poc: {
          iterations,
          finalStatus: 'failed',
          repoSource: 'local' as const,
        },
      });

      writeFileSync(
        join(tmpDir, '.sofia-metadata.json'),
        JSON.stringify({ sessionId: 'cp-test-session' }),
      );

      const start = performance.now();
      const state = deriveCheckpointState(session, tmpDir);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(500);
      expect(state.completedIterations).toBe(50);
      expect(state.resumeFromIteration).toBe(51);
    });
  });
});
