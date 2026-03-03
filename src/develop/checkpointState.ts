/**
 * Checkpoint State Derivation.
 *
 * Derives resume behavior from existing session state. This is a runtime-only
 * convenience type — it is NOT persisted to the session.
 *
 * Contract: specs/004-dev-resume-hardening/contracts/cli.md
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PocIteration, WorkshopSession } from '../shared/schemas/session.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CheckpointState {
  /** Whether a prior PoC run exists */
  hasPriorRun: boolean;
  /** Number of fully completed iterations (with testResults) */
  completedIterations: number;
  /** Whether the last iteration was interrupted (no testResults) */
  lastIterationIncomplete: boolean;
  /** The iteration number to resume from */
  resumeFromIteration: number;
  /** Whether scaffolding can be skipped (output dir + metadata exist) */
  canSkipScaffold: boolean;
  /** Final status from prior run, if any */
  priorFinalStatus: 'success' | 'failed' | 'partial' | undefined;
  /** Prior iterations for LLM context seeding */
  priorIterations: PocIteration[];
}

// ── Derivation ───────────────────────────────────────────────────────────────

/**
 * Derive the checkpoint state from an existing session and output directory.
 *
 * Used by `developCommand` and `RalphLoop` to decide resume behavior.
 */
export function deriveCheckpointState(
  session: WorkshopSession,
  outputDir: string,
): CheckpointState {
  const poc = session.poc;

  // No prior run
  if (!poc || !Array.isArray(poc.iterations) || poc.iterations.length === 0) {
    return {
      hasPriorRun: false,
      completedIterations: 0,
      lastIterationIncomplete: false,
      resumeFromIteration: 1,
      canSkipScaffold: false,
      priorFinalStatus: undefined,
      priorIterations: [],
    };
  }

  // Validate iteration entries — if any are corrupt, fall back to fresh run
  if (!validateIterations(poc.iterations)) {
    return {
      hasPriorRun: false,
      completedIterations: 0,
      lastIterationIncomplete: false,
      resumeFromIteration: 1,
      canSkipScaffold: false,
      priorFinalStatus: undefined,
      priorIterations: [],
    };
  }

  const lastIter = poc.iterations[poc.iterations.length - 1];
  const lastIncomplete = !lastIter.testResults && lastIter.outcome !== 'scaffold';
  const completedIters = lastIncomplete ? poc.iterations.slice(0, -1) : poc.iterations;

  const metadataPath = join(outputDir, '.sofia-metadata.json');
  const metadataExists = existsSync(metadataPath);

  // Validate metadata integrity: sessionId must match
  let canSkipScaffold = metadataExists;
  if (metadataExists) {
    try {
      const raw = readFileSync(metadataPath, 'utf-8');
      const metadata = JSON.parse(raw) as { sessionId?: string };
      if (metadata.sessionId !== session.sessionId) {
        canSkipScaffold = false;
      }
    } catch {
      canSkipScaffold = false;
    }
  }

  return {
    hasPriorRun: true,
    completedIterations: completedIters.length,
    lastIterationIncomplete: lastIncomplete,
    resumeFromIteration: completedIters.length + 1,
    canSkipScaffold,
    priorFinalStatus: poc.finalStatus,
    priorIterations: completedIters,
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate iteration entries have required fields and valid shapes.
 * Returns false if any iteration is corrupt.
 */
function validateIterations(iterations: PocIteration[]): boolean {
  for (const iter of iterations) {
    if (
      typeof iter.iteration !== 'number' ||
      typeof iter.startedAt !== 'string' ||
      !iter.startedAt
    ) {
      return false;
    }
  }
  return true;
}
