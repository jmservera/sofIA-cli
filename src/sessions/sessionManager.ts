/**
 * Session manager.
 *
 * Provides session lifecycle operations including backtracking
 * (moving to an earlier phase with deterministic invalidation
 * of downstream artifacts).
 */
import type { PhaseValue, WorkshopSession } from '../shared/schemas/session.js';
import { getPhaseOrder } from '../phases/phaseHandlers.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BacktrackResult {
  success: boolean;
  session: WorkshopSession;
  invalidatedPhases: PhaseValue[];
  error?: string;
}

// ── Phase-to-fields mapping ──────────────────────────────────────────────────

/**
 * Maps each phase to the session fields it produces.
 * When invalidating a phase, these fields are cleared.
 */
const PHASE_FIELDS: Record<string, (keyof WorkshopSession)[]> = {
  Discover: ['businessContext', 'workflow'],
  Ideate: ['ideas'],
  Design: ['evaluation'],
  Select: ['selection'],
  Plan: ['plan'],
  Develop: ['poc'],
};

// ── Backtrack ────────────────────────────────────────────────────────────────

/**
 * Backtrack a session to an earlier phase.
 *
 * This invalidates all downstream phase data (fields and turns) to ensure
 * deterministic re-computation when the phase is re-run.
 *
 * - Backtracking to the same phase is a no-op (preserves all data).
 * - Backtracking forward (to a later phase) is rejected.
 * - The target phase's fields are also cleared (since it will be re-run).
 */
export function backtrackSession(
  session: WorkshopSession,
  targetPhase: PhaseValue,
): BacktrackResult {
  const phaseOrder = getPhaseOrder();
  const currentIdx = phaseOrder.indexOf(session.phase as PhaseValue);
  const targetIdx = phaseOrder.indexOf(targetPhase);

  // Handle phases not in the order (e.g., Complete)
  const effectiveCurrentIdx = currentIdx === -1 ? phaseOrder.length : currentIdx;

  if (targetIdx === -1) {
    return {
      success: false,
      session,
      invalidatedPhases: [],
      error: `Unknown phase: ${targetPhase}`,
    };
  }

  if (targetIdx > effectiveCurrentIdx) {
    return {
      success: false,
      session,
      invalidatedPhases: [],
      error: `Cannot backtrack forward from "${session.phase}" to "${targetPhase}".`,
    };
  }

  // Same phase → no-op
  if (targetIdx === effectiveCurrentIdx) {
    return {
      success: true,
      session: { ...session },
      invalidatedPhases: [],
    };
  }

  // Collect phases to invalidate: from targetPhase to current (inclusive)
  const invalidatedPhases: PhaseValue[] = [];
  const updatedSession = { ...session };

  for (let i = targetIdx; i <= effectiveCurrentIdx && i < phaseOrder.length; i++) {
    const phase = phaseOrder[i];
    invalidatedPhases.push(phase);

    // Clear fields produced by this phase
    const fields = PHASE_FIELDS[phase] ?? [];
    for (const field of fields) {
      (updatedSession as Record<string, unknown>)[field] = undefined;
    }
  }

  // Remove turns from invalidated phases
  if (updatedSession.turns) {
    const validPhases = new Set(phaseOrder.slice(0, targetIdx));
    updatedSession.turns = updatedSession.turns.filter((t) =>
      validPhases.has(t.phase as PhaseValue),
    );
  }

  updatedSession.phase = targetPhase;
  updatedSession.status = 'Active';
  updatedSession.updatedAt = new Date().toISOString();

  return {
    success: true,
    session: updatedSession,
    invalidatedPhases,
  };
}
