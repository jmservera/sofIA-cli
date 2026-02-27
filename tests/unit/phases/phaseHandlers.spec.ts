/**
 * Phase handler tests.
 *
 * Validates that each phase handler:
 * - Has the correct phase name
 * - Builds a system prompt that includes phase-specific content
 * - Returns references
 * - Provides extractResult and isComplete logic
 */
import { describe, it, expect } from 'vitest';

import { createPhaseHandler, getPhaseOrder, getNextPhase } from '../../../src/phases/phaseHandlers.js';
import { backtrackSession } from '../../../src/sessions/sessionManager.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';

function makeSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  return {
    sessionId: 'test-session',
    schemaVersion: '1.0.0',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    phase: 'Discover',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    ...overrides,
  };
}

describe('phaseHandlers', () => {
  describe('createPhaseHandler', () => {
    it('creates a Discover handler', async () => {
      const handler = createPhaseHandler('Discover');
      expect(handler.phase).toBe('Discover');
      await handler._preload();
      const prompt = handler.buildSystemPrompt(makeSession());
      expect(prompt).toContain('Discover');
    });

    it('creates an Ideate handler', async () => {
      const handler = createPhaseHandler('Ideate');
      expect(handler.phase).toBe('Ideate');
      await handler._preload();
      const prompt = handler.buildSystemPrompt(makeSession());
      expect(prompt.length).toBeGreaterThan(50);
    });

    it('creates a Design handler', async () => {
      const handler = createPhaseHandler('Design');
      expect(handler.phase).toBe('Design');
      await handler._preload();
      const prompt = handler.buildSystemPrompt(makeSession());
      expect(prompt.length).toBeGreaterThan(50);
    });

    it('creates a Select handler', async () => {
      const handler = createPhaseHandler('Select');
      expect(handler.phase).toBe('Select');
      await handler._preload();
      const prompt = handler.buildSystemPrompt(makeSession());
      expect(prompt.length).toBeGreaterThan(50);
    });

    it('creates a Plan handler', async () => {
      const handler = createPhaseHandler('Plan');
      expect(handler.phase).toBe('Plan');
      await handler._preload();
      const prompt = handler.buildSystemPrompt(makeSession());
      expect(prompt.length).toBeGreaterThan(50);
    });

    it('creates a Develop handler', async () => {
      const handler = createPhaseHandler('Develop');
      expect(handler.phase).toBe('Develop');
      await handler._preload();
      const prompt = handler.buildSystemPrompt(makeSession());
      expect(prompt.length).toBeGreaterThan(50);
    });
  });

  describe('Discover handler specifics', () => {
    it('includes grounding references after preload', async () => {
      const handler = createPhaseHandler('Discover');
      await handler._preload();
      const refs = handler.getReferences!(makeSession());
      expect(refs.length).toBeGreaterThan(0);
    });

    it('isComplete returns false without business context', () => {
      const handler = createPhaseHandler('Discover');
      expect(handler.isComplete!(makeSession(), '')).toBe(false);
    });

    it('isComplete returns true with business context and workflow', () => {
      const handler = createPhaseHandler('Discover');
      const session = makeSession({
        businessContext: {
          businessDescription: 'Widget Co',
          challenges: ['Growth'],
        },
        workflow: {
          activities: [{ id: 'a1', name: 'Activity 1' }],
          edges: [],
        },
      });
      expect(handler.isComplete!(session, '')).toBe(true);
    });
  });

  describe('Ideate handler specifics', () => {
    it('includes business context in prompt when available', async () => {
      const handler = createPhaseHandler('Ideate');
      await handler._preload();
      const session = makeSession({
        businessContext: {
          businessDescription: 'ACME Corp sells rockets',
          challenges: ['Supply chain delays'],
        },
      });
      const prompt = handler.buildSystemPrompt(session);
      expect(prompt).toContain('ACME Corp sells rockets');
      expect(prompt).toContain('Supply chain delays');
    });

    it('isComplete returns true when ideas exist', () => {
      const handler = createPhaseHandler('Ideate');
      const session = makeSession({
        ideas: [
          {
            id: 'i1',
            title: 'Smart Inventory',
            description: 'AI-powered inventory management',
            workflowStepIds: ['a1'],
          },
        ],
      });
      expect(handler.isComplete!(session, '')).toBe(true);
    });
  });

  describe('Select handler specifics', () => {
    it('isComplete returns true when selection is confirmed', () => {
      const handler = createPhaseHandler('Select');
      const session = makeSession({
        selection: {
          ideaId: 'i1',
          selectionRationale: 'Best fit',
          confirmedByUser: true,
          confirmedAt: '2025-01-01T00:00:00Z',
        },
      });
      expect(handler.isComplete!(session, '')).toBe(true);
    });

    it('isComplete returns false when selection not confirmed', () => {
      const handler = createPhaseHandler('Select');
      const session = makeSession({
        selection: {
          ideaId: 'i1',
          selectionRationale: 'Best fit',
          confirmedByUser: false,
        },
      });
      expect(handler.isComplete!(session, '')).toBe(false);
    });
  });

  describe('getPhaseOrder', () => {
    it('returns 6 phases in order', () => {
      const order = getPhaseOrder();
      expect(order).toEqual(['Discover', 'Ideate', 'Design', 'Select', 'Plan', 'Develop']);
    });
  });

  describe('getNextPhase', () => {
    it('returns Ideate after Discover', () => {
      expect(getNextPhase('Discover')).toBe('Ideate');
    });

    it('returns null after Develop', () => {
      expect(getNextPhase('Develop')).toBeNull();
    });

    it('returns null for Complete', () => {
      expect(getNextPhase('Complete')).toBeNull();
    });
  });

  describe('extractResult integration', () => {
    it('Discover handler extracts business context from response', () => {
      const handler = createPhaseHandler('Discover');
      const session = makeSession();
      const response = '```json\n{"businessDescription": "Tech Co", "challenges": ["Scale"]}\n```';
      const result = handler.extractResult!(session, response);
      expect(result.businessContext).toBeDefined();
      expect(result.businessContext!.businessDescription).toBe('Tech Co');
    });

    it('Ideate handler extracts ideas from response', () => {
      const handler = createPhaseHandler('Ideate');
      const session = makeSession();
      const response = '```json\n[{"id": "i1", "title": "AI Chat", "description": "Chatbot", "workflowStepIds": ["s1"]}]\n```';
      const result = handler.extractResult!(session, response);
      expect(result.ideas).toHaveLength(1);
      expect(result.ideas![0].title).toBe('AI Chat');
    });

    it('Ideate handler merges ideas without duplicates', () => {
      const handler = createPhaseHandler('Ideate');
      const session = makeSession({
        ideas: [{ id: 'i1', title: 'Existing', description: 'Already there', workflowStepIds: ['s1'] }],
      });
      const response = '```json\n[{"id": "i1", "title": "Dup", "description": "Dup", "workflowStepIds": ["s1"]}, {"id": "i2", "title": "New", "description": "New one", "workflowStepIds": ["s2"]}]\n```';
      const result = handler.extractResult!(session, response);
      expect(result.ideas).toHaveLength(2);
      expect(result.ideas![0].title).toBe('Existing');
      expect(result.ideas![1].title).toBe('New');
    });

    it('Design handler extracts evaluation from response', () => {
      const handler = createPhaseHandler('Design');
      const session = makeSession();
      const response = '```json\n{"method": "feasibility-value-matrix", "ideas": [{"ideaId": "i1", "feasibility": 4, "value": 5}]}\n```';
      const result = handler.extractResult!(session, response);
      expect(result.evaluation).toBeDefined();
      expect(result.evaluation!.method).toBe('feasibility-value-matrix');
    });

    it('Select handler extracts selection from response', () => {
      const handler = createPhaseHandler('Select');
      const session = makeSession();
      const response = '```json\n{"ideaId": "i1", "selectionRationale": "Best ROI", "confirmedByUser": true}\n```';
      const result = handler.extractResult!(session, response);
      expect(result.selection).toBeDefined();
      expect(result.selection!.ideaId).toBe('i1');
    });

    it('Plan handler extracts plan from response', () => {
      const handler = createPhaseHandler('Plan');
      const session = makeSession();
      const response = '```json\n{"milestones": [{"id": "m1", "title": "Setup", "items": ["Init repo"]}]}\n```';
      const result = handler.extractResult!(session, response);
      expect(result.plan).toBeDefined();
      expect(result.plan!.milestones).toHaveLength(1);
    });

    it('Develop handler extracts poc state from response', () => {
      const handler = createPhaseHandler('Develop');
      const session = makeSession();
      const response = '```json\n{"iterations": [{"iteration": 1, "startedAt": "2025-01-01T00:00:00Z"}]}\n```';
      const result = handler.extractResult!(session, response);
      expect(result.poc).toBeDefined();
      expect(result.poc!.iterations).toHaveLength(1);
    });

    it('returns empty object when response has no JSON', () => {
      const handler = createPhaseHandler('Discover');
      const result = handler.extractResult!(makeSession(), 'Just plain text');
      expect(result).toEqual({});
    });
  });

  describe('backtrack + recompute (T040)', () => {
    it('handlers detect cleared state as incomplete after backtrack', () => {
      // Session that completed Discover and Ideate
      const session = makeSession({
        phase: 'Design',
        businessContext: {
          businessDescription: 'ACME',
          challenges: ['Growth'],
        },
        workflow: {
          activities: [{ id: 'a1', name: 'Step 1' }],
          edges: [],
        },
        ideas: [
          { id: 'i1', title: 'Idea A', description: 'Desc', workflowStepIds: ['a1'] },
        ],
      });

      // Backtrack to Ideate: clears ideas (and anything downstream)
      const result = backtrackSession(session, 'Ideate');
      expect(result.success).toBe(true);
      const backtracked = result.session;

      const ideateHandler = createPhaseHandler('Ideate');
      // Ideas were cleared, so handler says incomplete
      expect(ideateHandler.isComplete!(backtracked, '')).toBe(false);

      // Discover data is preserved
      expect(backtracked.businessContext).toBeDefined();
    });

    it('handlers recompute fresh data after backtrack', () => {
      const session = makeSession({
        phase: 'Design',
        businessContext: {
          businessDescription: 'ACME',
          challenges: ['Growth'],
        },
        ideas: [
          { id: 'old', title: 'Old Idea', description: 'Was here', workflowStepIds: ['a1'] },
        ],
        evaluation: {
          method: 'feasibility-value-matrix',
          ideas: [{ ideaId: 'old', feasibility: 3, value: 3 }],
        },
      });

      // Backtrack to Ideate clears ideas + evaluation
      const { session: backtracked } = backtrackSession(session, 'Ideate');
      expect(backtracked.ideas).toBeUndefined();
      expect(backtracked.evaluation).toBeUndefined();

      // Re-running Ideate handler extracts fresh ideas
      const handler = createPhaseHandler('Ideate');
      const freshResponse = '```json\n[{"id": "new1", "title": "New Idea", "description": "Fresh", "workflowStepIds": ["a1"]}]\n```';
      const result = handler.extractResult!(backtracked, freshResponse);
      expect(result.ideas).toHaveLength(1);
      expect(result.ideas![0].id).toBe('new1');
    });
  });
});
