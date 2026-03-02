/**
 * Session manager tests (T043).
 *
 * Validates backtracking and artifact invalidation:
 * - Moving to an earlier phase invalidates downstream artifacts
 * - Session status is correctly updated on backtrack
 * - Backtrack to same phase is a no-op
 * - Cannot backtrack to a phase after the current one
 */
import { describe, it, expect } from 'vitest';

import { backtrackSession } from '../../../src/sessions/sessionManager.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';

function createPopulatedSession(): WorkshopSession {
  const now = new Date().toISOString();
  return {
    sessionId: 'bt-session',
    schemaVersion: '1.0.0',
    createdAt: now,
    updatedAt: now,
    phase: 'Plan',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    turns: [
      { phase: 'Discover', sequence: 1, role: 'user', content: 'Business info', timestamp: now },
      { phase: 'Discover', sequence: 2, role: 'assistant', content: 'Got it', timestamp: now },
      { phase: 'Ideate', sequence: 3, role: 'user', content: 'Ideas please', timestamp: now },
      {
        phase: 'Ideate',
        sequence: 4,
        role: 'assistant',
        content: 'Here are ideas',
        timestamp: now,
      },
      { phase: 'Design', sequence: 5, role: 'user', content: 'Evaluate', timestamp: now },
      {
        phase: 'Design',
        sequence: 6,
        role: 'assistant',
        content: 'Evaluation done',
        timestamp: now,
      },
      { phase: 'Select', sequence: 7, role: 'user', content: 'Pick one', timestamp: now },
      { phase: 'Select', sequence: 8, role: 'assistant', content: 'Selected', timestamp: now },
    ],
    businessContext: {
      businessDescription: 'Test Corp',
      challenges: ['Growth'],
    },
    workflow: {
      activities: [{ id: 'a1', name: 'Activity' }],
      edges: [],
    },
    ideas: [{ id: 'i1', title: 'Idea 1', description: 'First idea', workflowStepIds: ['a1'] }],
    evaluation: {
      method: 'feasibility-value-matrix',
      ideas: [{ ideaId: 'i1', feasibility: 8, value: 9 }],
    },
    selection: {
      ideaId: 'i1',
      selectionRationale: 'Best fit',
      confirmedByUser: true,
      confirmedAt: now,
    },
    plan: {
      milestones: [{ id: 'm1', title: 'M1', items: ['First milestone'] }],
    },
  };
}

describe('sessionManager', () => {
  describe('backtrackSession', () => {
    it('backtracking to Discover invalidates all data including Discover', () => {
      const session = createPopulatedSession();
      const result = backtrackSession(session, 'Discover');

      expect(result.success).toBe(true);
      expect(result.session.phase).toBe('Discover');
      // Backtracking clears the target phase data too (will be re-run)
      expect(result.session.businessContext).toBeUndefined();
      expect(result.session.workflow).toBeUndefined();
      expect(result.session.ideas).toBeUndefined();
      expect(result.session.evaluation).toBeUndefined();
      expect(result.session.selection).toBeUndefined();
      expect(result.session.plan).toBeUndefined();
    });

    it('backtracking to Ideate preserves Discover data, clears Ideate+', () => {
      const session = createPopulatedSession();
      const result = backtrackSession(session, 'Ideate');

      expect(result.success).toBe(true);
      expect(result.session.phase).toBe('Ideate');
      // Discover data preserved
      expect(result.session.businessContext).toBeDefined();
      expect(result.session.workflow).toBeDefined();
      // Ideate and downstream cleared (Ideate is the target, so it's re-run)
      expect(result.session.ideas).toBeUndefined();
      expect(result.session.evaluation).toBeUndefined();
      expect(result.session.selection).toBeUndefined();
      expect(result.session.plan).toBeUndefined();
    });

    it('backtracking to Design clears evaluation and downstream', () => {
      const session = createPopulatedSession();
      const result = backtrackSession(session, 'Design');

      expect(result.success).toBe(true);
      expect(result.session.phase).toBe('Design');
      // Preserve Discover + Ideate
      expect(result.session.businessContext).toBeDefined();
      expect(result.session.ideas).toBeDefined();
      // Design target + downstream cleared
      expect(result.session.evaluation).toBeUndefined();
      expect(result.session.selection).toBeUndefined();
      expect(result.session.plan).toBeUndefined();
    });

    it('backtracking to Select preserves evaluation', () => {
      const session = createPopulatedSession();
      const result = backtrackSession(session, 'Select');

      expect(result.success).toBe(true);
      expect(result.session.phase).toBe('Select');
      expect(result.session.evaluation).toBeDefined();
      expect(result.session.selection).toBeUndefined();
      expect(result.session.plan).toBeUndefined();
    });

    it('backtracking to same phase is a no-op', () => {
      const session = createPopulatedSession();
      const result = backtrackSession(session, 'Plan');

      expect(result.success).toBe(true);
      expect(result.session.phase).toBe('Plan');
      // All data preserved
      expect(result.session.plan).toBeDefined();
      expect(result.session.selection).toBeDefined();
      expect(result.invalidatedPhases).toEqual([]);
    });

    it('backtracking forward fails', () => {
      const session = createPopulatedSession();
      session.phase = 'Ideate';
      const result = backtrackSession(session, 'Plan');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot backtrack forward');
    });

    it('removes turns from invalidated phases', () => {
      const session = createPopulatedSession();
      const result = backtrackSession(session, 'Ideate');

      // Only Discover turns should remain
      const turns = result.session.turns!;
      expect(turns.every((t) => t.phase === 'Discover')).toBe(true);
      expect(turns.length).toBe(2);
    });

    it('updates session status and timestamp on backtrack', () => {
      const session = createPopulatedSession();
      // Force an old timestamp
      session.updatedAt = '2020-01-01T00:00:00Z';
      const result = backtrackSession(session, 'Discover');

      expect(result.session.status).toBe('Active');
      expect(result.session.updatedAt).not.toBe('2020-01-01T00:00:00Z');
    });

    it('reports which phases were invalidated', () => {
      const session = createPopulatedSession();
      const result = backtrackSession(session, 'Ideate');

      expect(result.invalidatedPhases).toEqual(
        expect.arrayContaining(['Ideate', 'Design', 'Select', 'Plan']),
      );
    });
  });
});
