/**
 * Prompt loader tests.
 *
 * Validates that canonical prompts can be loaded, composed, and
 * that reference documents are correctly mapped to phases.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildSystemPrompt,
  getPhaseReferences,
  loadReference,
  clearPromptCache,
  listPrompts,
  listReferences,
} from '../../../src/prompts/promptLoader.js';

describe('promptLoader', () => {
  beforeEach(() => {
    clearPromptCache();
  });

  describe('buildSystemPrompt', () => {
    it('loads the base system prompt for Discover phase', async () => {
      const prompt = await buildSystemPrompt('Discover');
      expect(prompt).toContain('sofIA');
      expect(prompt).toContain('AI Discovery Workshop');
    });

    it('includes phase-specific content for Discover', async () => {
      const prompt = await buildSystemPrompt('Discover');
      expect(prompt).toContain('Understand the Business');
      expect(prompt).toContain('Choose a Topic');
      expect(prompt).toContain('Map Workflow');
    });

    it('includes phase-specific content for Ideate', async () => {
      const prompt = await buildSystemPrompt('Ideate');
      expect(prompt).toContain('AI Envisioning Cards');
      expect(prompt).toContain('Score Cards');
      expect(prompt).toContain('Generate Ideas');
    });

    it('includes phase-specific content for Design', async () => {
      const prompt = await buildSystemPrompt('Design');
      expect(prompt).toContain('Evaluate Ideas');
      expect(prompt).toContain('Feasibility');
      expect(prompt).toContain('BXT');
    });

    it('includes phase-specific content for Select', async () => {
      const prompt = await buildSystemPrompt('Select');
      expect(prompt).toContain('Rank');
      expect(prompt).toContain('Recommend');
      expect(prompt).toContain('User Confirmation');
    });

    it('includes phase-specific content for Plan', async () => {
      const prompt = await buildSystemPrompt('Plan');
      expect(prompt).toContain('milestone');
      expect(prompt).toContain('Architecture');
      expect(prompt).toContain('PoC');
    });

    it('includes phase-specific content for Develop', async () => {
      const prompt = await buildSystemPrompt('Develop');
      expect(prompt).toContain('PoC Requirements');
      expect(prompt).toContain('Success Criteria');
    });

    it('returns only system prompt for Complete phase', async () => {
      const prompt = await buildSystemPrompt('Complete');
      // Complete phase gets only the base system prompt
      expect(prompt).toContain('sofIA');
      expect(prompt).not.toContain('Understand the Business');
    });

    it('caches prompts across calls', async () => {
      const prompt1 = await buildSystemPrompt('Discover');
      const prompt2 = await buildSystemPrompt('Discover');
      expect(prompt1).toBe(prompt2);
    });
  });

  describe('getPhaseReferences', () => {
    it('returns reference paths for Discover phase', async () => {
      const refs = await getPhaseReferences('Discover');
      expect(refs.length).toBeGreaterThan(0);
      expect(refs.some((r) => r.includes('facilitator_persona'))).toBe(true);
      expect(refs.some((r) => r.includes('guardrails'))).toBe(true);
    });

    it('includes design thinking docs for Ideate phase', async () => {
      const refs = await getPhaseReferences('Ideate');
      expect(refs.some((r) => r.includes('design_thinking_persona'))).toBe(true);
      expect(refs.some((r) => r.includes('design_thinking.md'))).toBe(true);
    });

    it('includes document generator for Complete phase', async () => {
      const refs = await getPhaseReferences('Complete');
      expect(refs.some((r) => r.includes('document_generator'))).toBe(true);
    });
  });

  describe('loadReference', () => {
    it('loads facilitator persona reference', async () => {
      const content = await loadReference('facilitatorPersona');
      expect(content).toContain('AI Workshop Facilitator');
    });

    it('loads design thinking reference', async () => {
      const content = await loadReference('designThinking');
      expect(content.length).toBeGreaterThan(100);
    });

    it('loads guardrails reference', async () => {
      const content = await loadReference('guardrails');
      expect(content).toContain('Guardrails');
    });
  });

  describe('listPrompts', () => {
    it('returns all prompt names', () => {
      const prompts = listPrompts();
      expect(prompts).toContain('system');
      expect(prompts).toContain('discover');
      expect(prompts).toContain('ideate');
      expect(prompts).toContain('design');
      expect(prompts).toContain('select');
      expect(prompts).toContain('plan');
      expect(prompts).toContain('develop');
    });
  });

  describe('listReferences', () => {
    it('returns all reference document keys', () => {
      const refs = listReferences();
      expect(refs).toContain('designThinking');
      expect(refs).toContain('facilitatorPersona');
      expect(refs).toContain('guardrails');
      expect(refs).toContain('documentGenerator');
    });
  });
});
