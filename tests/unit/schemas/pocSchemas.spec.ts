/**
 * T008: Unit tests for new/extended PoC schemas (Feature 002).
 *
 * Tests TechStack, TestResults, TestFailure, extended PocIteration,
 * and extended PocDevelopmentState schemas.
 */
import { describe, it, expect } from 'vitest';

import {
  techStackSchema,
  testFailureSchema,
  testResultsSchema,
  pocIterationSchema,
  pocDevelopmentStateSchema,
} from '../../../src/shared/schemas/session.js';

// ── TechStack ────────────────────────────────────────────────────────────────

describe('techStackSchema', () => {
  it('parses a minimal valid tech stack (required fields only)', () => {
    const result = techStackSchema.safeParse({
      language: 'TypeScript',
      testRunner: 'npm test',
      runtime: 'Node.js 20',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe('TypeScript');
      expect(result.data.testRunner).toBe('npm test');
      expect(result.data.runtime).toBe('Node.js 20');
      expect(result.data.framework).toBeUndefined();
      expect(result.data.buildCommand).toBeUndefined();
    }
  });

  it('parses a full tech stack with optional fields', () => {
    const result = techStackSchema.safeParse({
      language: 'TypeScript',
      framework: 'Express',
      testRunner: 'npm test',
      buildCommand: 'npm run build',
      runtime: 'Node.js 20',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.framework).toBe('Express');
      expect(result.data.buildCommand).toBe('npm run build');
    }
  });

  it('rejects a tech stack missing required language', () => {
    const result = techStackSchema.safeParse({
      testRunner: 'npm test',
      runtime: 'Node.js 20',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a tech stack missing required testRunner', () => {
    const result = techStackSchema.safeParse({
      language: 'TypeScript',
      runtime: 'Node.js 20',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a tech stack missing required runtime', () => {
    const result = techStackSchema.safeParse({
      language: 'TypeScript',
      testRunner: 'npm test',
    });
    expect(result.success).toBe(false);
  });
});

// ── TestFailure ──────────────────────────────────────────────────────────────

describe('testFailureSchema', () => {
  it('parses a minimal test failure', () => {
    const result = testFailureSchema.safeParse({
      testName: 'route optimizer > should return shortest path',
      message: 'Expected 3 but got 5',
    });
    expect(result.success).toBe(true);
  });

  it('parses a full test failure with optional fields', () => {
    const result = testFailureSchema.safeParse({
      testName: 'route optimizer > should return shortest path',
      message: 'Expected 3 but got 5',
      expected: '3',
      actual: '5',
      file: 'tests/optimizer.test.ts',
      line: 42,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expected).toBe('3');
      expect(result.data.actual).toBe('5');
      expect(result.data.file).toBe('tests/optimizer.test.ts');
      expect(result.data.line).toBe(42);
    }
  });

  it('rejects a failure missing testName', () => {
    const result = testFailureSchema.safeParse({
      message: 'Expected 3 but got 5',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a failure missing message', () => {
    const result = testFailureSchema.safeParse({
      testName: 'route optimizer > should return shortest path',
    });
    expect(result.success).toBe(false);
  });
});

// ── TestResults ──────────────────────────────────────────────────────────────

describe('testResultsSchema', () => {
  it('parses valid test results where total = passed + failed + skipped', () => {
    const result = testResultsSchema.safeParse({
      passed: 3,
      failed: 1,
      skipped: 1,
      total: 5,
      durationMs: 1234,
      failures: [{ testName: 'test A', message: 'err' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects test results where total !== passed + failed + skipped', () => {
    const result = testResultsSchema.safeParse({
      passed: 3,
      failed: 1,
      skipped: 0,
      total: 10, // wrong
      durationMs: 1234,
      failures: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('total must equal');
    }
  });

  it('parses results with zero failures', () => {
    const result = testResultsSchema.safeParse({
      passed: 5,
      failed: 0,
      skipped: 0,
      total: 5,
      durationMs: 500,
      failures: [],
    });
    expect(result.success).toBe(true);
  });

  it('parses results with optional rawOutput', () => {
    const result = testResultsSchema.safeParse({
      passed: 1,
      failed: 0,
      skipped: 0,
      total: 1,
      durationMs: 100,
      failures: [],
      rawOutput: 'PASS  tests/index.test.ts',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rawOutput).toBe('PASS  tests/index.test.ts');
    }
  });

  it('allows rawOutput to be omitted', () => {
    const result = testResultsSchema.safeParse({
      passed: 1,
      failed: 0,
      skipped: 0,
      total: 1,
      durationMs: 100,
      failures: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rawOutput).toBeUndefined();
    }
  });

  it('handles multiple test failures', () => {
    const result = testResultsSchema.safeParse({
      passed: 0,
      failed: 2,
      skipped: 0,
      total: 2,
      durationMs: 800,
      failures: [
        { testName: 'test A', message: 'err A', file: 'tests/a.test.ts', line: 10 },
        { testName: 'test B', message: 'err B', expected: 'foo', actual: 'bar' },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.failures).toHaveLength(2);
    }
  });
});

// ── PocIteration (extended) ─────────────────────────────────────────────────

describe('pocIterationSchema (extended)', () => {
  it('parses a scaffold iteration', () => {
    const result = pocIterationSchema.safeParse({
      iteration: 1,
      startedAt: '2026-01-15T10:00:00Z',
      endedAt: '2026-01-15T10:01:00Z',
      outcome: 'scaffold',
      filesChanged: ['package.json', 'src/index.ts', 'tests/index.test.ts'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe('scaffold');
      expect(result.data.filesChanged).toHaveLength(3);
    }
  });

  it('parses a tests-passing iteration with testResults', () => {
    const result = pocIterationSchema.safeParse({
      iteration: 2,
      startedAt: '2026-01-15T10:01:00Z',
      endedAt: '2026-01-15T10:02:00Z',
      outcome: 'tests-passing',
      filesChanged: ['src/index.ts'],
      testResults: {
        passed: 3,
        failed: 0,
        skipped: 0,
        total: 3,
        durationMs: 450,
        failures: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it('parses a tests-failing iteration with failures', () => {
    const result = pocIterationSchema.safeParse({
      iteration: 3,
      startedAt: '2026-01-15T10:02:00Z',
      outcome: 'tests-failing',
      filesChanged: ['src/optimizer.ts'],
      testResults: {
        passed: 1,
        failed: 2,
        skipped: 0,
        total: 3,
        durationMs: 600,
        failures: [{ testName: 'optimizer test', message: 'wrong output' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('parses an error iteration with errorMessage', () => {
    const result = pocIterationSchema.safeParse({
      iteration: 4,
      startedAt: '2026-01-15T10:03:00Z',
      outcome: 'error',
      filesChanged: [],
      errorMessage: 'npm install failed: ENOTFOUND registry.npmjs.org',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.errorMessage).toContain('npm install failed');
    }
  });

  it('rejects invalid outcome enum value', () => {
    const result = pocIterationSchema.safeParse({
      iteration: 1,
      startedAt: '2026-01-15T10:00:00Z',
      outcome: 'unknown-outcome',
      filesChanged: [],
    });
    expect(result.success).toBe(false);
  });

  it('defaults outcome to scaffold when omitted', () => {
    const result = pocIterationSchema.safeParse({
      iteration: 1,
      startedAt: '2026-01-15T10:00:00Z',
      filesChanged: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe('scaffold');
    }
  });

  it('defaults filesChanged to empty array when omitted', () => {
    const result = pocIterationSchema.safeParse({
      iteration: 1,
      startedAt: '2026-01-15T10:00:00Z',
      outcome: 'scaffold',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filesChanged).toEqual([]);
    }
  });

  it('preserves optional testsRun field for backward compatibility', () => {
    const result = pocIterationSchema.safeParse({
      iteration: 1,
      startedAt: '2026-01-15T10:00:00Z',
      outcome: 'scaffold',
      filesChanged: [],
      testsRun: ['tests/old.spec.ts'], // legacy field
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.testsRun).toEqual(['tests/old.spec.ts']);
    }
  });

  it('parses iteration with llmPromptContext for auditability', () => {
    const result = pocIterationSchema.safeParse({
      iteration: 2,
      startedAt: '2026-01-15T10:01:00Z',
      outcome: 'tests-failing',
      filesChanged: [],
      llmPromptContext: 'Iteration 2 of 5, 2 failures, files: src/index.ts',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.llmPromptContext).toContain('Iteration 2');
    }
  });
});

// ── PocDevelopmentState (extended) ─────────────────────────────────────────

describe('pocDevelopmentStateSchema (extended)', () => {
  it('parses a minimal poc state with repoSource=local', () => {
    const result = pocDevelopmentStateSchema.safeParse({
      repoSource: 'local',
      iterations: [],
    });
    expect(result.success).toBe(true);
  });

  it('parses a poc state with repoSource=github-mcp and repoUrl', () => {
    const result = pocDevelopmentStateSchema.safeParse({
      repoSource: 'github-mcp',
      repoUrl: 'https://github.com/acme/poc-route-optimizer',
      iterations: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repoUrl).toBe('https://github.com/acme/poc-route-optimizer');
    }
  });

  it('parses a completed poc state with all fields', () => {
    const result = pocDevelopmentStateSchema.safeParse({
      repoSource: 'local',
      repoPath: './poc/fixture-session-001',
      techStack: {
        language: 'TypeScript',
        testRunner: 'npm test',
        runtime: 'Node.js 20',
      },
      iterations: [
        {
          iteration: 1,
          startedAt: '2026-01-15T10:00:00Z',
          outcome: 'scaffold',
          filesChanged: ['package.json'],
        },
      ],
      finalStatus: 'success',
      terminationReason: 'tests-passing',
      totalDurationMs: 45000,
      finalTestResults: {
        passed: 3,
        failed: 0,
        skipped: 0,
        total: 3,
        durationMs: 400,
        failures: [],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.finalStatus).toBe('success');
      expect(result.data.terminationReason).toBe('tests-passing');
    }
  });

  it('accepts finalStatus "partial" (new in Feature 002)', () => {
    const result = pocDevelopmentStateSchema.safeParse({
      repoSource: 'local',
      iterations: [],
      finalStatus: 'partial',
      terminationReason: 'max-iterations',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.finalStatus).toBe('partial');
    }
  });

  it('rejects invalid repoSource', () => {
    const result = pocDevelopmentStateSchema.safeParse({
      repoSource: 'bitbucket',
      iterations: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid terminationReason', () => {
    const result = pocDevelopmentStateSchema.safeParse({
      repoSource: 'local',
      iterations: [],
      terminationReason: 'timeout',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid finalStatus', () => {
    const result = pocDevelopmentStateSchema.safeParse({
      repoSource: 'local',
      iterations: [],
      finalStatus: 'abandoned',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing repoSource', () => {
    const result = pocDevelopmentStateSchema.safeParse({
      iterations: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid terminationReason values', () => {
    const reasons = ['tests-passing', 'max-iterations', 'user-stopped', 'error'];
    for (const reason of reasons) {
      const result = pocDevelopmentStateSchema.safeParse({
        repoSource: 'local',
        iterations: [],
        terminationReason: reason,
      });
      expect(result.success, `Expected ${reason} to be valid`).toBe(true);
    }
  });
});
