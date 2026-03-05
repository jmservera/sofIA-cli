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
import type { WorkshopSession, PhaseValue } from '../../../src/shared/schemas/session.js';

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

    // T063 — session naming via extractResult
    it('extractResult sets session.name when sessionName is present in LLM response', () => {
      const handler = createPhaseHandler('Discover');
      const session = makeSession();
      const response = '```json\n{"businessDescription": "Logistics Co", "challenges": ["Routing"], "sessionName": "Logistics AI Routing"}\n```';
      const result = handler.extractResult!(session, response);
      expect(result.name).toBe('Logistics AI Routing');
    });

    it('extractResult does not set session.name when sessionName is absent from LLM response', () => {
      const handler = createPhaseHandler('Discover');
      const session = makeSession();
      const response = '```json\n{"businessDescription": "Tech Co", "challenges": ["Scale"]}\n```';
      const result = handler.extractResult!(session, response);
      expect(result.name).toBeUndefined();
    });

    it('extractResult does not overwrite existing session.name (first-write-wins)', () => {
      const handler = createPhaseHandler('Discover');
      const session = makeSession({ name: 'Original Name' } as Partial<WorkshopSession>);
      const response = '```json\n{"businessDescription": "Retail Co", "challenges": ["Growth"], "sessionName": "New Name"}\n```';
      const result = handler.extractResult!(session, response);
      // Should NOT include name in updates since session already has one
      expect(result.name).toBeUndefined();
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
      const response = '```json\n{"repoSource": "local", "iterations": [{"iteration": 1, "startedAt": "2025-01-01T00:00:00Z", "outcome": "scaffold", "filesChanged": []}]}\n```';
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

  // ── T074: getInitialMessage() ──────────────────────────────────────────

  describe('getInitialMessage (T074)', () => {
    const phases: PhaseValue[] = ['Discover', 'Ideate', 'Design', 'Select', 'Plan', 'Develop'];

    it('generates phase introduction for new sessions (no turns)', () => {
      for (const phase of phases) {
        const handler = createPhaseHandler(phase);
        const session = makeSession({ phase, turns: [] });
        const msg = handler.getInitialMessage!(session);
        expect(msg).toBeDefined();
        expect(typeof msg).toBe('string');
        expect(msg!.length).toBeGreaterThan(0);
      }
    });

    it('generates progress summary for resumed sessions (existing turns)', () => {
      for (const phase of phases) {
        const handler = createPhaseHandler(phase);
        const session = makeSession({
          phase,
          turns: [
            { phase, sequence: 1, role: 'user', content: 'Previous input', timestamp: '2025-01-01T00:00:00Z' },
            { phase, sequence: 2, role: 'assistant', content: 'Previous response', timestamp: '2025-01-01T00:00:00Z' },
          ],
        });
        const msg = handler.getInitialMessage!(session);
        expect(msg).toBeDefined();
        expect(typeof msg).toBe('string');
        expect(msg!.length).toBeGreaterThan(0);
      }
    });

    it('returns different messages for new vs resumed sessions', () => {
      const handler = createPhaseHandler('Discover');
      const newSession = makeSession({ phase: 'Discover', turns: [] });
      const resumedSession = makeSession({
        phase: 'Discover',
        turns: [
          { phase: 'Discover', sequence: 1, role: 'user', content: 'hello', timestamp: '2025-01-01T00:00:00Z' },
          { phase: 'Discover', sequence: 2, role: 'assistant', content: 'hi', timestamp: '2025-01-01T00:00:00Z' },
        ],
      });

      const newMsg = handler.getInitialMessage!(newSession);
      const resumedMsg = handler.getInitialMessage!(resumedSession);
      expect(newMsg).not.toBe(resumedMsg);
    });

    it('getInitialMessage exists on all 6 phase handlers', () => {
      for (const phase of phases) {
        const handler = createPhaseHandler(phase);
        expect(typeof handler.getInitialMessage).toBe('function');
      }
    });
  });

  // T040: Verify Ideate handler uses renderSummarizedContext (not ad-hoc context)
  describe('context summarizer integration', () => {
    it('Ideate handler uses unified summarized context', async () => {
      const handler = createPhaseHandler('Ideate');
      await handler._preload();

      const session = makeSession({
        businessContext: {
          businessDescription: 'Test Company',
          challenges: ['Challenge A'],
        },
      });

      const prompt = handler.buildSystemPrompt(session);
      expect(prompt).toContain('Test Company');
      expect(prompt).toContain('Prior Phase Context');
    });

    it('Design handler uses unified summarized context with ideas', async () => {
      const handler = createPhaseHandler('Design');
      await handler._preload();

      const session = makeSession({
        ideas: [
          { id: 'idea-1', title: 'AI Bot', description: 'Smart assistant', workflowStepIds: [] },
        ],
      });

      const prompt = handler.buildSystemPrompt(session);
      expect(prompt).toContain('AI Bot');
      expect(prompt).toContain('Prior Phase Context');
    });

    it('Select handler uses unified summarized context with evaluation', async () => {
      const handler = createPhaseHandler('Select');
      await handler._preload();

      const session = makeSession({
        evaluation: {
          method: 'feasibility-value-matrix',
          ideas: [{ ideaId: 'idea-1', feasibility: 8, value: 9 }],
        },
      });

      const prompt = handler.buildSystemPrompt(session);
      expect(prompt).toContain('feasibility-value-matrix');
      expect(prompt).toContain('Prior Phase Context');
    });

    it('Plan handler uses unified summarized context with selection', async () => {
      const handler = createPhaseHandler('Plan');
      await handler._preload();

      const session = makeSession({
        selection: {
          ideaId: 'idea-1',
          selectionRationale: 'Best overall',
          confirmedByUser: true,
        },
      });

      const prompt = handler.buildSystemPrompt(session);
      expect(prompt).toContain('idea-1');
      expect(prompt).toContain('Prior Phase Context');
    });

    it('handlers omit Prior Phase Context section when session is empty', async () => {
      for (const phase of ['Ideate', 'Design', 'Select', 'Plan', 'Develop'] as PhaseValue[]) {
        const handler = createPhaseHandler(phase);
        await handler._preload();
        const prompt = handler.buildSystemPrompt(makeSession());
        // Should not contain Prior Phase Context if session is empty
        expect(prompt).not.toContain('Prior Phase Context');
      }
    });
  });
});
